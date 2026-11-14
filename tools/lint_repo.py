#!/usr/bin/env python3
"""NEATO-FX repo lint — enforces DESIGN_RULES.md automatically.

Checks (per device):
  1. Standard layout: an entry point (main.yaml, or one main_<hw>.yaml per
     hardware type), boards/, configs/networked.yaml, README.md,
     .gitignore present; standalone.yaml present unless device is in
     NETWORKED_ONLY.
  2. Naming: no product-name prefixes on standard files; lower_snake_case;
     no 'Smart' branding anywhere in yaml.
  3. Include depth: ../../../_shared/ from device root subdirs,
     ../../../../_shared/ from boards/common/; every !include target exists.
  4. Every main*.yaml has substitutions name/friendly_name, and none sets
     name_add_mac_suffix to "false" (it defaults to "true" in
     _shared/esphome_base.yaml; one binary per product needs the MAC suffix)
     (NO `id`: every product ships one binary; identity is runtime).
  5. networked.yaml has improv_serial + dashboard_import, and the
     dashboard_import URL points at THIS device's main.yaml — or at
     ${main_file}, which every main_<hw>.yaml must set to its own file name.
  6. logger baud_rate must not be 0 in any device that has a networked config.
  7. Every package option in every main*.yaml is enabled by at least one
     variant in tools/variants.yaml.
  8. No secrets.yaml tracked in git.
  9. If configs/home_assistant.yaml exists for a device, every main*.yaml's ACTIVE
     (uncommented) 'config:' package must point to it — units ship
     pre-flashed from main.yaml, and Made for ESPHome requires HA support
     enabled out of the box (see DESIGN_RULES.md #7).
 10. Made-for-ESPHome devices (those with configs/home_assistant.yaml) must
     expose OTA firmware updates: the firmware_update shared package and an
     uncommented update: platform: http_request block, whose manifest source
     URL resolves to a manifest file that exists in this repo. An ESPHome
     reviewer blocked the Target IR (block commented out) and Audio 50
     (block missing) submissions on exactly this.
 11. Shipped firmware RUNS at WARN: `logger: initial_level: WARN` (with
     `level:` — what is compiled in — at most DEBUG, so a "Log Level" select
     can raise it in the field), or, with no initial_level, `level: WARN`.
     No per-tag `logs:` override louder than WARN, and a level must be set
     somewhere (ESPHome defaults to DEBUG). Running at DEBUG floods the
     serial/web log and has overloaded the custom web UI on phones.
 12. No build — a main's committed selection or any tools/variants.yaml
     variant — combines an FPP package (`fpp_file:`) with
     configs/standalone.yaml. FPP needs the target and the FPP server on one
     router network; on the target's own hotspot it can never work.

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
    "Controllers/NeatoRelay8",
    "Controllers/NeatoRelay2",
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


def mains(dev: Path):
    """The device's entry points: main.yaml, or one main_<hw>.yaml per hardware
    type (Target IR — each with its own update channel and project name).
    Made for ESPHome does not require any particular file name; it requires
    dashboard_import to point at the published config (check_networked)."""
    return sorted(p for p in dev.glob("main*.yaml") if p.is_file()
                  and not p.name.endswith(".flat.yaml"))


def main_sub(main: Path, key: str):
    m = re.search(rf"^\s+{key}:\s*\"?([^\s\"#]+)", main.read_text(), re.M)
    return m.group(1) if m else None


def check_layout(dev: Path, rel: str):
    if not mains(dev):
        err(f"{rel}: missing an entry point (main.yaml or main_<hw>.yaml)")
    for required in ["README.md", ".gitignore", "configs/networked.yaml"]:
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
    for main in mains(dev):
        check_one_main(main, rel)


def check_one_main(main: Path, rel: str):
    text = main.read_text()
    for sub in ("name:", "friendly_name:"):
        if not re.search(rf"^\s+{sub}", text, re.M):
            err(f"{rel}/{main.name}: substitutions missing '{sub.rstrip(':')}'")
    # One binary per product: no build-time `id`. Identity is the runtime
    # player_id/device_id global from _shared/runtime_id.yaml, so a build-time
    # id substitution means someone reintroduced per-unit builds.
    if re.search(r"^\s+id:\s", text, re.M):
        err(f"{rel}/{main.name}: has a build-time 'id' substitution; products "
            f"ship ONE binary and take identity from _shared/runtime_id.yaml")
    # Every unit runs the same firmware; the MAC suffix is what gives each its
    # own hostname. "false" makes every unit identical on the network.
    if re.search(r"^\s+name_add_mac_suffix:\s*\"?false", text, re.M | re.I):
        err(f"{rel}/{main.name}: name_add_mac_suffix is false; shipped products "
            f"run one binary per unit and need the MAC suffix (the default in "
            f"_shared/esphome_base.yaml) for unique hostnames")
    if re.search(r"^\s*baud_rate:\s*0\b", text, re.M) and \
            (main.parent / "configs/networked.yaml").exists():
        err(f"{rel}/{main.name}: logger baud_rate 0 conflicts with improv_serial "
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
    elif m.group(1).endswith(f"{rel}/${{main_file}}"):
        # Per-hardware mains: each must name itself as main_file.
        for main in mains(dev):
            if main_sub(main, "main_file") != main.name:
                err(f"{rel}/{main.name}: dashboard_import uses ${{main_file}} "
                    f"but this main does not set main_file: {main.name}")
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
    enrolled: units are pre-flashed straight from their main*.yaml, so each
    main's active 'config:' package MUST default to home_assistant.yaml. Shipping
    networked.yaml (No-HA LAN) or standalone.yaml (AP-only) as the default
    means customers can't add the device to Home Assistant out of the box —
    this is exactly the regression an ESPHome reviewer caught on the
    NeatoTargetIR submission (main.yaml AND the docs config.yaml had both
    drifted to networked.yaml)."""
    if not (dev / "configs/home_assistant.yaml").exists():
        return  # not enrolled yet — out of scope for this check
    for main in mains(dev):
        active = active_package(main.read_text(), "config")
        if active is None:
            err(f"{rel}/{main.name}: no active 'config:' package line found "
                f"(device has configs/home_assistant.yaml — Made for ESPHome "
                f"requires an active default)")
        elif not active.endswith("configs/home_assistant.yaml"):
            err(f"{rel}/{main.name}: active config is '{active}', but device has "
                f"configs/home_assistant.yaml — it must be the default so units "
                f"ship with Home Assistant support enabled (Made for ESPHome)")


MANIFEST_URL = re.compile(
    r"^\s+source:\s*https://raw\.githubusercontent\.com/"
    r"CodeMakesItGo/NeatoFx_Public/main/(\S+)", re.M)


def check_firmware_update(dev: Path, rel: str):
    """Made-for-ESPHome devices must ship a working OTA update entity:
    firmware_update package included, an active update: http_request block,
    and a manifest that actually exists at the URL the block points to.
    ESPHome's reviewer blocked Target IR (commented out) and Audio 50
    (missing) on exactly this — see DESIGN_RULES.md #7."""
    cfg = dev / "configs/home_assistant.yaml"
    if not cfg.exists():
        return  # not enrolled — out of scope
    lines = cfg.read_text().splitlines()
    active = [l for l in lines if not l.lstrip().startswith("#")]
    text = "\n".join(active)

    if not re.search(r"^\s+firmware_update:\s*!include\s+\S*firmware_update\.yaml",
                     text, re.M):
        err(f"{rel}/configs/home_assistant.yaml: firmware_update package "
            f"include missing or commented out (MFE requires OTA updates)")

    if not re.search(r"^update:", text, re.M) or \
            not re.search(r"^\s+-\s*platform:\s*http_request", text, re.M):
        err(f"{rel}/configs/home_assistant.yaml: no active "
            f"'update: platform: http_request' block (MFE requires the "
            f"firmware update entity)")
        return

    m = MANIFEST_URL.search(text)
    if not m:
        err(f"{rel}/configs/home_assistant.yaml: update source is not a "
            f"raw.githubusercontent.com URL into this repo's main branch")
    elif "${update_channel}" in m.group(1):
        # Per-hardware channels: every main must set one whose manifest exists.
        for main in mains(dev):
            ch = main_sub(main, "update_channel")
            target = m.group(1).replace("${update_channel}", ch or "")
            if not ch:
                err(f"{rel}/{main.name}: update source uses ${{update_channel}} "
                    f"but this main does not set it")
            elif not (REPO / target).exists():
                err(f"{rel}/{main.name}: update channel '{ch}' has no "
                    f"manifest at '{target}'")
    elif not (REPO / m.group(1)).exists():
        err(f"{rel}/configs/home_assistant.yaml: update source points at "
            f"'{m.group(1)}' which does not exist in the repo")


LOG_LEVELS = ["NONE", "ERROR", "WARN", "INFO", "CONFIG", "DEBUG",
              "VERBOSE", "VERY_VERBOSE"]
SHIPPED_LEVEL = "WARN"
MAX_COMPILED_LEVEL = "DEBUG"   # VERBOSE+ floods the log and disturbs timing


def check_logger(dev: Path, rel: str):
    """Shipped firmware RUNS at WARN (DESIGN_RULES.md #7). Only ACTIVE lines
    count — a commented `#level: DEBUG` left as a hint is fine.

    `level` is what is compiled in; `initial_level` is what the unit runs at
    after boot. A device may compile in up to DEBUG (so a "Log Level" select
    can raise it in the field without a reflash) as long as initial_level is
    WARN. Without initial_level, level itself is the running level and must
    be WARN."""
    levels, initials = [], []          # (file, line, value)
    for p in yaml_files(dev):
        r = p.relative_to(dev).as_posix()
        in_logger = in_logs = False
        for i, line in enumerate(p.read_text(errors="replace").splitlines(), 1):
            if re.match(r"^logger:\s*(#.*)?$", line):
                in_logger, in_logs = True, False
                continue
            if not in_logger:
                continue
            if line and not line.startswith((" ", "\t", "#")):
                in_logger = False          # next top-level key
                continue
            if line.lstrip().startswith("#") or not line.strip():
                continue
            m = re.match(r"^  (level|initial_level):\s*\"?([A-Za-z_]+)", line)
            if m:
                (levels if m.group(1) == "level" else initials).append(
                    (r, i, m.group(2).upper()))
                in_logs = False
                continue
            if re.match(r"^  logs:\s*$", line):
                in_logs = True
                continue
            if re.match(r"^  \S", line):
                in_logs = False
                continue
            m = re.match(r"^    ([\w.]+):\s*\"?([A-Za-z_]+)", line)
            if in_logs and m:
                lvl = m.group(2).upper()
                if lvl in LOG_LEVELS and LOG_LEVELS.index(lvl) > LOG_LEVELS.index(SHIPPED_LEVEL):
                    err(f"{rel}/{r}:{i}: logs override '{m.group(1)}: {lvl}' is "
                        f"louder than {SHIPPED_LEVEL}")
    if not levels and not initials:
        err(f"{rel}: no active logger level set anywhere — ESPHome defaults to "
            f"DEBUG; set `logger: level: {SHIPPED_LEVEL}`")
        return
    if initials:
        for r, i, lvl in initials:
            if lvl != SHIPPED_LEVEL:
                err(f"{rel}/{r}:{i}: logger initial_level is {lvl}; shipped "
                    f"firmware must run at {SHIPPED_LEVEL}")
        for r, i, lvl in levels:
            if lvl in LOG_LEVELS and LOG_LEVELS.index(lvl) > LOG_LEVELS.index(MAX_COMPILED_LEVEL):
                err(f"{rel}/{r}:{i}: logger level {lvl} compiles in more than "
                    f"{MAX_COMPILED_LEVEL}; keep it at {MAX_COMPILED_LEVEL} or below")
    else:
        for r, i, lvl in levels:
            if lvl != SHIPPED_LEVEL:
                err(f"{rel}/{r}:{i}: logger level is {lvl} with no initial_level, "
                    f"so the unit runs at {lvl}; ship {SHIPPED_LEVEL}, or compile "
                    f"in more with `initial_level: {SHIPPED_LEVEL}`")


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
            # Rule 12: FPP needs a router network.
            if "fpp_file" in sel and str(sel.get("config", "")).endswith("configs/standalone.yaml"):
                vname = next(k for k, v in spec["variants"].items() if v is vspec)
                err(f"variants.yaml: {dev}/{vname}: FPP ({sel['fpp_file']}) with "
                    f"configs/standalone.yaml — FPP needs a router network "
                    f"(home_assistant or networked config)")
        for key, paths in options.items():
            for path in paths:
                if (key, path) not in variant_enabled:
                    err(f"variants.yaml: {dev}: option '{key}: {path}' in "
                        f"{spec['path']} is never enabled by any variant")
    for rel in DEVICES:
        for main in mains(REPO / rel):
            if main.resolve() not in covered_mains:
                err(f"variants.yaml: no device entry covers {rel}/{main.name}")


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
        check_firmware_update(dev, rel)
        check_logger(dev, rel)
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
