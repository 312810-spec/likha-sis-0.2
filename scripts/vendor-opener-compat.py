"""Reproduce/verify the explicit opener compatibility snapshot. Development only."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / "src-tauri" / "vendor"
VERSION = "2.7.2"
NAME = "tauri-plugin-opener"
CHECKSUM = "53810be1b4fed22bb6ac3f4cab5a2b80d9391d1af436bda145607532bc0bb219"
URL = f"https://static.crates.io/crates/{NAME}/{NAME}-{VERSION}.crate"
TARGET = ROOT / f"{NAME}-{VERSION}"
RECEIPT = ROOT / "opener-provenance.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"Expected exactly one patch target: {old!r}")
    return text.replace(old, new)


def patch(relative, data):
    text = data.decode("utf-8")
    if relative == "Cargo.toml":
        marker = "[target.'cfg(any(target_os = \"linux\", target_os = \"dragonfly\", target_os = \"freebsd\", target_os = \"netbsd\", target_os = \"openbsd\"))'.dependencies.zbus]\nversion = \"5.9\""
        text = replace_once(text, marker, marker.replace('"5.9"', '"6.0.0"'))
    elif relative == "src/reveal_item_in_dir.rs":
        start = text.index("    fn reveal_items_in_dir_blocking(")
        end = text.index("\n    fn reveal_with_filemanager1(", start)
        text = text[:start] + '''    fn reveal_items_in_dir_blocking(paths: &[PathBuf]) -> crate::Result<()> {
        // zbus 6 removed its blocking facade. Keep upstream's dedicated
        // thread and drive the asynchronous connection/proxies there.
        zbus::block_on(async {
            let connection = zbus::Connection::session().await?;
            match reveal_with_filemanager1(paths, &connection).await {
                Ok(()) => Ok(()),
                Err(error) => match paths.first() {
                    Some(path) => reveal_with_open_uri_portal(path, &connection).await,
                    None => Err(error),
                },
            }
        })
    }
''' + text[end:]
        text = replace_once(text, "    fn reveal_with_filemanager1(", "    async fn reveal_with_filemanager1(")
        text = replace_once(text, "    fn reveal_with_open_uri_portal(", "    async fn reveal_with_open_uri_portal(")
        if text.count("&zbus::blocking::Connection") != 2:
            raise ValueError("Unexpected upstream connection types")
        text = text.replace("&zbus::blocking::Connection", "&zbus::Connection")
        text = replace_once(text, "FileManager1ProxyBlocking::new(connection)?", "FileManager1Proxy::new(connection).await?")
        text = replace_once(text, 'proxy.ShowItems(uri_strs, "")', 'proxy.ShowItems(uri_strs, "").await')
        text = replace_once(text, "PortalDesktopProxyBlocking::new(connection)?", "PortalDesktopProxy::new(connection).await?")
        text = replace_once(text, 'proxy.OpenDirectory("", uri.as_str(), HashMap::new())', 'proxy.OpenDirectory("", uri.as_str(), HashMap::new()).await')
    return text.encode()


def generate(archive_path=None):
    if TARGET.exists() or RECEIPT.exists():
        raise ValueError("Snapshot already exists; use --verify. Refusing to overwrite.")
    if archive_path:
        archive_bytes = Path(archive_path).read_bytes()
    else:
        request = urllib.request.Request(URL, headers={"User-Agent": "LIKHA-SIS compatibility snapshot"})
        archive_bytes = urllib.request.urlopen(request, timeout=60).read()
    if digest(archive_bytes) != CHECKSUM:
        raise ValueError("Archive SHA256 mismatch")
    files, changes = {}, []
    prefix = f"{NAME}-{VERSION}/"
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
        for member in archive.getmembers():
            if not member.name.startswith(prefix):
                raise ValueError("Unexpected archive root")
            relative = member.name[len(prefix):]
            # This package's own lock is not used by the application resolver.
            # The app's committed lock remains scanned without exclusions.
            if member.isdir() or relative == "Cargo.lock":
                continue
            if not member.isfile():
                raise ValueError("Non-file archive member")
            upstream_relative = relative
            if relative == "LICENSE.spdx":
                relative = "LICENSE-SPDX-notice.txt"
            target = (TARGET / relative).resolve()
            if not target.is_relative_to(TARGET.resolve()):
                raise ValueError("Archive path escapes snapshot")
            original = archive.extractfile(member).read()
            result = patch(upstream_relative, original)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(result)
            files[relative] = digest(result)
            if result != original:
                changes.append({"path": relative, "upstreamSha256": digest(original), "patchedSha256": digest(result)})
    if {entry["path"] for entry in changes} != {"Cargo.toml", "src/reveal_item_in_dir.rs"}:
        raise ValueError("Unexpected patch set")
    receipt = {"format": 2, "name": NAME, "version": VERSION, "archiveUrl": URL,
               "archiveSha256": CHECKSUM, "zbusRequirement": "6.0.0", "changes": changes,
               "pathMappings": {"LICENSE-SPDX-notice.txt": "LICENSE.spdx"},
               "files": [{"path": path, "sha256": checksum} for path, checksum in sorted(files.items())]}
    RECEIPT.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    verify()


def verify():
    receipt = json.loads(RECEIPT.read_text())
    if (receipt["format"], receipt["name"], receipt["version"], receipt["archiveUrl"],
        receipt["archiveSha256"], receipt["zbusRequirement"]) != (2, NAME, VERSION, URL, CHECKSUM, "6.0.0"):
        raise ValueError("Unexpected provenance identity")
    files = {path.relative_to(TARGET).as_posix(): digest(path.read_bytes()) for path in TARGET.rglob("*") if path.is_file()}
    expected_files = {entry["path"]: entry["sha256"] for entry in receipt["files"]}
    if len(expected_files) != len(receipt["files"]) or receipt["pathMappings"] != {"LICENSE-SPDX-notice.txt": "LICENSE.spdx"}:
        raise ValueError("Unexpected inventory or license mapping")
    if files != expected_files:
        raise ValueError("Snapshot inventory/hash mismatch")
    if not {"LICENSE_APACHE-2.0", "LICENSE_MIT", "src/scope.rs", "src/commands.rs", "build.rs"}.issubset(files):
        raise ValueError("Missing license, permission or build source")
    changes = receipt["changes"]
    if {entry["path"] for entry in changes} != {"Cargo.toml", "src/reveal_item_in_dir.rs"}:
        raise ValueError("Unexpected compatibility changes")
    if any(files[entry["path"]] != entry["patchedSha256"] for entry in changes):
        raise ValueError("Patched file receipt mismatch")
    print(f"opener provenance PASS: {len(files)} files, exact upstream2.7.2 / zbus6 compatibility snapshot")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--archive", help="Optional already-downloaded archive; same mandatory SHA256")
    args = parser.parse_args()
    verify() if args.verify else generate(args.archive)
