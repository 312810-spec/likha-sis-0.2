# PR #55 Recovery Checklist

Use this checklist for every slice recovered from `archive/pr55-pending-tasks-batch`.

- [ ] The need still exists on current `main`.
- [ ] The slice supports LIKHA priorities and Focused 1.0 admission rules.
- [ ] Current architecture/ADRs were inspected before porting.
- [ ] No obsolete `.claude` or model/provider control-plane dependency is restored.
- [ ] Authorization is enforced at a trusted boundary, not only in UI.
- [ ] No real learner PII is used in development, tests, screenshots, or prompts.
- [ ] Offline/local-first behavior remains intact.
- [ ] Migration/data-loss/recovery behavior is tested when applicable.
- [ ] Security-sensitive slices receive fresh negative authorization/security tests.
- [ ] Cloud/provider integrations remain optional infrastructure adapters.
- [ ] Teacher workflow remains coherent in Efficient, Comfortable, and Guided modes where UI is involved.
- [ ] Affected-work CI and independent security checks pass.
- [ ] Durable decisions are recorded before merge.
- [ ] The recovered PR is small enough to understand, review, revert, and re-run independently.
