---
name: official-forms
description: Use when implementing or rendering an official DepEd school form (e.g. School Forms SF1/SF2, Form 137/138, or similar).
---

# Official DepEd Forms

An official form's field layout, required fields, and validation rules
are a compliance surface, not a UI design choice. Before implementing:

1. Use the `deped-researcher` agent to find the current official form
   template/specification and cite the source.
2. Reproduce field names, ordering, and required/optional status exactly
   as specified — do not "clean up" or reorder fields based on UX
   intuition; if a field seems redundant or oddly placed, that's a
   question for the user, not something to silently fix.
3. Every field and every fixture used to test the form must use synthetic
   data only.
4. Record which DepEd form version/date this implementation matches, so a
   future policy update can be diffed against it — put this in the
   relevant ADR or a code comment near the form definition.

If the authoritative current template can't be found, stop and flag it —
do not fabricate a plausible-looking form layout.
