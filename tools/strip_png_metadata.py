#!/usr/bin/env python3
"""Strip non-essential chunks from PNG artwork.

Design-tool exports (Canva, Illustrator) tuck the original vector source into a
private PNG chunk — Canva uses `caBX`, and it lands within the first 1 KB of the
file, right after IHDR. ESPHome sniffs image type with
`"<svg" in str(f.read(1024))` (components/image/__init__.py), so such a PNG is
misread as an SVG, handed to the resvg Rust rasterizer, and the process dies
with `Abort trap: 6` (panic: "can't convert bytes to utf-8") — no usable error.

This rewrites affected files keeping only the chunks a decoder needs. IDAT is
copied byte-for-byte, so pixels are untouched; only metadata is dropped.

    tools/strip_png_metadata.py                 # strip every images/ dir
    tools/strip_png_metadata.py --check         # report only, exit 1 if any
    tools/strip_png_metadata.py path/to/*.png   # explicit files
"""

import struct
import sys
from pathlib import Path

# Chunks a decoder actually needs. Everything else (tEXt/iTXt/eXIf/caBX/...)
# is metadata and goes.
KEEP = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP"}

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def chunks(data: bytes):
    i = len(PNG_MAGIC)
    while i + 8 <= len(data):
        length = struct.unpack(">I", data[i : i + 4])[0]
        yield data[i + 4 : i + 8], data[i : i + 12 + length]
        i += 12 + length


def trips_esphome_svg_sniff(data: bytes) -> bool:
    """Mirror of esphome.components.image.is_svg_file."""
    return "<svg" in str(data[:1024])


def process(path: Path, check_only: bool) -> bool:
    """Return True if the file needed (or would need) stripping."""
    data = path.read_bytes()
    if not data.startswith(PNG_MAGIC):
        return False
    if not trips_esphome_svg_sniff(data):
        return False

    kept, dropped = bytearray(PNG_MAGIC), []
    for kind, raw in chunks(data):
        if kind in KEEP:
            kept += raw
        else:
            dropped.append(f"{kind.decode('latin1')}({len(raw) - 12}B)")

    label = ", ".join(dropped) or "none"
    if check_only:
        print(f"  {path}: reads as SVG to ESPHome — would drop {label}")
        return True

    if trips_esphome_svg_sniff(bytes(kept)):
        print(f"  {path}: STILL reads as SVG after stripping {label} — needs re-export")
        return True

    path.write_bytes(bytes(kept))
    print(f"  {path}: dropped {label}  ({len(data)} -> {len(kept)} bytes)")
    return True


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--check"]
    check_only = "--check" in sys.argv

    if args:
        targets = [Path(a) for a in args]
    else:
        root = Path(__file__).resolve().parent.parent
        targets = sorted(root.glob("*/*/images/*.png"))

    hits = [p for p in targets if p.is_file() and process(p, check_only)]

    if check_only and hits:
        print(
            f"{len(hits)} PNG(s) carry embedded SVG metadata and will crash the "
            f"ESPHome build. Fix with: tools/strip_png_metadata.py"
        )
        return 1
    if hits and not check_only:
        print(f"Stripped {len(hits)} PNG(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
