# Current task

Updated: 2026-10-02.

## Goal

Make the Windows teacher app manageable and establish a real Android path.
Use current stable tools and preserve teacher work during sync failures.

## Restored implementation

- Full-queue entity conflict checks.
- Retained encrypted rejected incoming records and explicit human review.
- Atomic pull application/version/cursor updates and atomic review resolution.
- Clear local-save vs hub-transfer status with manual/foreground refresh.
- Correct camelCase preview serialization and selected extra entity previews.
- Platform key-store adapter boundary; Android is still unsupported.
- Latest stable npm/Rust dependencies and Windows installer artifact CI.

## Verified on restored source

- Latest Node 26.10/npm 12.2 frontend quality: 126 files, 1,184 tests pass.
- Playwright 1.63 / Chrome Headless Shell 153.0.8010.12 workflow and accessibility
  smoke passes, zero findings. Exact bundled browser fetched from official Google
  storage when the CDN download was unreliable.
- Full native Rust tests pass, including integration suites; new key reopen,
  failed-key preservation and legacy Argon2 hash regressions pass.
- Rust formatting and Clippy all-targets with warnings denied pass.
- Security CI is green after updating the vulnerable brace-expansion dependency.
- Windows installer build/native tests/artifact upload run in PR101 CI.

## Remaining work

Check final Windows CI and exercise its installer on a Windows device.
Implement real Android Keystore/startup integration before claiming Android use.
Portable encrypted backup/restore and installed-device upgrade tests are pending.
The teacher pilot guide is docs/MANAGEABLE-APP.md.

Application edits and test checkpoints are now saved on PR101. The first workspace
reset is recorded as history; verification above was rerun on restored source.
