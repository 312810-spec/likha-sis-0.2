# PM-13 reporting preview — verified CI and integration receipt

24 October 2026, Asia/Manila. Source-bound execution evidence for PR163. The structured record below separates the initial failing security gate, the combined checked candidate, actual native/browser results and external limits. All required candidate gates passed before the integration merge. Native negative-control failures are expected assertions against pinned old production bodies, followed by exact source restoration.

```text
{
  "project": "LIKHA-SIS",
  "date": "2026-10-24",
  "timezone": "Asia/Manila",
  "scope": "PM-13 reporting preview R1–R5 plus required security prerequisite S1",
  "base": "7ad600fe2ef03445ab38a652a539273e48370c71",
  "initialUiHead": "fc7ce1c750d691c0596b72f4cff0ff7d327793ff",
  "initialUiQuality": "40095919498 PASS; native/Windows skipped",
  "initialUiSecurity": "40095919479 FAIL: five advisories in three baseline transitive packages",
  "checkedHead": "b001f58bd46852cec01866340d5596d3f0abbe12",
  "checkedTree": "f8420f1ffb6b2dba254d1b8ccec516b190fc8b48",
  "ciMerge": "3287dc5f0072fdd9c1f085a4319b7744eb71c7c5",
  "actualMerge": "93f7bc95253a423a64d79e8b144e4bf24d0ee9f6",
  "actualMergeTree": "f8420f1ffb6b2dba254d1b8ccec516b190fc8b48",
  "ciRuns": {
    "workflow_runs": [
      {
        "id": 40096416842,
        "name": "Security Gate",
        "status": "completed",
        "conclusion": "success",
        "run_number": 1636,
        "jobs_url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/runs/40096416842/jobs",
        "logs_url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/runs/40096416842/logs",
        "workflow_id": 342872406
      },
      {
        "id": 40096416825,
        "name": "Quality Gate",
        "status": "completed",
        "conclusion": "success",
        "run_number": 1117,
        "jobs_url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/runs/40096416825/jobs",
        "logs_url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/runs/40096416825/logs",
        "workflow_id": 342524866
      }
    ]
  },
  "qualityJobs": {
    "jobs": [
      {
        "id": 120879507707,
        "name": "Quality / classify affected work",
        "status": "completed",
        "conclusion": "success",
        "run_id": 40096416825,
        "logs_url": null,
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1
          },
          {
            "name": "Checkout full history for diff classification",
            "status": "completed",
            "conclusion": "success",
            "number": 2
          },
          {
            "name": "Determine changed files",
            "status": "completed",
            "conclusion": "success",
            "number": 3
          },
          {
            "name": "Verify classifier behavior",
            "status": "completed",
            "conclusion": "success",
            "number": 4
          },
          {
            "name": "Classify affected work",
            "status": "completed",
            "conclusion": "success",
            "number": 5
          },
          {
            "name": "Post Checkout full history for diff classification",
            "status": "completed",
            "conclusion": "success",
            "number": 10
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 11
          }
        ]
      },
      {
        "id": 120879540859,
        "name": "Quality (Windows)",
        "status": "completed",
        "conclusion": "success",
        "run_id": 40096416825,
        "logs_url": null,
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1
          },
          {
            "name": "Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 2
          },
          {
            "name": "Set up Node.js",
            "status": "completed",
            "conclusion": "success",
            "number": 3
          },
          {
            "name": "Confirm Rust toolchain is present",
            "status": "completed",
            "conclusion": "success",
            "number": 4
          },
          {
            "name": "Update npm to current stable",
            "status": "completed",
            "conclusion": "success",
            "number": 5
          },
          {
            "name": "Install Node dependencies",
            "status": "completed",
            "conclusion": "success",
            "number": 6
          },
          {
            "name": "Verify spreadsheet compatibility source provenance",
            "status": "completed",
            "conclusion": "success",
            "number": 7
          },
          {
            "name": "Verify opener compatibility source provenance",
            "status": "completed",
            "conclusion": "success",
            "number": 8
          },
          {
            "name": "Build the Windows-native Tauri application",
            "status": "completed",
            "conclusion": "success",
            "number": 9
          },
          {
            "name": "Test native Windows behavior",
            "status": "completed",
            "conclusion": "success",
            "number": 10
          },
          {
            "name": "Upload Windows test installers",
            "status": "completed",
            "conclusion": "success",
            "number": 11
          },
          {
            "name": "Post Set up Node.js",
            "status": "completed",
            "conclusion": "success",
            "number": 21
          },
          {
            "name": "Post Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 22
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 23
          }
        ]
      },
      {
        "id": 120879540919,
        "name": "Quality (Ubuntu)",
        "status": "completed",
        "conclusion": "success",
        "run_id": 40096416825,
        "logs_url": null,
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1
          },
          {
            "name": "Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 2
          },
          {
            "name": "Set up Node.js",
            "status": "completed",
            "conclusion": "success",
            "number": 3
          },
          {
            "name": "Update npm to current stable",
            "status": "completed",
            "conclusion": "success",
            "number": 4
          },
          {
            "name": "Install Node dependencies",
            "status": "completed",
            "conclusion": "success",
            "number": 5
          },
          {
            "name": "Run documentation formatting gate",
            "status": "completed",
            "conclusion": "skipped",
            "number": 6
          },
          {
            "name": "Verify harness contract",
            "status": "completed",
            "conclusion": "success",
            "number": 7
          },
          {
            "name": "Run JavaScript and TypeScript quality gate",
            "status": "completed",
            "conclusion": "success",
            "number": 8
          },
          {
            "name": "Install Chromium for deterministic UI verification",
            "status": "completed",
            "conclusion": "success",
            "number": 9
          },
          {
            "name": "Run UI workflow and accessibility smoke gate",
            "status": "completed",
            "conclusion": "success",
            "number": 10
          },
          {
            "name": "Verify UX recovery journeys",
            "status": "completed",
            "conclusion": "success",
            "number": 11
          },
          {
            "name": "Verify pre-React appearance in development and production",
            "status": "completed",
            "conclusion": "success",
            "number": 12
          },
          {
            "name": "Upload appearance startup verification receipts",
            "status": "completed",
            "conclusion": "success",
            "number": 13
          },
          {
            "name": "Upload UI verification screenshots",
            "status": "completed",
            "conclusion": "success",
            "number": 14
          },
          {
            "name": "Install Tauri Linux build dependencies",
            "status": "completed",
            "conclusion": "success",
            "number": 15
          },
          {
            "name": "Confirm Rust toolchain is present",
            "status": "completed",
            "conclusion": "success",
            "number": 16
          },
          {
            "name": "Verify spreadsheet compatibility source provenance",
            "status": "completed",
            "conclusion": "success",
            "number": 17
          },
          {
            "name": "Verify opener compatibility source provenance",
            "status": "completed",
            "conclusion": "success",
            "number": 18
          },
          {
            "name": "Verify cold SQLCipher initialization mechanism",
            "status": "completed",
            "conclusion": "success",
            "number": 19
          },
          {
            "name": "Run native Rust quality gate",
            "status": "completed",
            "conclusion": "success",
            "number": 20
          },
          {
            "name": "Exercise opener compatibility on a private synthetic D-Bus",
            "status": "completed",
            "conclusion": "success",
            "number": 21
          },
          {
            "name": "Verify bounded score native baseline negative controls",
            "status": "completed",
            "conclusion": "success",
            "number": 22
          },
          {
            "name": "Post Set up Node.js",
            "status": "completed",
            "conclusion": "success",
            "number": 43
          },
          {
            "name": "Post Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 44
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 45
          }
        ]
      }
    ]
  },
  "securityJobs": {
    "jobs": [
      {
        "id": 120879507724,
        "name": "Security / gitleaks",
        "status": "completed",
        "conclusion": "success",
        "run_id": 40096416842,
        "logs_url": null,
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1
          },
          {
            "name": "Checkout (full history)",
            "status": "completed",
            "conclusion": "success",
            "number": 2
          },
          {
            "name": "Run gitleaks",
            "status": "completed",
            "conclusion": "success",
            "number": 3
          },
          {
            "name": "Post Checkout (full history)",
            "status": "completed",
            "conclusion": "success",
            "number": 6
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 7
          }
        ]
      },
      {
        "id": 120879507905,
        "name": "Security / cargo-deny",
        "status": "completed",
        "conclusion": "success",
        "run_id": 40096416842,
        "logs_url": null,
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1
          },
          {
            "name": "Build EmbarkStudios/cargo-deny-action@3c6349835b2b7b196a839186cb8b78e02f7b5f25",
            "status": "completed",
            "conclusion": "success",
            "number": 2
          },
          {
            "name": "Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 3
          },
          {
            "name": "Run cargo-deny",
            "status": "completed",
            "conclusion": "success",
            "number": 4
          },
          {
            "name": "Post Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 8
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 9
          }
        ]
      },
      {
        "id": 120879507925,
        "name": "Security / osv-scanner",
        "status": "completed",
        "conclusion": "success",
        "run_id": 40096416842,
        "logs_url": null,
        "steps": [
          {
            "name": "Set up job",
            "status": "completed",
            "conclusion": "success",
            "number": 1
          },
          {
            "name": "Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 2
          },
          {
            "name": "Download and verify osv-scanner v2.6.0 (linux_amd64)",
            "status": "completed",
            "conclusion": "success",
            "number": 3
          },
          {
            "name": "Run osv-scanner",
            "status": "completed",
            "conclusion": "success",
            "number": 4
          },
          {
            "name": "Post Checkout",
            "status": "completed",
            "conclusion": "success",
            "number": 8
          },
          {
            "name": "Complete job",
            "status": "completed",
            "conclusion": "success",
            "number": 9
          }
        ]
      }
    ]
  },
  "native": {
    "ubuntu": 1542,
    "windows": 1551,
    "ctutils": "Both platforms compiled0.4.5; no app-lock resolution updates in application build/test gate",
    "negativeControls": {
      "baseline": "ac4c3add56fb7a0677f1a0f745bf1de816ea55ee",
      "grade_baseline": "de3c691dcce810fda88204cc0101a242c5fd30a5",
      "grade_seam_baseline": "6f580f056cc5286d1a0174f4f5a4d1a80334bf61",
      "grade_baseline_command_body_sha256": "d1c4e6ba5bda44a2824147fea15563806a61bfcd72aee841720660eaa4694a14",
      "evidence": "Native cargo assertions against pinned pre-fix production bodies with candidate tests/fixtures",
      "source_restored": true,
      "candidate_sources": {
        "src-tauri/src/commands/learner_score.rs": "717bab2f5259d04e08cc87e40a6cd0e3d9ee030e7a0fcb7fa2274018a2f7ed5b",
        "src-tauri/src/repository/learner_score.rs": "a6359ed086f5f9928b5a15cbc7359429bee61ecae9184cd6e6a1e88f6ef2317f"
      },
      "results": [
        {
          "case": "command_rejects_unassigned_same_school_teacher_without_writing",
          "kind": "write",
          "baseline_failed_as_expected": true
        },
        {
          "case": "command_local_correction_failure_rolls_back_history",
          "kind": "write",
          "baseline_failed_as_expected": true
        },
        {
          "case": "grade_read_rejects_unassigned_same_school_teacher",
          "kind": "grade",
          "baseline_failed_as_expected": true
        },
        {
          "case": "grade_read_rechecks_assignment_replacement_for_existing_session",
          "kind": "grade",
          "baseline_failed_as_expected": true
        },
        {
          "case": "grade_read_rechecks_school_head_role_revocation",
          "kind": "grade",
          "baseline_failed_as_expected": true
        }
      ]
    }
  },
  "artifacts": {
    "artifacts": [
      {
        "id": 12561751898,
        "name": "likha-sis-windows-test-installers",
        "size_in_bytes": 22956531,
        "url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/artifacts/12561751898",
        "archive_download_url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/artifacts/12561751898/zip",
        "expired": false,
        "created_at": "2026-10-24T13:26:30Z",
        "expires_at": "2026-11-07T13:26:27Z",
        "updated_at": "2026-10-24T13:26:30Z",
        "digest": "sha256:8f32a14e1121911d0fe8e683ea620920d4bc8244327b2725a24e6e1725ceb282",
        "workflow_run": {
          "id": 40096416825,
          "repository_id": 1344185717,
          "head_repository_id": 1344185717,
          "head_branch": "forge/reporting-preview-state-20261024",
          "head_sha": "b001f58bd46852cec01866340d5596d3f0abbe12"
        }
      },
      {
        "id": 12561027902,
        "name": "likha-sis-ui-verification",
        "size_in_bytes": 939352,
        "url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/artifacts/12561027902",
        "archive_download_url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/artifacts/12561027902/zip",
        "expired": false,
        "created_at": "2026-10-24T13:05:15Z",
        "expires_at": "2026-10-31T13:05:14Z",
        "updated_at": "2026-10-24T13:05:15Z",
        "digest": "sha256:73ecacdc0a68d2cd90835478681fa072d1ac7004f89d8ca52260fb5fef993633",
        "workflow_run": {
          "id": 40096416825,
          "repository_id": 1344185717,
          "head_repository_id": 1344185717,
          "head_branch": "forge/reporting-preview-state-20261024",
          "head_sha": "b001f58bd46852cec01866340d5596d3f0abbe12"
        }
      },
      {
        "id": 12560694130,
        "name": "likha-sis-appearance-startup-verification",
        "size_in_bytes": 1332,
        "url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/artifacts/12560694130",
        "archive_download_url": "https://api.github.com/repos/312810-spec/likha-sis-0.2/actions/artifacts/12560694130/zip",
        "expired": false,
        "created_at": "2026-10-24T13:05:13Z",
        "expires_at": "2026-10-31T13:05:13Z",
        "updated_at": "2026-10-24T13:05:13Z",
        "digest": "sha256:338d42fa5e311d823d2be85b54b412469b6889c5375ebb6c831615455ad6cc70",
        "workflow_run": {
          "id": 40096416825,
          "repository_id": 1344185717,
          "head_repository_id": 1344185717,
          "head_branch": "forge/reporting-preview-state-20261024",
          "head_sha": "b001f58bd46852cec01866340d5596d3f0abbe12"
        }
      }
    ]
  },
  "local": {
    "focused": "PASS138 tests/2 files; seven added regressions",
    "quality": "PASS1699 tests/161 files after npm ci on patched lock",
    "browser": "PASS36 configurations/108 states on b001f58; source hashes verified",
    "scores": "PASS47 observations refreshed on patched lock",
    "build": "PASS",
    "isolation": "PASS21 files",
    "ui": "PASS",
    "recovery": "PASS50",
    "cargo": "NOT RUN locally: unavailable"
  },
  "browserSources": {
    "src/ui/ReportCardReadinessPanel.tsx": "6804cf36263a5ef81e4f1cca67d8858d1984cfa06f20dbfa999a713abf87b056",
    "src/ui/ReportCardReadinessPanel.test.tsx": "cae51d3b1298a49d7ecb34a0c47fe188559a8048d99329074e72e149f0c6ae4d",
    "src/ui/ClassRecordWorkspace.tsx": "2520abee273a9ef17cca4b5db17c367985767a7315809f01a8d31bfd0d9dfa4b",
    "src/ui/ClassRecordWorkspace.test.tsx": "0b84d685d6d74c9645c42fb62afb3fdb5f96500ac8e974c5409b63675d831a6e",
    "src/ui/theme/styles.css": "3486a53c6d13bc4045ebe46f9b6c6d42d3196dfcb59c65136269eca16110ca03",
    "scripts/assurance/reporting-preview-state-browser.mjs": "10ceca5971cc3f06bd0f76b69c3b585f035089615e891c07d86e80dc8373616c"
  },
  "browserRawEvidence": "Initial full36-case browser receipt retained in evidence JSON; same panel/probe/style source hashes. Refreshed b001f58 run PASS36/108 observed and source equality verified before executor loss; renewed raw local receipt inaccessible during outage. No case values fabricated or relabeled.",
  "diagnostics": [
    "Initial browser selector expected correction-only on-device text before entering correction review; replaced with actual synthetic saved receipt",
    "Second browser attempt and test review exposed detached score input during correction review. Replaced unsupported newer-zero assertion with visible proposed19 and retained reason. Final focused138 and browser36/108 are the corrected evidence; prior weak assertions do not prove preservation",
    "Final exact seven regression tests rerun on original production component and all fail; candidate bytes restored before full quality"
  ],
  "dependencyPatches": {
    "initial_head": "fc7ce1c750d691c0596b72f4cff0ff7d327793ff",
    "initial_tree": "451afc2d34934b8c65ec753b74532b5f325b188a",
    "quality": {
      "run": 40095919498,
      "result": "PASS UI-only; native/Windows skipped"
    },
    "security": {
      "run": 40095919479,
      "result": "FAIL five advisories/three baseline packages",
      "jobs": [
        120878042459,
        120878042601
      ],
      "excerpt": [
        "2026-10-24T12:55:16.8702233Z Total 3 packages affected by 5 known vulnerabilities (0 Critical, 2 High, 2 Medium, 0 Low, 1 Unknown) from 2 ecosystems.",
        "2026-10-24T12:55:16.8702661Z 5 vulnerabilities can be fixed.",
        "2026-10-24T12:55:16.8704647Z | https://osv.dev/RUSTSEC-2026-0385   |      | crates.io | ctutils      | 0.4.2   | 0.4.4         | src-tauri/Cargo.lock |",
        "2026-10-24T12:55:16.8705206Z | https://osv.dev/GHSA-4qv8-2p9j-2685 | 5.9  | npm       | undici (dev) | 8.11.2  | 8.12.2        | package-lock.json    |",
        "2026-10-24T12:55:16.8705760Z | https://osv.dev/GHSA-f72v-6w45-q472 | 5.9  | npm       | undici (dev) | 8.11.2  | 8.12.2        | package-lock.json    |",
        "2026-10-24T12:55:16.8707060Z | https://osv.dev/GHSA-xjj6-f33q-929c | 7.5  | npm       | undici (dev) | 8.11.2  | 8.12.2        | package-lock.json    |",
        "2026-10-24T12:55:16.8707807Z | https://osv.dev/GHSA-mrhx-c7xc-m3w5 | 8.2  | npm       | zod (dev)    | 4.4.3   | 4.6.6         | package-lock.json    |",
        "2026-10-24T12:55:16.8718056Z ##[error]Process completed with exit code 1."
      ]
    },
    "selection": "Latest compatible stable lock-only transitive patches; no direct manifest/scanner policy change",
    "changes": {
      "ctutils": [
        "0.4.2",
        "0.4.5"
      ],
      "undici": [
        "8.11.2",
        "8.12.3"
      ],
      "zod": [
        "4.4.3",
        "4.6.7"
      ]
    },
    "ctutils_registry": {
      "name": "ctutils",
      "vers": "0.4.5",
      "deps": [
        {
          "name": "cmov",
          "req": "^0.5.3",
          "features": [],
          "optional": false,
          "default_features": true,
          "target": null,
          "kind": "normal"
        },
        {
          "name": "proptest",
          "req": "^1.11",
          "features": [],
          "optional": false,
          "default_features": true,
          "target": null,
          "kind": "dev"
        },
        {
          "name": "subtle",
          "req": "^2.6",
          "features": [],
          "optional": true,
          "default_features": false,
          "target": null,
          "kind": "normal"
        }
      ],
      "cksum": "38d28fb6aa7dd680b3ffd1a3e64e115c177bdba63c0ae7f9cd48129ff05c4fa0",
      "features": {
        "alloc": []
      },
      "features2": {
        "subtle": [
          "dep:subtle"
        ]
      },
      "yanked": false,
      "rust_version": "1.87",
      "pubtime": "2026-10-23T04:02:07Z",
      "v": 2
    },
    "registry_blob": "c8e1d3863f67e0195261375719cd08680a85335f",
    "cargo_method": "Local cargo absent. Verified targeted Cargo.lock version/checksum edit; real CI Cargo resolution/build/test required before merge",
    "sources": [
      "https://rustsec.org/advisories/RUSTSEC-2026-0385.html",
      "https://github.com/advisories/GHSA-4qv8-2p9j-2685",
      "https://github.com/advisories/GHSA-f72v-6w45-q472",
      "https://github.com/advisories/GHSA-xjj6-f33q-929c",
      "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
      "https://github.com/rust-lang/crates.io-index/blob/master/ct/ut/ctutils",
      "https://registry.npmjs.org/undici",
      "https://registry.npmjs.org/zod"
    ],
    "network_diagnostic": "Direct crates.io API denied; recovered official registry index through GitHub connector, no credential workaround"
  },
  "ubuntuExcerpts": [
    "2026-10-24T13:04:11.4938090Z       Tests  1699 passed (1699)",
    "2026-10-24T13:04:50.7855451Z quality:ui PASS — assigned class selection/context, score entry, Forms/Calendar/Account/More, enrollment history, both appearances × three densities × four widths, footer clearance, remembered preference, keyboard score saving, sticky class index, short-screen Account, zero axe WCAG A/AA findings.",
    "2026-10-24T13:05:08.1972170Z quality:ui:recovery PASS — 50 checks, recovery workflows, draft retention, confirmation focus, 200% text and touch.",
    "2026-10-24T13:06:04.4360070Z   Downloaded ctutils v0.4.5",
    "2026-10-24T13:06:30.7097071Z    Compiling ctutils v0.4.5",
    "2026-10-24T13:12:23.2195328Z test result: ok. 1320 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 183.63s",
    "2026-10-24T13:12:23.2322096Z test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s",
    "2026-10-24T13:12:25.5698653Z test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.34s",
    "2026-10-24T13:12:31.2410393Z test result: ok. 18 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.67s",
    "2026-10-24T13:12:33.9373080Z test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.69s",
    "2026-10-24T13:12:34.3298742Z test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.39s",
    "2026-10-24T13:12:36.4191495Z test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.09s",
    "2026-10-24T13:12:47.5897850Z test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 11.17s",
    "2026-10-24T13:13:00.7119540Z test result: ok. 39 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 13.12s",
    "2026-10-24T13:13:06.1284409Z test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.41s",
    "2026-10-24T13:13:12.5008146Z test result: ok. 22 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 6.37s",
    "2026-10-24T13:13:15.0554351Z test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.55s",
    "2026-10-24T13:13:16.6070609Z test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.55s",
    "2026-10-24T13:13:20.0273745Z test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.42s",
    "2026-10-24T13:13:25.4984526Z test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.47s",
    "2026-10-24T13:13:25.8294219Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.33s",
    "2026-10-24T13:13:27.0087446Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.18s",
    "2026-10-24T13:13:31.7036591Z test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.69s",
    "2026-10-24T13:13:38.0789093Z test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 6.37s",
    "2026-10-24T13:13:39.2337079Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.15s",
    "2026-10-24T13:13:43.2308668Z test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.99s",
    "2026-10-24T13:13:46.7543369Z test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.52s",
    "2026-10-24T13:13:46.7754342Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s",
    "2026-10-24T13:13:52.7710301Z test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.99s",
    "2026-10-24T13:13:57.3724458Z test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.60s",
    "2026-10-24T13:13:58.2203953Z test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s",
    "2026-10-24T13:14:19.2362958Z     Checking ctutils v0.4.5",
    "2026-10-24T13:15:54.0625847Z SCORE_NATIVE_NEGATIVE_CONTROLS_JSON={\"baseline\": \"ac4c3add56fb7a0677f1a0f745bf1de816ea55ee\", \"grade_baseline\": \"de3c691dcce810fda88204cc0101a242c5fd30a5\", \"grade_seam_baseline\": \"6f580f056cc5286d1a0174f4f5a4d1a80334bf61\", \"grade_baseline_command_body_sha256\": \"d1c4e6ba5bda44a2824147fea15563806a61bfcd72aee841720660eaa4694a14\", \"evidence\": \"Native cargo assertions against pinned pre-fix production bodies with candidate tests/fixtures\", \"source_restored\": true, \"candidate_sources\": {\"src-tauri/src/commands/learner_score.rs\": \"717bab2f5259d04e08cc87e40a6cd0e3d9ee030e7a0fcb7fa2274018a2f7ed5b\", \"src-tauri/src/repository/learner_score.rs\": \"a6359ed086f5f9928b5a15cbc7359429bee61ecae9184cd6e6a1e88f6ef2317f\"}, \"results\": [{\"case\": \"command_rejects_unassigned_same_school_teacher_without_writing\", \"kind\": \"write\", \"baseline_failed_as_expected\": true}, {\"case\": \"command_local_correction_failure_rolls_back_history\", \"kind\": \"write\", \"baseline_failed_as_expected\": true}, {\"case\": \"grade_read_rejects_unassigned_same_school_teacher\", \"kind\": \"grade\", \"baseline_failed_as_expected\": true}, {\"case\": \"grade_read_rechecks_assignment_replacement_for_existing_session\", \"kind\": \"grade\", \"baseline_failed_as_expected\": true}, {\"case\": \"grade_read_rechecks_school_head_role_revocation\", \"kind\": \"grade\", \"baseline_failed_as_expected\": true}]}"
  ],
  "windowsExcerpts": [
    "2026-10-24T13:03:44.0286281Z   Downloaded ctutils v0.4.5\r",
    "2026-10-24T13:05:19.5363277Z    Compiling ctutils v0.4.5\r",
    "2026-10-24T13:23:56.5315937Z test result: ok. 1329 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 327.87s\r",
    "2026-10-24T13:23:56.5658425Z test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\r",
    "2026-10-24T13:24:00.7419068Z test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.16s\r",
    "2026-10-24T13:24:09.8912899Z test result: ok. 18 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 9.13s\r",
    "2026-10-24T13:24:13.7897176Z test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.88s\r",
    "2026-10-24T13:24:14.5584294Z test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.75s\r",
    "2026-10-24T13:24:17.8381648Z test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.26s\r",
    "2026-10-24T13:24:27.9382748Z test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 10.08s\r",
    "2026-10-24T13:24:50.5972142Z test result: ok. 39 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 22.63s\r",
    "2026-10-24T13:24:56.8716712Z test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 6.25s\r",
    "2026-10-24T13:25:08.0256019Z test result: ok. 22 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 11.13s\r",
    "2026-10-24T13:25:12.2537620Z test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.21s\r",
    "2026-10-24T13:25:14.7392632Z test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.46s\r",
    "2026-10-24T13:25:20.2474756Z test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.49s\r",
    "2026-10-24T13:25:30.0031804Z test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 9.74s\r",
    "2026-10-24T13:25:30.3104267Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.29s\r",
    "2026-10-24T13:25:32.1510575Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.82s\r",
    "2026-10-24T13:25:39.7460056Z test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 7.58s\r",
    "2026-10-24T13:25:50.0799859Z test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 10.31s\r",
    "2026-10-24T13:25:51.7676319Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.67s\r",
    "2026-10-24T13:25:59.3407462Z test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 7.55s\r",
    "2026-10-24T13:26:05.5405158Z test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 6.18s\r",
    "2026-10-24T13:26:05.5983286Z test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.04s\r",
    "2026-10-24T13:26:17.1168927Z test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 11.50s\r",
    "2026-10-24T13:26:24.2520857Z test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 7.12s\r",
    "2026-10-24T13:26:26.6910582Z test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\r"
  ],
  "acceptance": "R1–R5/S1 PASS bounded. Full PM-13/A1–A7 teacher/device/manual acceptance remains partial.",
  "operationalLimit": "Executor disconnected after local checks. Final source/CI/merge/docs checkpoint verified via GitHub; local final resync and post-outage formatting command NOT RUN.",
  "externalLimits": [
    "Installed Windows GUI/upgrade NOT RUN",
    "Actual Android and real exchange NOT RUN",
    "Manual AT/OS zoom/physical IME and teacher comprehension NOT RUN",
    "Native math/authority source retained; no official policy/template approval"
  ]
}
```

The execution environment became unavailable after the refreshed local checks. This receipt and final handoff were prepared and persisted through GitHub. No final local checkout/resync or post-outage formatting execution is claimed. Earlier command outputs, verified Git trees and actual CI job records support the reported results. Main and the dependent PR146–150 chain were not merged; PR150 remains draft on149. No deployment or installed-device acceptance is implied.
