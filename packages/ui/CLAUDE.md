# packages/ui

Shared React component library used by all three apps. Styled with Tailwind (applied by the consuming app's CSS).

## Key exports (`src/index.ts`)
- `OTPInput` — 6-digit input, auto-focuses between fields, handles paste
- `CountdownTimer` — OTP expiry countdown, changes color near zero
- `TurtleLogo` — app logo
- `LoadingSpinner`, `ErrorMessage`, `SuccessMessage`

## Rules
- Import in apps as `@turtle/ui` — never copy-paste these components locally
- Tailwind classes work because the consuming app includes Tailwind — no separate CSS bundle needed
- Build with `npm run build` before consuming apps can use updated components in non-HMR mode
