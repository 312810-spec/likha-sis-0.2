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

## Next work

Revalidate restored frontend/native source and inspect Windows CI installers.
Add/verify rollback, migration-preservation and queue-over-100 regressions.
Implement real Android Keystore/startup integration before claiming Android use.
Portable encrypted backup/restore and installed-device upgrade tests are pending.

The temporary workspace reset before application edits reached GitHub; research
and the harness reset were preserved on PR101. Reconstructed edits are checkpointed
early. Previous test counts are historical until re-run on the new checkpoint.
