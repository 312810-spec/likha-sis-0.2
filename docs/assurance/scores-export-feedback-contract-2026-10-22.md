# Scores CSV feedback contract

22 October 2026, Asia/Manila. Base c7c9d01dd5ff6a03ef425274128fa04fb87ecaf1. PM-12/13/31 continuation within Scores; retain A1–A7.

Outcome: distinguish a newly confirmed CSV export from an older file or failed attempt, and identify the folder for the intended output.

| ID  | Required observation                                                                                                            | Verification                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| E1  | A new attempt removes that output's prior success/path/folder action; failure/null cannot retain it as the apparent outcome     | Deferred/failure/null regressions for both outputs |
| E2  | Errors name the affected output and its export retry; no unrelated Reload items action or cross-kind error replacement          | Component tests and browser fault injection        |
| E3  | Output headings/folder actions identify report card versus class summary; snapshots of saved records are explicit               | Names/path assertions; disclosure fields preserved |
| E4  | Pending requests reject duplicate activation; export/reveal handlers do not replay scores; independent output remains confirmed | Component/browser call counts                      |
| E5  | Long paths wrap intact; changed states pass theme/density/width/motion, axe, focus, quality/build/isolation and applicable CI   | Browser matrix and internal render inspection      |

This reconstructs the same contract after workspace maintenance removed the unfinished local slice. Earlier two regression failures and observed long-path overflow are conversation evidence; fresh runs will bind restored code to results. Scope is UI feedback only: no file deletion, automatic retry, grading algorithm, native filesystem reliability or official-form fidelity claim. Teacher/device/manual A1–A7 remain pending.

Protected-behavior clarification: existing score-field blur-save is unchanged. Zero-score-write assertions describe the controlled export/reveal scenarios with unchanged score inputs; they do not redefine navigation away from a dirty score field. This clarifies E4 while preserving its no-replay requirement.
