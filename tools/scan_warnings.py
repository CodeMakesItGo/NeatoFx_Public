#!/usr/bin/env python3
"""Fail if an ESPHome build log contains warnings.

Usage: scan_warnings.py <logfile>

Lines matching tools/warning_allowlist.txt (regex per line, # comments OK)
are ignored. Everything else containing 'warning' (case-insensitive, as an
ESPHome/gcc/platformio warning marker) fails the build.
"""

import re
import sys
from pathlib import Path

ALLOWLIST = Path(__file__).resolve().parent / "warning_allowlist.txt"

# Markers that indicate a real toolchain/config warning line
MARKERS = (
    re.compile(r"^WARNING\b"),                # esphome config/CLI warnings
    re.compile(r"\bwarning:\s", re.I),        # gcc/clang/ld
    re.compile(r"^\s*Warning!", re.I),        # platformio
    re.compile(r"DeprecationWarning|deprecated", re.I),
)


def load_allowlist():
    if not ALLOWLIST.exists():
        return []
    pats = []
    for line in ALLOWLIST.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            pats.append(re.compile(line))
    return pats


def main(path):
    allow = load_allowlist()
    hits = []
    for line in Path(path).read_text(errors="replace").splitlines():
        # Skip device-runtime log statements baked into configs (ESP_LOGW etc.)
        if "ESP_LOG" in line or "logger.log" in line:
            continue
        if any(m.search(line) for m in MARKERS):
            if not any(a.search(line) for a in allow):
                hits.append(line.strip())
    if hits:
        print(f"scan_warnings: {len(hits)} warning line(s) found:")
        for h in hits[:50]:
            print(f"  ✗ {h}")
        return 1
    print("scan_warnings: clean ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
