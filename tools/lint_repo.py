#!/usr/bin/env python3
"""NEATO-FX repo lint — enforces DESIGN_RULES.md automatically.

Checks (per device):
  1. Standard layout: main.yaml, boards/, configs/networked.yaml, README.md,
     .gitignore present; standalone.yaml present unless device is in
     NETWORKED_ONLY.
  2. Naming: no product-name prefixes on standard files; lower_snake_case;
     no 'Smart' branding anywhere in yaml.
  3. Include depth: ../../../_shared/ from device root subdirs,
     ../../../../_shared/ from boards/common/; every !include target exists.
  4. main.yaml has substitutions id/name/friendly_name.
  5. networked.yaml has improv_serial + dashboard_import, and the
     dashboard_import URL points at THIS device's main.yaml.
  6. logger baud_rate must not be 0 in any device that has a networked config.
  7. Every package option in every main.yaml is enabled by at least one
     variant in tools/variants.yaml.
  8. No secrets.yaml tracked in git.
  9. If configs/home_assistant.yaml exists for a device, main.yaml's ACTIVE
     (uncommented) 'config:' package must point to it — units ship
     pre-flashed from main.yaml, and Made for ESPHome requires HA support
     enabled out of the box (see DESIGN_RULES.md #7).

Exit 0 = clean, 1 = violations (listed on stdout).
"""

import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
NETWORKED_ONLY = {"Displays/NeatoDisplay4", "Displays/NeatoDisplay7"}

DEVICES = [
    "Targets/NeatoTargetIR",
    "Controllers/NeatoMotor",
    "Controllers/NeatoBlaster",
    "Displays/NeatoDisplay4",
    "Displays/NeatoDisplay7",
    "Audio/NeatoAudio50",
    "Golf/NeatoGolf",
]

PRODUCT_PREFIXES = ("target_", "motor_", "blaster_", "display_", "golf_",
                    "speaker_")
# integrations/<product>_fpp.yaml is the sanctioned exception
PREFIX_OK = re.compile(r"integrations/[a-z0-9]+_fpp\.yaml$")

errors = []


def err(msg):
    errors.append(msg)


def yaml_files(root: Path):
    return [p for p in root.rglob("*.yaml") if ".esphome" not in p.parts]


def check_layout(dev: Path, rel: str):
    for required in ["main.yaml", "README.md", ".gitignore",
                     "configs/networked.yaml"]:
        if not (dev / required).exists():
            err(f"{rel}: missing {required}")
    if rel not in NETWORKED_ONLY and not (dev / "configs/standalone.yaml").exists():
        err(f"{rel}: missing configs/standalone.yaml (device is not networked-only)")


def check_naming(dev: Path, rel: str):
    for p in yaml_files(dev):
        r = p.relative_to(dev).as_posix()
        name = p.name
        if name.startswith(PRODUCT_PREFIXES) and not PREFIX_OK.search(r):
            err(f"{rel}/{r}: product-name prefix on standard file")
        if name != name.lower():
            err(f"{rel}/{r}: not lower_snake_case")
        text = p.read_text(errors="replace")
        for i, line in enumerate(text.splitlines(), 1):
            if re.search(r"\bsmart\s?(target|motor|blaster|golf|display|speaker)",
                         line, re.I):
                err(f"{rel}/{r}:{i}: 'Smart' branding (brand is Neato)")


def check_includes(dev: Path, rel: str):
    for p in yaml_files(dev):
        r = p.relative_to(dev).as_posix()
        depth = len(p.relative_to(dev).parts) - 1  # dirs below device root
        # device sits at <Line>/<Product>/ (2 levels below repo root)
        want_prefix = "../" * (2 + depth) + "_shared/"
        for i, line in enumerate(p.read_text(errors="replace").splitlines(), 1):
            m = re.search(r"^\s*[^#]*!include\s+([^\s#]+)", line)
            if not m:
                continue
            inc = m.group(1)
            target = (p.parent / inc).resolve()
            if not target.exists():
                err(f"{rel}/{r}:{i}: !include target missing: {inc}")
            if "_shared/" in inc and not inc.startswith(want_prefix):
                err(f"{rel}/{r}:{i}: _shared include depth wrong "
                    f"(want prefix {want_prefix})")


def check_main(dev: Path, rel: str):
    main = dev / "main.yaml"
    if not main.exists():
        return
    text = main.read_text()
    for sub in ("id:", "name:", "friendly_name:"):
        if not re.search(rf"^\s+{sub}", text, re.M):
            err(f"{rel}/main.yaml: substitutions missing '{sub.rstrip(':')}'")
    if re.search(r"^\s*baud_rate:\s*0\b", text, re.M) and \
            (dev / "configs/networked.yaml").exists():
        err(f"{rel}/main.yaml: logger baud_rate 0 conflicts with improv_serial "
            f"in networked config")


def check_networked(dev: Path, rel: str):
    cfg = dev / "configs/networked.yaml"
    if not cfg.exists():
        return
    text = cfg.read_text()
    if "improv_serial" not in text:
        err(f"{rel}/configs/networked.yaml: missing improv_serial (MFE)")
    m = re.search(r"package_import_url:\s*github://\S*?/(\S+?)@", text)
    if not m:
        err(f"{rel}/configs/networked.yaml: missing dashboard_import (MFE)")
    elif not m.group(1).endswith(f"{rel}/main.yaml"):
        err(f"{rel}/configs/networked.yaml: dashboard_import points at "
            f"'{m.group(1)}', expected '.../{rel}/main.yaml'")


def active_package(text: str, key: str):
    """Return the !include target of the ACTIVE (uncommented) package line
    for `key` in a main.yaml packages: block, or None if not found/active."""
    in_pkg = False
    active = None
    for line in text.splitlines():
        if line.rstrip() == "packages:":
            in_pkg = True
            continue
        if in_pkg and line and not line.startswith((" ", "\t", "#")):
            break
        if not in_pkg:
            continue
        m = re.match(rf"^\s+{re.escape(key)}:\s*!include\s+(\S+)", line)
        if m:
            active = m.group(1)
    return active


def check_made_for_esphome_default(dev: Path, rel: str):
    """A device that has configs/home_assistant.yaml is Made-for-ESPHome
    enrolled: units are pre-flashed straight from main.yaml, so main.yaml's
    active 'config:' package MUST default to home_assistant.yaml. Shipping
    networked.yaml (No-HA LAN) or standalone.yaml (AP-only) as the default
    means customers can't add the device to Home Assistant out of the box —
    this is exactly the regression an ESPHome reviewer caught on the
    NeatoTargetIR submission (main.yaml AND the docs config.yaml had both
    drifted to networked.yaml)."""
    if not (dev / "configs/home_assistant.yaml").exists():
        return  # not enrolled yet — out of scope for this check
    main = dev / "main.yaml"
    if not main.exists():
        return  # already reported by check_layout
    active = active_package(main.read_text(), "config")
    if active is None:
        err(f"{rel}/main.yaml: no active 'config:' package line found "
            f"(device has configs/home_assistant.yaml — Made for ESPHome "
            f"requires an active default)")
    elif not active.endswith("configs/home_assistant.yaml"):
        err(f"{rel}/main.yaml: active config is '{active}', but device has "
            f"configs/home_assistant.yaml — it must be the default so units "
            f"ship with Home Assistant support enabled (Made for ESPHome)")


def check_variant_coverage():
    with open(REPO / "tools/variants.yaml") as f:
        matrix = yaml.safe_load(f)["devices"]
    covered_mains = set()
    for dev, spec in matrix.items():
        main = REPO / spec["path"]
        covered_mains.add(main.resolve())
        if not main.exists():
            err(f"variants.yaml: {dev} path missing: {spec['path']}")
            continue
        text = main.read_text()
        lines = text.splitlines()
        # collect options + committed-enabled set
        options, enabled = {}, {}
        in_pkg = False
        for line in lines:
            if line.rstrip() == "packages:":
                in_pkg = True
                continue
            if in_pkg and line and not line.startswith((" ", "\t", "#")):
                break
            if not in_pkg:
                continue
            m = re.match(r"^\s+(#\s*)?([A-Za-z0-9_]+):\s*!include\s+(\S+)", line)
            if m:
                key, path = m.group(2), m.group(3)
                options.setdefault(key, set()).add(path)
                if not m.group(1):
                    enabled[key] = path
        # union of what variants enable
        variant_enabled = {(k, v) for k, v in enabled.items()}
        for vspec in spec["variants"].values():
            sel = dict(enabled)
            for k, v in (vspec or {}).items():
                if v is None:
                    sel.pop(k, None)
                else:
                    sel[k] = v
            variant_enabled |= set(sel.items())
        for key, paths in options.items():
            for path in paths:
                if (key, path) not in variant_enabled:
                    err(f"variants.yaml: {dev}: option '{key}: {path}' in "
                        f"{spec['path']} is never enabled by any variant")
    for rel in DEVICES:
        main = (REPO / rel / "main.yaml").resolve()
        if main.exists() and main not in covered_mains:
            err(f"variants.yaml: no device entry covers {rel}/main.yaml")


def check_secrets():
    out = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True,
                         text=True).stdout
    for line in out.splitlines():
        if line.endswith("secrets.yaml") and "template" not in line \
                and "ci_secrets" not in line:
            err(f"tracked secrets file: {line}")


def main():
    for rel in DEVICES:
        dev = REPO / rel
        if not dev.exists():
            err(f"{rel}: device folder missing")
            continue
        check_layout(dev, rel)
        check_naming(dev, rel)
        check_includes(dev, rel)
        check_main(dev, rel)
        check_networked(dev, rel)
        check_made_for_esphome_default(dev, rel)
    check_variant_coverage()
    check_secrets()

    if errors:
        print(f"LINT: {len(errors)} violation(s):")
        for e in errors:
            print(f"  ✗ {e}")
        return 1
    print("LINT: clean ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
