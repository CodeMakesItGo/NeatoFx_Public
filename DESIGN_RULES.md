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
│       ├── <feature>.yaml        # swappable/optional packages (drive_dc, drive_ac, can, sound, color_controls)
│       └── custom_ui.js          # web UI
├── configs/
│   ├── networked.yaml            # Home Assistant + web + OTA
│   └── standalone.yaml           # AP-only
├── protocols/                    # IR variants (targets / blaster)
├── integrations/                 # FPP
├── scripts/                      # behavior (hit_script, servo, game_scripts)
├── docs/                         # manuals & setup guides (NEVER schematics)
├── README.md
└── .gitignore
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

- `configs/networked.yaml` includes `improv_serial:` + `dashboard_import:` (MFE compliance) and the `firmware_update` package (web OTA).
- `logger.baud_rate` must be non-zero when improv_serial is used.
- `logger.level: WARN` for production (`INFO`/`DEBUG` for troubleshooting).
- `on_boot`: force hardware to a safe state at the earliest priority (e.g. 900); do status-LED/ready actions last (negative priority).
- `web_server` uses `js_include: "boards/common/custom_ui.js"`.

## 8. Public vs private (what belongs in this submodule)

- **This public submodule = sellable products only.**
- Customer/site-specific builds and non-ESPHome one-offs live in the **private** repo (`Customers/`, `Devices/`).
- **Schematics and hardware design files are private** (`Hardware/<Product>/`), never in the public submodule. `docs/` may hold user manuals and setup guides only.

## 9. Build hygiene

- `.esphome/`, `build/`, `.venv/`, `secrets.yaml`, `.DS_Store`, `.vscode/` are gitignored.
- Validate every change with `esphome config <Line>/Neato<Product>/main.yaml` before commit.
- Batch flashing is via the repo-root `program.sh <device>` (target, display, speaker, motor, blaster, golf).

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
