# NEATO-FX Device Design Rules

Standards every device in this repo follows so they stay consistent, buildable, and easy to maintain. New devices should match this exactly.

## 1. One `main.yaml` per device (the core rule)

Each device has a **single entry point, `main.yaml`**. There are no `main_winch.yaml` / `main_ac.yaml` / `main_lcd.yaml` side files. Variants are selected by un-commenting one line inside `main.yaml`, grouped with a clear "select exactly ONE" comment.

```yaml
packages:
  # ---- BOARD / BEHAVIOR — select exactly ONE ----
  board: !include boards/rev3.yaml            # standard
  #board: !include boards/rev3_winch.yaml     # winch
  #board: !include boards/rev3_pulse.yaml     # pulse

  # ---- DRIVE — select ONE (standard board only) ----
  drive: !include boards/common/drive_dc.yaml
  #drive: !include boards/common/drive_ac.yaml

  # ---- NETWORK — select ONE ----
  config: !include configs/networked.yaml
  #config: !include configs/standalone.yaml

  # ---- OPTIONAL ADD-ONS ----
  #can:   !include boards/common/can.yaml
  #sound: !include boards/common/sound.yaml
```

Anything that would otherwise be a separate main becomes either a **board variant** (`boards/rev3_x.yaml`, self-contained) or a **swappable package** (`boards/common/x.yaml`).

## 2. Standard folder layout

```
<ProductLine>/Neato<Product>/
├── main.yaml                     # single entry point
├── boards/
│   ├── rev3.yaml                 # hardware def; includes common/common.yaml
│   ├── rev3_<variant>.yaml       # self-contained hardware variants (lcd, winch, pulse, manual)
│   └── common/
│       ├── common.yaml           # shared logic; drive-AGNOSTIC where drives are swappable
│       ├── rev<N>_common.yaml    # ONLY when revisions can't share one common (e.g. Blaster rev1/rev3)
│       ├── <feature>.yaml        # swappable/optional packages (drive_dc, drive_ac, can, sound, rftx_*, color_controls)
│       └── custom_ui.js          # web UI
├── configs/
│   ├── networked.yaml            # Home Assistant + web + OTA
│   └── standalone.yaml           # AP-only (omit ONLY for networked-only products, e.g. Displays)
├── protocols/                    # IR variants (targets / blaster)
├── integrations/                 # <product>_fpp.yaml (FPP integration)
├── scripts/                      # behavior (hit_script, servo, game_scripts)
├── docs/                         # manuals & setup guides (NEVER schematics); omit if no docs yet
├── README.md
└── .gitignore
```

Package keys in `main.yaml` use the standard names: `board`, `drive`, `rftx`, `config`, `fpp_file`, plus script/protocol keys. Variant selectors (board revisions, drive types, RFTX modes) live in `boards/` or `boards/common/`; product-name prefixes on standard files (`golf_common.yaml`, `blaster_networked_config.yaml`) are not allowed.

Every project's `.gitignore` is identical:

```
/.esphome/
/build/
secrets.yaml
.DS_Store
```

## 3. Drive-agnostic common (so drives swap)

When a device supports more than one drive type, `common.yaml` holds the **framework only** (globals, shared stop script, cover, controls, sensors) and leaves the direction primitives (`motor_forward_start` / `motor_reverse_start`, etc.) to a **swappable `drive:` package**. This is why NeatoMotor can run DC or AC from the same firmware. Never bake a specific drive into `common.yaml`.

## 4. Shared bases live in `_shared/` — include-path depth

All devices pull common infrastructure from the submodule-root `_shared/`. Because every device sits at `<Line>/<Product>/` (two levels deep), the relative depth is fixed:

| From | Include prefix |
|---|---|
| `main.yaml`, `configs/*`, `scripts/*`, `boards/*` | `../../../_shared/` |
| `boards/common/*` | `../../../../_shared/` |

Shared files: `esphome_base.yaml`, `networked_base.yaml`, `standalone_base.yaml`, `network_sensors.yaml`, `firmware_update.yaml`, `secrets.yaml` (gitignored; copy from `secrets.template.yaml`).

## 5. Substitutions & identity

`main.yaml` defines:

```yaml
substitutions:
  id: "1"
  name: "<device>-${id}"
  friendly_name: "Neato <Device> ${id}"
```

`project_name: "CodeMakesItGo.<Device>"` and `project_version` live in `common.yaml` or the board. Every device is parameterized by `-s id <N>`.

## 6. Naming

- Product lines: `Targets/`, `Audio/`, `Displays/`, `Controllers/`, `Golf/`. Product folders: `Neato<Product>`.
- **No `Smart` prefix** anywhere — the brand is **Neato**.
- Entry file is always `main.yaml`; other files use `lower_snake_case`.

## 7. "Made for ESPHome" / boot / logging conventions

- `configs/networked.yaml` includes `improv_serial:` + `dashboard_import:` (MFE compliance). The `dashboard_import.package_import_url` must point at THIS device's `main.yaml` (copy-paste from a sibling device has caused wrong-URL bugs — always verify).
- If a device has `configs/home_assistant.yaml`, `main.yaml`'s **active** (uncommented) `config:` package must point to it. Units are pre-flashed straight from `main.yaml`, and Made for ESPHome requires HA support (the native `api:`, plus `esphome.<device>-hit`-style events) to work the moment a customer powers the unit on — `networked.yaml` (No-HA LAN) and `standalone.yaml` (AP-only) stay available as commented alternatives for installs that intentionally don't want a Home Assistant server, but they must never be the shipped default once `home_assistant.yaml` exists. (This is the bug ESPHome's review caught on the NeatoTargetIR submission — `main.yaml` and the docs `config.yaml` had both drifted to `networked.yaml`.)
- The `firmware_update` package + `update:` block are included where a published manifest exists at `firmware/<product>/manifest.json`. When a new product's firmware is published, add both.
- `logger.baud_rate` must be non-zero when improv_serial is used (never `baud_rate: 0` in a device that can run the networked config).
- `logger.level: WARN` for production (`INFO`/`DEBUG` for troubleshooting).
- `on_boot`: force hardware to a safe state at the earliest priority (e.g. 900); do status-LED/ready actions last (negative priority).
- `web_server` uses `js_include: "boards/common/custom_ui.js"` where the device ships a custom web UI.

## 8. Public vs private (what belongs in this submodule)

- **This public submodule = sellable products only.**
- Customer/site-specific builds and non-ESPHome one-offs live in the **private** repo (`Customers/`, `Devices/`).
- **Schematics and hardware design files are private** (`Hardware/<Product>/`), never in the public submodule. `docs/` may hold user manuals and setup guides only.

## 9. Build hygiene

- `.esphome/`, `build/`, `.venv/`, `secrets.yaml`, `.DS_Store`, `.vscode/` are gitignored.
- Validate every change with `esphome config <Line>/Neato<Product>/main.yaml` before commit.
- Batch flashing is via the repo-root `program.sh <device>` (target, display, speaker, motor, blaster, golf).

## 10. Automated enforcement (CI)

Rules 1–9 are enforced automatically — don't rely on memory:

- **Pre-commit hook** (`tools/hooks/pre-commit`, installed via `tools/install-hooks.sh`): runs `esphome config` on every device whose files changed, plus the repo lint script (`tools/lint_repo.py`) that checks naming, layout, include depths, dashboard-import URLs, and — for any device that has `configs/home_assistant.yaml` — that `main.yaml`'s active `config:` package is `home_assistant.yaml`.
- **GitHub Actions** (`.github/workflows/ci.yaml`): on every PR and push to `main`, compiles **every device × variant combination** (from `tools/variants.yaml`) with the **latest ESPHome release** and fails on any warning. CI uses `tools/ci_secrets.yaml` as a dummy `secrets.yaml`.
- **Hardware-in-the-loop**: PRs labeled `hw-test` (or pushes to `main`) additionally run the physical test bench via the self-hosted runner (see `testbench/` in the private repo).

If CI is red, the change does not merge. If a new variant axis is added to a `main.yaml`, add it to `tools/variants.yaml` in the same PR — the lint script fails if a commented package option is missing from the matrix.

---

## Commonalities observed across the current devices

These already hold today and are the basis for the rules above:

- **Single `main.yaml`** assembling packages via `!include` (now true for every device after the NeatoMotor consolidation).
- **`boards/rev<N>.yaml` → `boards/common/common.yaml`** hardware→logic split.
- **`configs/networked.yaml` + `configs/standalone.yaml`** operating-mode pair.
- **`_shared/` bases** (`esphome_base`, `networked_base`, `standalone_base`, `network_sensors`, `firmware_update`) with the fixed include depths above.
- **Substitutions** `id` / `name` / `friendly_name` + `project: CodeMakesItGo.<Device>`.
- **Safe-state `on_boot`**, `WARN` logging, improv + dashboard_import for MFE, `custom_ui.js` web UI.
- **IR devices** (Target, Blaster) share the `protocols/` set (`ir_nec`, `ir_raw`, `ir_laser_tag`, `ir_custom`) and `integrations/` FPP.
- **Servo/effect devices** (Target, Golf) share `scripts/servo_movement_script.yaml`, `servo_stubs.yaml`, `servo_pwm_effects.yaml`, `color_controls.yaml`.
