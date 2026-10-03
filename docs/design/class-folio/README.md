# Class folio — rendered implementation

Captured from the development-only preview using the same React components and shared theme as production. Records are synthetic; the supplied Tingub seal is a branding reference. These are application screenshots, not concept illustrations.

| View                | Screenshot                             |
| ------------------- | -------------------------------------- |
| Desktop light       | [desktop-light.png](desktop-light.png) |
| Desktop dark        | [desktop-dark.png](desktop-dark.png)   |
| Subject class, dark | [class-dark.png](class-dark.png)       |
| Phone light         | [phone-light.png](phone-light.png)     |
| Phone dark          | [phone-dark.png](phone-dark.png)       |

Desktop: 1440px. Phone: 390 × 844px viewport capture with fixed bottom navigation; content scrolls below the fold. Reduced motion is enabled for capture.

`npm run quality:ui` checks the isolated preview at 1440, 1024, 390, and 320px in both appearances and all three teacher modes, plus accessibility and real context handoff through synthetic repositories. Install Chromium with `npx playwright install chromium`; an existing compatible executable can be supplied with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

See [ADR-0072](../../adr/0072-school-class-folio-and-appearance.md) for the implementation boundaries and remaining native release verification.

To regenerate these screenshots, run `LIKHA_CAPTURE_UI=1 npm run quality:ui`. The capture is part of the verified workflow and uses real shared components with synthetic repositories.

The [frontend implementation brief](FRONTEND-IMPLEMENTATION-BRIEF.md) records the Prompt Master role and completion criteria. [ADR-0073](../../adr/0073-assigned-class-workspace-and-concept-navigation.md) records the complete navigation replacement and deliberate differences from illustrative sample data.
