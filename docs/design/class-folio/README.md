# Class folio — rendered implementation

Captured from the development-only preview using the same React components and shared theme as production. Records are synthetic; the supplied Tingub seal is a branding reference. These are application screenshots, not concept illustrations.

| View                | Screenshot                                       |
| ------------------- | ------------------------------------------------ |
| Desktop light       | [desktop-light.png](desktop-light.png)           |
| Desktop dark        | [desktop-dark.png](desktop-dark.png)             |
| Subject class, dark | [class-dark.png](class-dark.png)                 |
| Phone light         | [phone-light.png](phone-light.png)               |
| Phone dark          | [phone-dark.png](phone-dark.png)                 |
| Scoring light       | [scores-light.png](scores-light.png)             |
| Scoring dark        | [scores-dark.png](scores-dark.png)               |
| Phone scoring light | [scores-phone-light.png](scores-phone-light.png) |
| Phone scoring dark  | [scores-phone-dark.png](scores-phone-dark.png)   |

Desktop: 1440px. Phone: 390 × 844px viewport capture with fixed bottom navigation; content scrolls below the fold. Reduced motion is enabled for capture.

`npm run quality:ui` checks the isolated preview at 1440, 1024, 390, and 320px in both appearances and all three teacher modes, plus accessibility and real context handoff through synthetic repositories. Install Chromium with `npx playwright install chromium`; an existing compatible executable can be supplied with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

See [ADR-0072](../../adr/0072-school-class-folio-and-appearance.md) for the implementation boundaries and remaining native release verification.

To regenerate these screenshots, run `LIKHA_CAPTURE_UI=1 npm run quality:ui`. The capture is part of the verified workflow and uses real shared components with synthetic repositories.

The [frontend implementation brief](FRONTEND-IMPLEMENTATION-BRIEF.md) records the Prompt Master role and completion criteria. [ADR-0073](../../adr/0073-assigned-class-workspace-and-concept-navigation.md) records the complete navigation replacement and deliberate differences from illustrative sample data.

The refinement pass keeps the desktop class index visible during long worksheets,
adds a scrollable Account panel with an explicit close action, announces class
changes, and scales reading text with teacher density. Embedded Scores loading
retains keyboard focus on its tab; Back to class restores focus to Overview.
Assessment creation is disclosed on request after items exist, retains drafts when
collapsed, and returns focus only if its own visible editor still owns focus.
The assessment list and export actions use aligned, spaced worksheet rows.

Opening a class record now continues an existing exact section/subject/term/year/
weighting match rather than creating a duplicate. Multiple matches require an
explicit choice; the native grading rules and authority checks are unchanged.
Assessment completion and scored-item protection update immediately after a saved
score. The additional scoring captures show actual score entry and local-save
feedback through synthetic repositories, not fabricated spreadsheet artwork.

The browser check also exercises Enter-to-save-and-advance, score retention across
worksheet tabs, desktop index visibility at the end of the page, and Account at
1024 × 480. Axe checks the scoring worksheet in both appearances at all four widths.
