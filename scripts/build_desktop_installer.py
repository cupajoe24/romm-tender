#!/usr/bin/env python3
"""Assemble the standalone self-extracting installer and distribution zip for testing the Desktop bundle.

Takes the packaged release tarball (produced by ``scripts/package.sh`` after
``pnpm -C frontend build:desktop``) and generates:

1. ``build/tender-desktop-installer.sh`` — a single-file self-extracting
   installer script that unpacks the embedded tarball and executes ``install.sh``;
2. ``build/romm-tender-<version>-desktop-dist.zip`` — a distribution zip containing
   the self-extracting installer, the tarball + .sha256, ``install.sh``, and instructions.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import zipfile

from check_release_tarball import collect_findings

SELF_EXTRACT_HEADER = """#!/usr/bin/env bash
#
# Tender Desktop Test Installer
#
# Standalone self-extracting installer for Tender with Desktop bundle enabled.
# Run on Steam Deck or Linux:
#   bash tender-desktop-installer.sh
#
# For unattended / script runs:
#   bash tender-desktop-installer.sh --yes
#

set -euo pipefail

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

ARCHIVE="$STAGE/romm-tender.tar.gz"

PAYLOAD_LINE=$(grep -an "^#__PAYLOAD_BEGINS__$" "$0" | head -n 1 | cut -d: -f1)
SKIP=$((PAYLOAD_LINE + 1))
tail -n +"$SKIP" "$0" > "$ARCHIVE"

tar -xzf "$ARCHIVE" -C "$STAGE" romm-tender/install.sh
bash "$STAGE/romm-tender/install.sh" --from "$ARCHIVE" "$@"
exit 0

#__PAYLOAD_BEGINS__
"""

README_TEMPLATE = """========================================================================
Tender — Desktop Test Build (v{version})
========================================================================

This build includes the Tender Desktop bundle for testing the Desktop client UI.

------------------------------------------------------------------------
Option 1: Quick Install (Recommended)
------------------------------------------------------------------------
Run the standalone self-extracting installer directly in terminal:

    bash tender-desktop-installer.sh

Or for unattended installation without confirmation prompts:

    bash tender-desktop-installer.sh --yes

------------------------------------------------------------------------
Option 2: Install from Release Archive
------------------------------------------------------------------------
If you prefer running via the standard installer script:

    bash install.sh --from romm-tender-{version}.tar.gz

------------------------------------------------------------------------
Updating & Uninstalling
------------------------------------------------------------------------
- Updating: Running the installer over an existing installation safely
  updates your install while keeping your database, shortcuts, and settings.
- Rollback: If you need to revert to the previous version:
    ~/.local/lib/romm-tender/install.sh --rollback
- Uninstall: If you want to remove Tender while keeping your library and settings:
    ~/.local/lib/romm-tender/install.sh --uninstall
- Purge: If you want to remove Tender and all its configuration, database,
  and cache (while preserving recovery backups in ~/romm-tender-recovery):
    ~/.local/lib/romm-tender/install.sh --purge
"""


def read_version(repo_root: pathlib.Path) -> str:
    version_file = repo_root / "version.txt"
    if not version_file.is_file():
        raise RuntimeError(f"Missing version file: {version_file}")
    return version_file.read_text(encoding="utf-8").strip()


def build_self_extracting_installer(
    output_path: pathlib.Path,
    tarball_path: pathlib.Path,
) -> None:
    payload = tarball_path.read_bytes()
    header_bytes = SELF_EXTRACT_HEADER.encode("utf-8")
    output_path.write_bytes(header_bytes + payload)
    output_path.chmod(0o755)


def build_distribution_zip(
    zip_path: pathlib.Path,
    version: str,
    installer_sh: pathlib.Path,
    tarball: pathlib.Path,
    tarball_sha256: pathlib.Path,
    root_install_sh: pathlib.Path,
) -> None:
    readme_content = README_TEMPLATE.format(version=version)

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # README
        zf.writestr("README.txt", readme_content)

        # Standalone installer
        info_installer = zipfile.ZipInfo("tender-desktop-installer.sh")
        info_installer.external_attr = 0o755 << 16  # rwxr-xr-x
        zf.writestr(info_installer, installer_sh.read_bytes())

        # Standard tarball + sha256
        zf.write(tarball, arcname=tarball.name)
        if tarball_sha256.is_file():
            zf.write(tarball_sha256, arcname=tarball_sha256.name)

        # Standard install.sh
        info_install_sh = zipfile.ZipInfo("install.sh")
        info_install_sh.external_attr = 0o755 << 16
        zf.writestr(info_install_sh, root_install_sh.read_bytes())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Assemble desktop test installer artifacts.")
    parser.add_argument(
        "--build-dir",
        type=pathlib.Path,
        default=pathlib.Path("build"),
        help="Build output directory containing the release tarball (default: build)",
    )
    arguments = parser.parse_args(argv)

    repo_root = pathlib.Path(__file__).resolve().parent.parent
    build_dir = repo_root / arguments.build_dir if not arguments.build_dir.is_absolute() else arguments.build_dir

    version = read_version(repo_root)
    tarball = build_dir / f"romm-tender-{version}.tar.gz"
    tarball_sha256 = build_dir / f"romm-tender-{version}.tar.gz.sha256"
    root_install_sh = repo_root / "install.sh"

    if not tarball.is_file():
        print(f"ERROR: {tarball} not found. Run scripts/package.sh first.", file=sys.stderr)
        return 1

    findings = collect_findings(tarball, None)
    if findings:
        print(f"ERROR: {tarball.name} is not the tarball install.sh expects:", file=sys.stderr)
        for line in findings:
            print(f"  {line}", file=sys.stderr)
        return 1
    print(f"OK: {tarball.name} verified against release tarball rules.")

    standalone_installer = build_dir / "tender-desktop-installer.sh"
    print(f"Creating standalone installer: {standalone_installer.name}...")
    build_self_extracting_installer(standalone_installer, tarball)
    print(f"  {standalone_installer} ({standalone_installer.stat().st_size:,} bytes)")

    dist_zip = build_dir / f"romm-tender-{version}-desktop-dist.zip"
    print(f"Creating distribution zip: {dist_zip.name}...")
    build_distribution_zip(
        dist_zip,
        version,
        standalone_installer,
        tarball,
        tarball_sha256,
        root_install_sh,
    )
    print(f"  {dist_zip} ({dist_zip.stat().st_size:,} bytes)")

    print("\nDesktop test installer distribution artifacts ready:")
    print(f"  1. Standalone Installer: {standalone_installer}")
    print(f"  2. Full Distribution Zip: {dist_zip}")
    print(f"  3. Release Tarball: {tarball}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
