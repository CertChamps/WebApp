Put your source branding files in this folder before running asset generation.

Required files:
- `icon-only.png` (min 1024x1024)
- `icon-foreground.png` (min 1024x1024)
- `icon-background.png` (min 1024x1024)
- `splash.png` (min 2732x2732)
- `splash-dark.png` (min 2732x2732, optional but recommended)

Generate native assets:
- `npm run assets:generate`

Notes:
- Android 12+ uses adaptive icon + background for splash.
- Keep logos centered with safe padding (about 20% transparent margin).
