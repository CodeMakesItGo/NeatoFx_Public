#!/usr/bin/env python3
"""NEATO-FX release builder.

Compiles the shippable firmware for every product that publishes an OTA
manifest, computes each binary's MD5, and writes it back into
firmware/<product>/manifest.json alongside the version and release URL.

The MD5 cannot be filled in by hand ahead of time: ESPHome's
`update: platform: http_request` requires it (components/http_request/update/
http_request_update.cpp checks for it, then feeds it to set_md5() to verify the
download), and builds embed a timestamp so they are not byte-reproducible. The
md5 must therefore come from the exact binary that gets uploaded to the
release, which is what this script produces.

Usage:
  tools/release.py --dry-run              # build + md5, do not touch manifests
  tools/release.py                        # build, md5, rewrite manifests, stage dist/
  tools/release.py --products motor       # just one
  tools/release.py --skip-build           # reuse existing build output

Exit code 0 = success, 1 = failure (details on stderr).
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS = Path(__file__).resolve().parent
FIRMWARE_DIR = REPO_ROOT / "firmware"
DEFAULT_SLUG = "CodeMakesItGo/NeatoFx_Public"

# firmware/<manifest dir> -> device key in tools/variants.yaml.
# The manifest directory name is also the release asset prefix, so
# firmware/target-ir/ ships target-ir-v1.1.0.bin.
PRODUCTS = {
    "audio50": "speaker",
    "motor": "motor",
    "target-ir": "target",
}

# Everything the shipped products actually resolve. Nothing in this repo
# references wifi_ssid/wifi_password — networked_base.yaml deliberately compiles
# in no network — so they are not required here.
REQUIRED_SECRETS = ("ap_password", "ota_password")

# Values from _shared/secrets.template.yaml. A release binary built with these
# would ship the published placeholder passwords to every customer unit.
PLACEHOLDER_SECRETS = {"ChangeMe123", "ChangeMeOTA"}


class _TolerantLoader(yaml.SafeLoader):
    """SafeLoader that does not choke on ESPHome's custom tags.

    `esphome config` echoes the merged config with tags intact
    (`ota_password: !secret 'ota_password'`, `!lambda`, ...). safe_load raises
    ConstructorError on those, so unknown tags are reduced to their underlying
    scalar/sequence/mapping — enough for the handful of plain keys read here.
    """


def _construct_unknown(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node)
    return loader.construct_mapping(node)


_TolerantLoader.add_multi_constructor("", _construct_unknown)


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def check_secrets():
    """Refuse to build a release against the template placeholders."""
    secrets = REPO_ROOT / "_shared" / "secrets.yaml"
    if not secrets.exists():
        die("_shared/secrets.yaml missing — a release build needs the real "
            "ap_password/ota_password, not the template")
    data = yaml.safe_load(secrets.read_text()) or {}
    missing = [k for k in REQUIRED_SECRETS if not data.get(k)]
    if missing:
        die(f"_shared/secrets.yaml is missing: {', '.join(missing)}")
    bad = sorted(k for k, v in data.items() if str(v) in PLACEHOLDER_SECRETS)
    if bad:
        die(f"_shared/secrets.yaml still has template placeholder(s): "
            f"{', '.join(bad)}. Every unit flashed with this release would "
            f"ship those published passwords. Populate real values first.")


def esphome_config(main_yaml: Path, subs: dict) -> dict:
    """Return the merged config's name / build_path / project version."""
    cmd = ["esphome"]
    for k, v in (subs or {}).items():
        cmd += ["-s", k, str(v)]
    cmd += ["config", str(main_yaml)]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        die(f"esphome config failed for {main_yaml}\n{out.stdout[-2000:]}")
    cfg = yaml.load(out.stdout, Loader=_TolerantLoader)
    esph = cfg["esphome"]
    return {
        "name": esph["name"],
        "build_path": esph["build_path"],
        "version": str(esph["project"]["version"]),
    }


def ota_binary(main_yaml: Path, info: dict) -> Path:
    """Locate the OTA image for a compiled product.

    firmware.ota.bin is the image the OTA path flashes — NOT firmware.bin
    (which for some targets is a full-flash image) and not firmware.factory.bin
    (bootloader + partitions, USB only).
    """
    p = (main_yaml.parent / ".esphome" / info["build_path"]
         / ".pioenvs" / info["name"] / "firmware.ota.bin")
    if not p.exists():
        die(f"expected OTA image not found: {p}\n"
            f"       (did the compile succeed?)")
    return p


def md5_of(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build(device: str, subs: dict, skip: bool) -> None:
    if skip:
        print(f"  (--skip-build: reusing existing output for {device})")
        return
    rc = subprocess.call([sys.executable, str(TOOLS / "build_variant.py"),
                          device, "default", "--check", "compile", "--keep"])
    if rc != 0:
        die(f"compile failed for {device}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--products", nargs="*", default=sorted(PRODUCTS),
                    help=f"subset of {sorted(PRODUCTS)}")
    ap.add_argument("--dry-run", action="store_true",
                    help="build and report md5 without rewriting manifests")
    ap.add_argument("--skip-build", action="store_true",
                    help="reuse existing build output (for re-running locally)")
    ap.add_argument("--dist", default="dist",
                    help="directory to stage renamed release assets into")
    ap.add_argument("--slug", default=os.environ.get("GITHUB_REPOSITORY",
                                                     DEFAULT_SLUG),
                    help="owner/repo used to build the release download URL")
    ap.add_argument("--allow-placeholder-secrets", action="store_true",
                    help="CI-only escape hatch; never use for a real release")
    args = ap.parse_args()

    unknown = set(args.products) - set(PRODUCTS)
    if unknown:
        die(f"unknown product(s): {', '.join(sorted(unknown))}")

    if not args.allow_placeholder_secrets:
        check_secrets()

    matrix = yaml.safe_load((TOOLS / "variants.yaml").read_text())["devices"]
    dist = REPO_ROOT / args.dist
    dist.mkdir(parents=True, exist_ok=True)

    results, versions = [], {}
    for product in args.products:
        device = PRODUCTS[product]
        spec = matrix[device]
        main_yaml = REPO_ROOT / spec["path"]
        subs = spec.get("substitutions") or {}

        print(f"\n== {product} ({spec.get('label', device)}) ==", flush=True)
        build(device, subs, args.skip_build)
        info = esphome_config(main_yaml, subs)
        binary = ota_binary(main_yaml, info)
        digest = md5_of(binary)
        versions[product] = info["version"]

        tag = f"v{info['version']}"
        asset = f"{product}-{tag}.bin"
        shutil.copy2(binary, dist / asset)
        results.append({
            "product": product, "version": info["version"], "tag": tag,
            "asset": asset, "md5": digest,
            "size": binary.stat().st_size,
        })
        print(f"  {binary.relative_to(REPO_ROOT)}")
        print(f"  -> {asset}  md5={digest}  ({binary.stat().st_size:,} bytes)")

    # Every product shares one fleet version; a mismatch means a stale
    # project_version somewhere and would tag the release wrong.
    distinct = sorted(set(versions.values()))
    if len(distinct) > 1:
        die("products disagree on version: "
            + ", ".join(f"{p}={v}" for p, v in sorted(versions.items())))
    version = distinct[0]
    tag = f"v{version}"

    for r in results:
        path = FIRMWARE_DIR / r["product"] / "manifest.json"
        m = json.loads(path.read_text())
        ota = m["builds"][0]["ota"]
        m["version"] = r["version"]
        ota["path"] = (f"https://github.com/{args.slug}/releases/download/"
                       f"{r['tag']}/{r['asset']}")
        ota["md5"] = r["md5"]
        if args.dry_run:
            print(f"\n[dry-run] would write {path.relative_to(REPO_ROOT)}:")
            print(f"          version={m['version']} md5={ota['md5']}")
        else:
            path.write_text(json.dumps(m, indent=2) + "\n")
            print(f"\nwrote {path.relative_to(REPO_ROOT)}")

    print(f"\nRelease {tag} — {len(results)} product(s), assets staged in "
          f"{dist.relative_to(REPO_ROOT)}/")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"tag={tag}\nversion={version}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
