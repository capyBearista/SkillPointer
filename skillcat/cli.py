import argparse
from pathlib import Path
import shutil
import subprocess


FAIL = "\033[91m"
WARNING = "\033[93m"
ENDC = "\033[0m"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="SkillCat - OpenTUI runtime launcher."
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=["home", "init", "browse", "maintain", "presets", "stats"],
        help="Optional start route for the OpenTUI app.",
    )
    parser.add_argument(
        "--run-setup",
        action="store_true",
        help="Run Python migration setup path directly (non-TUI).",
    )
    parser.add_argument(
        "--agent",
        choices=["opencode", "claude"],
        default="opencode",
        help="Agent target for --run-setup.",
    )
    parser.add_argument(
        "--pointer-mode",
        choices=["categories", "tags", "both"],
        default="both",
        help="Formatting mode for skill pointers (categories=desc only, tags=tags only, both=both).",
    )
    return parser


def _run_bun_tui(route: str) -> None:
    bun_binary = shutil.which("bun")
    if bun_binary is None:
        print(
            f"\n{FAIL}Bun is required for SkillCat interactive mode.{ENDC}"
        )
        print("Install Bun: https://bun.sh/docs/installation")
        print("Then launch with: bunx skillcat  (or npx skillcat)")
        raise SystemExit(1)

    project_root = Path(__file__).resolve().parent.parent
    entrypoint = project_root / "opentui" / "src" / "index.tsx"

    if not entrypoint.exists():
        print(f"\n{FAIL}OpenTUI entrypoint not found: {entrypoint}{ENDC}")
        raise SystemExit(1)

    command = [bun_binary, "run", str(entrypoint)]
    if route != "home":
        command.append(route)

    result = subprocess.run(command, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    try:
        if args.run_setup:
            from . import installer as setup_script

            setup_script.run_setup(agent=args.agent, pointer_mode=args.pointer_mode)
            return

        start_route = args.command or "home"
        _run_bun_tui(start_route)
    except KeyboardInterrupt:
        print(f"\n{WARNING}SkillCat cancelled by user.{ENDC}")
        raise SystemExit(130)
    except Exception as exc:
        print(f"\n{FAIL}An unexpected error occurred: {exc}{ENDC}")
        raise SystemExit(1)
