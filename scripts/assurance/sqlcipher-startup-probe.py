"""Linux dependency-level probe. Does not replace native app/device acceptance."""
import hashlib
import json
import pathlib
import subprocess
import tarfile
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "sqlcipher-startup-probe"
CACHE.mkdir(parents=True, exist_ok=True)
lock = tomllib.loads((ROOT / "src-tauri/Cargo.lock").read_text())
package = next(p for p in lock["package"] if p["name"] == "libsqlite3-sys")
version = package["version"]
archive = CACHE / f"libsqlite3-sys-{version}.crate"
if not archive.exists():
    subprocess.run(["curl", "-fsSL", "--max-time", "60", f"https://static.crates.io/crates/libsqlite3-sys/libsqlite3-sys-{version}.crate", "-o", str(archive)], check=True)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == package["checksum"], "pinned dependency checksum mismatch"
with tarfile.open(archive) as source:
    source.extractall(CACHE, filter="data")
bundle = CACHE / f"libsqlite3-sys-{version}" / "sqlcipher"
assert "sqlcipher_extra_init" in (bundle / "sqlite3.c").read_text()
fixtures = ROOT / "scripts/assurance/sqlcipher"
checks = []
for amplified in [False, True]:
    executable = CACHE / ("slow" if amplified else "plain")
    command = ["cc", "-O1", "-w", "-DSQLITE_THREADSAFE=1", "-DSQLITE_HAS_CODEC", "-DSQLITE_TEMP_STORE=2", "-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown", "-DHAVE_STDINT_H=1", "-I", str(bundle)]
    command += ["-DSQLITE_EXTRA_INIT=" + ("probe_extra_init" if amplified else "sqlcipher_extra_init"), str(fixtures / "parallel-open.c")]
    if amplified:
        command.append(str(fixtures / "slow-init.c"))
    command += [str(bundle / "sqlite3.c"), "-lcrypto", "-lpthread", "-ldl", "-lm", "-o", str(executable)]
    subprocess.run(command, check=True, capture_output=True, text=True)
    for initialized in [False, True]:
        for iteration in range(4 if amplified else 20):
            result = subprocess.run([str(executable)] + (["initialize"] if initialized else []), capture_output=True, text=True, timeout=30)
            data = json.loads(result.stdout)
            record = {"amplified": amplified, "initialized": initialized, "iteration": iteration + 1, "exit": result.returncode, "result": data, "stderr": result.stderr}
            checks.append(record)
            if initialized:
                assert result.returncode == 0 and data["failed"] == 0, "initialized mechanism control failed"
            elif amplified:
                assert result.returncode == 1 and data["failed"] == data["threads"] - 1 and "An error occurred with PRAGMA key or rekey" in result.stderr, "amplified negative control did not reproduce the cause"
receipt = {"class": "Actual pinned SQLCipher C library; rusqlite C-call sequence; timing-only bounded rendezvous wrapper for amplified cases. Preinitialized mechanism control is not the Rust app regression.", "crate": version, "crate_sha256": package["checksum"], "amalgamation_sha256": hashlib.sha256((bundle / "sqlite3.c").read_bytes()).hexdigest(), "checks": checks}
(CACHE / "results.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"checks": len(checks), "natural_failed_runs": sum(c["exit"] != 0 for c in checks if not c["amplified"] and not c["initialized"]), "amplified_negative_runs": 4, "initialized_failures": 0}))
