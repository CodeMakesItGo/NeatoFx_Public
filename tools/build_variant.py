#!/usr/bin/env python3
"""NEATO-FX variant builder.

Selects a variant from tools/variants.yaml by toggling the commented
`!include` options inside a device's main.yaml packages block, then runs
`esphome config|compile` on it. Used by CI, the pre-commit hook, and the
hardware test bench (with --keep to leave the selection applied before
flashing real hardware).

Usage:
  build_variant.py --list
  build_variant.py <device> <variant> [--check config|compile] [--id N] [--keep]
  build_variant.py --all [--check config|compile]      # every device x variant

Exit code 0 = success, 1 = failure (details on stderr).
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
VARIANTS_FILE = Path(__file__).resolve().parent / "variants.yaml"

PKG_LINE = re.compile(
    r"^(?P<indent>\s+)(?P<comment>#\s*)?(?P<key>[A-Za-z0-9_]+):\s*"
    r"(?P<inc>!include\s+)(?P<path>\S+)(?P<rest>.*)$"
)


def load_matrix():
    with open(VARIANTS_FILE) as f:
        return yaml.safe_load(f)["devices"]


def find_packages_block(lines):
    """Return (start, end) line indices of the top-level packages: block."""
    start = None
    for i, line in enumerate(lines):
        if line.rstrip() == "packages:":
            start = i
            continue
        if start is not None and line and not line.startswith((" ", "\t", "#", "\n")):
            return start, i
    if start is None:
        raise ValueError("no top-level packages: block found")
    return start, len(lines)


def apply_variant(main_yaml: Path, selections: dict) -> str:
    """Return new main.yaml text with the variant's selections applied."""
    text = main_yaml.read_text()
    lines = text.splitlines(keepends=True)
    start, end = find_packages_block(lines)

    # Index every include option in the packages block by key
    options = {}  # key -> list of (line_idx, path)
    for i in range(start + 1, end):
        m = PKG_LINE.match(lines[i])
        if m:
            options.setdefault(m.group("key"), []).append((i, m.group("path")))

    for key, want in selections.items():
        if key not in options:
            raise ValueError(f"package key '{key}' not found in {main_yaml}")
        paths = [p for _, p in options[key]]
        if want is not None and want not in paths:
            raise ValueError(
                f"'{want}' is not an option for key '{key}' in {main_yaml} "
                f"(options: {paths})"
            )
        for i, path in options[key]:
            m = PKG_LINE.match(lines[i])
            enable = want is not None and path == want
            new = "{indent}{maybe}{key}: {inc}{path}{rest}\n".format(
                indent=m.group("indent"),
                maybe="" if enable else "#",
                key=m.group("key"),
                inc=m.group("inc"),
                path=path,
                rest=m.group("rest").rstrip("\n"),
            )
            lines[i] = new
    return "".join(lines)


def run_esphome(main_yaml: Path, check: str, dev_id: str, substitutions: dict) -> int:
    cmd = ["esphome", "-s", "id", dev_id]
    for k, v in (substitutions or {}).items():
        cmd += ["-s", k, str(v)]
    cmd += [check, str(main_yaml)]
    print(f"  $ {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd)


def build(device: str, variant: str, matrix: dict, check: str, dev_id: str,
          keep: bool) -> bool:
    spec = matrix[device]
    main_yaml = REPO_ROOT / spec["path"]
    selections = spec["variants"][variant] or {}
    original = main_yaml.read_text()
    print(f"== {spec.get('label', device)} :: {variant} ==", flush=True)
    try:
        if selections:
            main_yaml.write_text(apply_variant(main_yaml, selections))
        rc = run_esphome(main_yaml, check, dev_id, spec.get("substitutions"))
        return rc == 0
    finally:
        if not keep:
            main_yaml.write_text(original)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("device", nargs="?")
    ap.add_argument("variant", nargs="?")
    ap.add_argument("--check", default="config", choices=["config", "compile"])
    ap.add_argument("--id", default="1", dest="dev_id")
    ap.add_argument("--keep", action="store_true",
                    help="leave the variant selection applied to main.yaml")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    matrix = load_matrix()

    if args.list:
        for dev, spec in matrix.items():
            for var in spec["variants"]:
                print(f"{dev} {var}")
        return 0

    failures = []
    if args.all:
        for dev, spec in matrix.items():
            for var in spec["variants"]:
                if not build(dev, var, matrix, args.check, args.dev_id, keep=False):
                    failures.append(f"{dev}:{var}")
    else:
        if not args.device or not args.variant:
            ap.error("device and variant required (or --all / --list)")
        if args.device not in matrix:
            ap.error(f"unknown device '{args.device}' "
                     f"(known: {', '.join(matrix)})")
        if args.variant not in matrix[args.device]["variants"]:
            ap.error(f"unknown variant '{args.variant}' for {args.device} "
                     f"(known: {', '.join(matrix[args.device]['variants'])})")
        if not build(args.device, args.variant, matrix, args.check,
                     args.dev_id, args.keep):
            failures.append(f"{args.device}:{args.variant}")

    if failures:
        print(f"\nFAILED: {', '.join(failures)}", file=sys.stderr)
        return 1
    print("\nAll builds OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
