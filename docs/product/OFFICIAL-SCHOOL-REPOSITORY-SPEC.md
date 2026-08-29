# LIKHA-SIS 0.2 — Official School Repository

Status: Approved product requirement; Microsoft 365 integration requires an isolated pilot
Added: 2026-08-29

## Product decision

Add an **Official School Repository** to LIKHA-SIS for school memoranda, approved templates, reports, official generated files, and other controlled school documents.

Teachers may experience this as a OneDrive repository, but the recommended authoritative storage is a **school-owned SharePoint document library surfaced through OneDrive for work or school**. It must not be stored in the personal OneDrive of the school head, ICT coordinator, registrar, or any individual employee.

The repository is for documents. It does not replace LIKHA's local SQLite database, operational-record synchronization, audit database, or official-form generation engine.

## Recommended architecture

```text
LIKHA Windows / Android
        |
SchoolDocumentRepository port
        |
Local encrypted metadata index + authorized offline file cache
        |
Microsoft365DocumentAdapter
        |
Trusted LIKHA connector / Microsoft Graph
        |
One school-owned SharePoint document library
        |
Visible in OneDrive for work or school
```

Rules:

- No Microsoft Graph or OneDrive SDK may appear in the UI, application, or domain layers.
- Do not embed a Microsoft client secret or school-wide credential in the EXE or APK.
- Grant the integration access only to the selected school site or library using the least privilege the tenant supports.
- LIKHA authorization remains enforced at a trusted boundary; OneDrive sharing links are not a substitute for application authorization.
- Store stable Microsoft drive/item identifiers, eTags, and versions rather than treating file paths as permanent identity.
- Document uploads are online actions. Offline users may browse cached metadata, open explicitly cached files, and queue authorized uploads, with a clear pending state.

## Next-best pilot

If Microsoft 365 tenant administration or Graph consent is unavailable, pilot with a school-owned shared library synchronized through the OneDrive desktop client on the authorized Windows workstation.

LIKHA may open and monitor one explicitly configured local repository folder, but it must:

- confirm that the folder is inside the approved school library;
- never scan the user's entire OneDrive;
- keep Android integration read-only through an approved web/app link until the Graph connector is available;
- label upload and synchronization state honestly;
- remain replaceable by the full `Microsoft365DocumentAdapter`.

Do not use a staff member's personal shared folder as the production fallback.

## Repository areas

The initial library should support configurable school-owned areas such as:

- **School Memoranda and Advisories**
- **Official Templates and Blank Forms**
- **Approved School Forms and Reports**
- **Programs, Projects, and Activities**
- **Policies and Manuals**
- **Meeting Records and Issuances**
- **Archived School Years**

Folders alone are not enough. Documents should also carry searchable metadata:

- school and school year;
- document category;
- title and document/reference number;
- issuing office or owner;
- issued, effective, and uploaded dates;
- confidentiality classification;
- workflow status;
- current/superseded relationship;
- uploader, approver, and timestamps;
- provider item ID, version/eTag, and file checksum when available.

## Document lifecycle

Use an explicit lifecycle:

1. **Draft** — visible only to authorized contributors.
2. **For review** — awaiting an authorized reviewer.
3. **Official** — approved and visible to its intended audience.
4. **Superseded** — replaced by a newer official version but retained for history.
5. **Archived** — retained according to school policy and no longer active.

Only authorized publishers may mark a document **Official**. Editing an official document must create or preserve version history; it must not silently replace the evidence of what teachers previously received.

## Roles and authorization

- **Repository Administrator:** configures the school library connection, categories, retention rules, and role assignments. This should be the school head or an explicitly delegated role.
- **Publisher/Approver:** reviews and marks documents official.
- **Contributor:** uploads drafts and revisions only in assigned areas.
- **Viewer:** searches, previews, downloads, and caches only documents within their authorized audience.

Authorization requirements:

- All operations are school-scoped.
- Sensitive learner, personnel, financial, or disciplinary files require narrower collections and explicit roles.
- A teacher's ordinary access must not imply access to all restricted school records.
- Shared/public links are disabled by default for confidential collections.
- Every publish, upload, replacement, download of sensitive content, permission change, archive, and deletion is auditable where supported.
- Revoked users lose new access immediately; offline cached sensitive files follow LIKHA's local encryption, session, and device-revocation policy.

## Teacher experience

### Repository Home

- Search official documents by title, reference number, category, school year, and keyword.
- Show recently issued and frequently needed documents without dashboard-card clutter.
- Prominent **Official**, **Draft**, **Superseded**, and **Offline copy** labels.
- Filters for current school year, category, issuing office, and file type.
- Clear connection, last-refreshed, and pending-upload states.

### Document details

- Title, document number, issuing office, dates, current status, audience, uploader, approver, and version.
- Preview when safe and supported.
- Open in Microsoft 365/OneDrive, download an authorized copy, or make available offline.
- Link to the current replacement when the document is superseded.
- Warn before opening an outdated version.

### Publish flow

- Upload or select a generated LIKHA document.
- Add required metadata and audience.
- Review for learner PII and repository classification.
- Submit for approval.
- Authorized approver publishes the document.
- Preserve version, audit, and OneDrive/SharePoint identity.

### Comfort modes

- **Efficient:** dense document list, keyboard search, bulk metadata tools for authorized staff, and rapid publish workflow.
- **Comfortable:** balanced list/details layout and clear actions.
- **Guided:** larger text and controls, step-by-step upload/publish, persistent explanations, and stronger confirmation.

All modes retain the same permissions and capabilities.

## Official-form relationship

- LIKHA generates official forms locally using the approved form engine.
- Saving a generated form to the School Repository is a separate, explicit action.
- A generated file is not automatically considered approved or official merely because it was uploaded.
- The repository stores document artifacts; normalized attendance, grades, enrollment, and learner records remain in LIKHA's operational data system.
- Do not use the repository as an improvised database by repeatedly parsing Excel files.

## Offline and synchronization behavior

- Cache metadata locally so teachers can find previously synchronized documents without internet.
- Download file contents only when opened or explicitly marked for offline use.
- Encrypt cached restricted documents and remove access according to logout/device policy.
- Queue uploads with stable operation IDs and show **Waiting for internet**, **Uploading**, **Needs review**, **Conflict**, or **Published**.
- Use provider eTags/version identifiers to prevent blind overwrites.
- A conflict creates a visible new revision or asks the authorized user to resolve it; never use silent last-write-wins.
- Use Microsoft Graph delta tracking for efficient refresh once the connector is approved.

## Privacy and safety gates

Before production use:

- confirm the school has an organization-managed Microsoft 365 work/school tenant and an institution-owned site/library;
- document who can grant tenant/site consent and who owns recovery when administrators leave;
- prove least-privilege access to only the selected school repository;
- test School A/School B isolation;
- test revoked accounts, expired tokens, permission changes, deleted/restored files, concurrent edits, renamed/moved files, and compromised devices;
- verify retention, legal/DepEd records-management obligations, version-history limits, recycle-bin recovery, backup, and exit/export procedures;
- confirm where production data is stored and complete the applicable Philippine privacy review;
- never place real learner PII into development, demonstrations, screenshots, fixtures, or AI prompts.

## First implementation slice

1. Define `SchoolDocumentRepository` and fake adapter with synthetic documents.
2. Build Repository Home, search, document details, states, and all three comfort modes.
3. Add a Windows-only local OneDrive-synced-folder pilot behind a filesystem adapter.
4. Prove folder scoping, authorization, audit, offline cache encryption, and conflict behavior.
5. Run a Microsoft Graph spike against a synthetic test tenant/library.
6. Obtain explicit tenant/site consent using selected least-privilege permissions.
7. Add controlled upload, review, and publish flow.
8. Add Android repository browsing only after token storage, authorization, offline cache, and revocation tests pass.

## Acceptance criteria

- Teachers can find and open authorized official school documents from LIKHA.
- Draft and official documents cannot be confused visually.
- Only authorized approvers can publish.
- The repository is school-owned, not tied to an employee's personal OneDrive.
- The integration cannot access unrelated OneDrive or SharePoint content.
- A provider outage does not stop ordinary LIKHA work or corrupt operational records.
- Offline copies are intentional, visible, encrypted, and revocable according to the proven local-data policy.
- Renames and moves do not create duplicates because provider item IDs are stable.
- Concurrent changes never use silent last-write-wins.
- The school can export its documents and metadata without LIKHA.

## Current provider classification

- **Microsoft 365 SharePoint document library surfaced through OneDrive:** Recommended, pilot required.
- **Microsoft Graph `driveItem`, selected permissions, and delta tracking:** Pilot; promote only after tenant-consent and security testing.
- **OneDrive desktop synchronized school-library folder:** Next-best limited Windows pilot.
- **Personal OneDrive shared folder owned by an employee:** Rejected for an official repository.
- **OneDrive/SharePoint as LIKHA operational database or sync authority:** Rejected.

## Authoritative references reviewed

- Microsoft Graph: working with files across OneDrive, OneDrive for Business, and SharePoint document libraries.
- Microsoft Graph: selected permissions for restricting an app to specifically granted sites/lists/items.
- Microsoft Graph: `driveItem` identity and delta tracking.
- Microsoft Support: SharePoint/Teams libraries can be synchronized or added as shortcuts through OneDrive.
- Microsoft SharePoint: version-history limits and retention/recycle-bin behavior.

Re-check Microsoft documentation, tenant licensing, API behavior, and DepEd/privacy requirements immediately before the production pilot.
