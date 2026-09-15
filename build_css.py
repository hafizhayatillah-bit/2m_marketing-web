"""Build the project's Tailwind CSS using the standalone CLI binary.

No Node.js/npm required — this just wraps the /tools/tailwindcss binary.
"""
import argparse
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOOLS_DIR = ROOT / "tools"
INPUT_CSS = ROOT / "src" / "input.css"
OUTPUT_CSS = ROOT / "assets" / "css" / "output.css"


def resolve_binary() -> Path:
    binary_name = "tailwindcss.exe" if platform.system() == "Windows" else "tailwindcss"
    binary_path = TOOLS_DIR / binary_name
    if not binary_path.exists():
        sys.exit(
            f"Tailwind CLI binary not found at {binary_path}.\n"
            "Download it from https://github.com/tailwindlabs/tailwindcss/releases "
            "(v3.x, matching your OS) and place it in /tools."
        )
    return binary_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true", help="Rebuild automatically on file changes (run in a separate terminal while coding).")
    args = parser.parse_args()

    binary = resolve_binary()
    OUTPUT_CSS.parent.mkdir(parents=True, exist_ok=True)

    command = [str(binary), "-i", str(INPUT_CSS), "-o", str(OUTPUT_CSS), "--minify"]
    if args.watch:
        command.append("--watch")

    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
