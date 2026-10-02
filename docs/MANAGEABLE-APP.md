# A manageable LIKHA-SIS pilot

LIKHA-SIS is a Windows app for school records, assigned classes, attendance,
assessment scores, grade review and supported spreadsheet/form exports. It saves
locally first. A school hub receives queued changes when devices reconnect.

## Start small

Use one synthetic school, one Windows hub and two teacher accounts. Assign a
Grade 10 Mathematics class and a TLE-ICT class with a short synthetic roster.
Record attendance and a quiz offline, close/reopen the app, inspect the saved
records, reconnect and review an intentional concurrent correction. Export and
open the supported report to check its totals.

Sync Status distinguishes work saved on the device from work transferred to the
hub. Refresh checks recorded evidence; it does not start a transfer. Keep the hub
open and reachable on the school network. Rejected incoming records remain in
Review Sync Conflicts: correct a duplicate/reference problem and retry, or
explicitly dismiss the incoming record.

Choosing an incoming version replaces this record's local version and cancels
its superseded queued edits. Unrelated queued work stays intact. An unsuccessful
choice leaves the local record, queue and review available for retry.

## What is proven and what remains

The frontend suite, latest-browser workflow/accessibility smoke, native tests
and Clippy pass on the restored implementation. Key failure/reopen and legacy
password-hash upgrades are tested. Windows installer CI and installed-device
validation remain separate; see TASK.md for current evidence.

A compiled installer needs an installed-device check, including standard-user
startup, offline operation, upgrades and reopening real persisted data.
Spreadsheet exports are readable records, not a portable encrypted database/key
backup. Portable backup/recovery is now implemented; use Devices to create a backup
and the first-run screen to recover on a replacement Windows installation. See
[the recovery guide](PORTABLE-BACKUP.md). Installed-device recovery remains a pilot check.

Android is not yet a usable app. The platform key-store boundary is prepared,
but real Android Keystore protection and native startup integration are still
required. Encrypted SQLCipher startup, force-stop recovery, foreground sync,
signed upgrade and Android native-library compatibility need actual build/device
evidence. Browser phone layout checks do not prove Android support.
