"""Reproduce or verify the narrowly patched spreadsheet reader snapshots.

Development only. No school data, credentials or runtime network calls.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / "src-tauri" / "vendor"
PACKAGES = (
    ("calamine", "0.36.1", "5fa68281b1a76b54a62156474adb06bb380a67e07dd60656e3217152b42183f3"),
    ("umya-spreadsheet", "3.1.1", "032a20340d2eac6e2e6c940e6b793cd3b68223d5f9412724cb7e32ef17c584d0"),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"Expected exactly one compatibility patch: {old!r}")
    return text.replace(old, new)


def patch(name, relative, data):
    text = data.decode("utf-8")
    if relative == "Cargo.toml":
        # Library-only snapshots do not carry unrelated examples, benchmarks,
        # dev dependencies or binary test workbooks into the application repo.
        blocks = re.split(r"(?=^\[)", text, flags=re.MULTILINE)
        text = "".join(block for block in blocks if not block.startswith((
            "[[example]]", "[[test]]", "[[bench]]", "[dev-dependencies",
        )))
        text, count = re.subn(
            r'(\[dependencies\.zip\]\s*\nversion\s*=\s*)"8\.6(?:\.0)?"',
            r'\g<1>"9.0.3"', text,
        )
        if count != 1:
            raise ValueError(f"Missing ZIP requirement in {name}")
    elif name == "calamine" and relative == "src/utils.rs":
        text = replace_once(text,
            "pub fn build_zip_path_cache<RS: Read + Seek>(zip: &ZipArchive<RS>) -> HashMap<String, String> {",
            "pub fn build_zip_path_cache<RS: Read + Seek>(\n    zip: &ZipArchive<RS>,\n) -> zip::result::ZipResult<HashMap<String, String>> {",
        )
        text = replace_once(text, "    for zip_path in zip.file_names() {",
            "    for zip_path in zip.file_names() {\n        let zip_path = zip_path?;")
        text = replace_once(text, "    cache\n}", "    Ok(cache)\n}")
    elif name == "calamine" and relative in ("src/xlsx/mod.rs", "src/xlsb/mod.rs"):
        marker = "let zip_path_cache = build_zip_path_cache(&zip);"
        expected = 2 if relative == "src/xlsx/mod.rs" else 1
        if text.count(marker) != expected:
            raise ValueError(f"Unexpected cache call sites: {relative}")
        text = text.replace(marker, "let zip_path_cache = build_zip_path_cache(&zip)?;", 1)
        if expected == 2:
            # This second call belongs to an upstream #[test], not a reader.
            text = text.replace(marker, "let zip_path_cache = build_zip_path_cache(&zip).unwrap();", 1)
    elif name == "umya-spreadsheet" and relative == "src/reader/driver.rs":
        text = replace_once(text, "Ok(f) => f.name().to_owned(),", "Ok(f) => f.name()?.into_owned(),")
    return text.encode("utf-8")


def generate():
    if any((ROOT / f"{name}-{version}").exists() for name, version, _ in PACKAGES):
        raise ValueError("Snapshot directories already exist; use --verify. Refusing to overwrite.")
    records = []
    retained = {"Cargo.toml", "Cargo.toml.orig", "README.md", "LICENSE", "LICENSE-MIT.md", "Changelog.md", "CHANGELOG.md", ".cargo_vcs_info.json"}
    for name, version, checksum in PACKAGES:
        url = f"https://crates.io/api/v1/crates/{name}/{version}/download"
        request = urllib.request.Request(url, headers={"User-Agent": "LIKHA-SIS reproducible compatibility snapshot"})
        archive_bytes = urllib.request.urlopen(request, timeout=60).read()
        if digest(archive_bytes) != checksum:
            raise ValueError(f"Archive checksum mismatch: {name}")
        prefix = f"{name}-{version}/"
        files = {}
        changes = []
        with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
            for member in archive.getmembers():
                if not member.name.startswith(prefix):
                    raise ValueError("Unexpected archive root")
                relative = member.name[len(prefix):]
                if not member.isfile() or not (relative.startswith("src/") or relative in retained):
                    continue
                target = (ROOT / prefix / relative).resolve()
                if not target.is_relative_to((ROOT / prefix).resolve()):
                    raise ValueError("Archive path escapes snapshot")
                upstream = archive.extractfile(member).read()
                patched = patch(name, relative, upstream)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(patched)
                files[relative] = digest(patched)
                if patched != upstream:
                    changes.append({"path": relative, "upstreamSha256": digest(upstream), "patchedSha256": digest(patched)})
        records.append({"name": name, "version": version, "archiveUrl": url, "archiveSha256": checksum, "changes": changes, "files": files})
    (ROOT / "provenance.json").write_text(json.dumps({"format": 1, "zipVersion": "9.0.3", "packages": records}, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    verify()


def verify():
    provenance = json.loads((ROOT / "provenance.json").read_text(encoding="utf-8"))
    if provenance["format"] != 1 or provenance["zipVersion"] != "9.0.3":
        raise ValueError("Unexpected provenance format or ZIP target")
    expected = {(name, version): checksum for name, version, checksum in PACKAGES}
    if {(item["name"], item["version"]): item["archiveSha256"] for item in provenance["packages"]} != expected:
        raise ValueError("Provenance does not match pinned upstream packages")
    count = 0
    for package in provenance["packages"]:
        directory = ROOT / f"{package['name']}-{package['version']}"
        actual = {p.relative_to(directory).as_posix(): digest(p.read_bytes()) for p in directory.rglob("*") if p.is_file()}
        if actual != package["files"]:
            raise ValueError(f"Snapshot changed or contains unrecorded files: {package['name']}")
        count += len(actual)
    print(f"Spreadsheet snapshots verified: {count} files, two pinned upstream archives, ZIP 9.0.3")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Offline inventory/hash check; writes nothing")
    arguments = parser.parse_args()
    verify() if arguments.verify else generate()
