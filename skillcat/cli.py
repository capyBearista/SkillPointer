from . import installer as setup_script


def main() -> None:
    try:
        setup_script.main()
    except KeyboardInterrupt:
        print(
            f"\n{setup_script.Colors.WARNING}Setup cancelled by user.{setup_script.Colors.ENDC}"
        )
    except Exception as exc:
        print(
            f"\n{setup_script.Colors.FAIL}An unexpected error occurred: {exc}{setup_script.Colors.ENDC}"
        )
