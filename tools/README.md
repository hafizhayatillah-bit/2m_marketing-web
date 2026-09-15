## Tailwind standalone CLI

This binary is gitignored (large, OS-specific) — download it yourself:

1. Go to https://github.com/tailwindlabs/tailwindcss/releases and grab a **v3.x** asset
   (this project uses the v3 `tailwind.config.js` workflow, not v4's CSS-first config).
2. Windows: download `tailwindcss-windows-x64.exe`, save as `tools/tailwindcss.exe`.
3. macOS/Linux: download the matching `tailwindcss-<platform>` asset, save as
   `tools/tailwindcss`, then `chmod +x tools/tailwindcss`.
4. Run `python build_css.py` (add `--watch` while developing) to generate
   `assets/css/output.css`.
