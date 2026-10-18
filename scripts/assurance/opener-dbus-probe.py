"""Exercise the actual patched Unix reveal module on a disposable private D-Bus."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src-tauri/vendor/tauri-plugin-opener-2.7.2/src/reveal_item_in_dir.rs"

HEADER = r'''
use std::path::{Path, PathBuf};
type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, thiserror::Error)]
enum Error {
    #[error(transparent)] Zbus(#[from] zbus::Error),
    #[error("cannot convert path to file URL")] FailedToConvertPathToFileUrl,
}
'''

HARNESS = r'''
fn log(path: &Path, text: &str) {
    use std::io::Write;
    writeln!(std::fs::OpenOptions::new().create(true).append(true).open(path).unwrap(), "{text}").unwrap();
}
struct Manager { mode: String, log: PathBuf }
#[zbus::interface(name = "org.freedesktop.FileManager1")]
impl Manager {
    fn show_items(&self, uris: Vec<String>, _startup_id: &str) -> zbus::fdo::Result<()> {
        log(&self.log, &format!("manager:{}", uris.join("|")));
        if self.mode == "success" { Ok(()) } else { Err(zbus::fdo::Error::Failed("synthetic manager denial".into())) }
    }
}
struct Portal { mode: String, log: PathBuf }
#[zbus::interface(name = "org.freedesktop.portal.Desktop")]
impl Portal {
    fn open_directory(&self, _parent: &str, uri: &str, _options: std::collections::HashMap<String, String>) -> zbus::fdo::Result<()> {
        log(&self.log, &format!("portal:{uri}"));
        if self.mode == "denied" { Err(zbus::fdo::Error::Failed("synthetic portal denial".into())) } else { Ok(()) }
    }
}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args[1] == "serve" {
        zbus::block_on(async {
            let _connection = zbus::connection::Builder::session()
                .name("org.freedesktop.FileManager1")
                .name("org.freedesktop.portal.OpenURI")
                .serve_at("/org/freedesktop/FileManager1", Manager {mode: args[2].clone(), log: args[3].clone().into()})
                .serve_at("/org/freedesktop/portal/desktop", Portal {mode: args[2].clone(), log: args[3].clone().into()})
                .build().await.unwrap();
            std::fs::write(&args[4], "ready").unwrap();
            std::future::pending::<()>().await;
        });
    } else {
        let paths: Vec<PathBuf> = args[2..].iter().map(|arg| std::fs::canonicalize(arg).unwrap()).collect();
        if let Err(error) = production::reveal_paths(&paths) {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
'''


def run():
    if not shutil.which("cargo") or not shutil.which("dbus-daemon"):
        raise RuntimeError("Required cargo/dbus-daemon unavailable; probe NOT RUN")
    # Extract production code, not a separately reimplemented reveal algorithm.
    source = SOURCE.read_text()
    start = source.index("mod imp {", source.index('target_os = "openbsd"', source.index("impl Drop")))
    end = source.index('\n#[cfg(target_os = "macos")]', start)
    module = source[start:end]
    if "zbus::block_on" not in module or "FileManager1Proxy::new" not in module:
        raise ValueError("Unexpected production module")
    cache = ROOT / ".cache/opener-maintenance"
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="dbus-probe-", dir=cache, ignore_cleanup_errors=True) as temporary:
        folder = Path(temporary)
        (folder / "src").mkdir()
        (folder / "Cargo.toml").write_text('[package]\nname="likha-opener-probe"\nversion="0.0.0"\nedition="2021"\n[dependencies]\nzbus="=6.0.0"\nurl="2"\nthiserror="2"\n')
        production = "mod production { use std::path::{Path, PathBuf};\n" + module + "\npub fn reveal_paths(paths: &[PathBuf]) -> crate::Result<()> { imp::reveal_items_in_dir(paths) }\n}\n"
        (folder / "src/main.rs").write_text(HEADER + production + HARNESS)
        build_environment = dict(os.environ)
        build_environment.setdefault("CARGO_TARGET_DIR", str(cache / "probe-target"))
        subprocess.run(["cargo", "build", "--manifest-path", str(folder / "Cargo.toml")], check=True, env=build_environment)
        binary = Path(build_environment["CARGO_TARGET_DIR"]) / "debug/likha-opener-probe"
        sample = folder / "Synthetic learner output with spaces.txt"
        sample.write_text("Synthetic content only")
        second = folder / "Another synthetic output.txt"
        second.write_text("Synthetic content only")
        bus = subprocess.Popen(["dbus-daemon", "--session", "--nofork", "--print-address"], stdout=subprocess.PIPE, text=True)
        try:
            address = bus.stdout.readline().strip()
            if not address.startswith("unix:"):
                raise RuntimeError("Private D-Bus did not start")
            environment = dict(os.environ, DBUS_SESSION_BUS_ADDRESS=address)
            for mode in ("success", "fallback", "denied"):
                log, ready = folder / f"{mode}.log", folder / f"{mode}.ready"
                server = subprocess.Popen([str(binary), "serve", mode, str(log), str(ready)], env=environment)
                try:
                    for _ in range(100):
                        if ready.exists():
                            break
                        if server.poll() is not None:
                            raise RuntimeError("Synthetic D-Bus server stopped")
                        time.sleep(0.05)
                    if not ready.exists():
                        raise RuntimeError("Synthetic D-Bus server timeout")
                    result = subprocess.run([str(binary), "reveal", str(sample), str(second)], env=environment, capture_output=True, text=True, timeout=20)
                    lines = log.read_text().splitlines()
                    assert lines[0] == f"manager:{sample.as_uri()}|{second.as_uri()}", lines
                    if mode == "success":
                        assert result.returncode == 0 and len(lines) == 1, (result, lines)
                    else:
                        assert lines[1:] == [f"portal:{sample.as_uri()}"], lines
                        assert (result.returncode == 0) == (mode == "fallback"), (result, lines)
                    print(f"opener private D-Bus {mode}: PASS", flush=True)
                finally:
                    server.terminate()
                    server.wait(timeout=10)
        finally:
            bus.terminate()
            bus.wait(timeout=10)


if __name__ == "__main__":
    run()
