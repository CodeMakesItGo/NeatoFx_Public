# NeatoFx Display 4

A modular ESPHome project for the 480×480 touch-screen game display station.

## Folder Structure

```
Displays/NeatoDisplay4/
├── main.yaml                          ← Entry point — set station ID and color here
├── boards/
│   ├── rev1.yaml                      ← Hardware: ESP32-S3, ST7701S display, GT911 touch
│   └── common/
│       ├── common.yaml                ← Shared: ESPHome config, OTA, external components
│       └── screens.yaml               ← LVGL UI, screen definitions, template sensors
├── configs/
│   └── networked.yaml                 ← WiFi, API services, web server, diagnostics
├── scripts/
│   └── game_scripts.yaml              ← Game logic: reset, shot-count game, timed game
├── fonts/                             ← Font files (add manually — see below)
└── images/                            ← Screen background PNGs (add manually — see below)
```

## Required Assets

### Fonts (`fonts/`)
| File | Used for |
|---|---|
| `Roboto-Bold.ttf` | Score, hit, shot counter labels |
| `Roboto-Regular.ttf` | Small UI text |

### Images (`images/`)
| File | Screen |
|---|---|
| `GAME_START_YLW.png` | Boot splash — yellow |
| `GAME_START_GRN.png` | Boot splash — green |
| `GAME_START_BLU.png` | Boot splash — blue |
| `GAME_START_ORG.png` | Boot splash — orange |
| `GAME_SHOTS_YLW.png` | Shot-count background — yellow |
| `GAME_SHOTS_GRN.png` | Shot-count background — green |
| `GAME_SHOTS_BLU.png` | Shot-count background — blue |
| `GAME_SHOTS_ORG.png` | Shot-count background — orange |
| `GAME_OVER.png` | End-of-game screen (shared) |

All images should be 480×480 PNG.

## Usage

### Flashing with Color

Each station has a color theme that sets the background image and font color.
Pass `-s color` and `-s font_color` on the command line:

| Color | `color` | `font_color` |
|---|---|---|
| Yellow | `YLW` | `0xFFE000` |
| Green | `GRN` | `0x00E000` |
| Blue | `BLU` | `0x00BFFF` |
| Orange | `ORG` | `0xFF6000` |

```bash
# Station 1 — Yellow
esphome -s id 1 -s color YLW -s font_color 0xFFE000 run Displays/NeatoDisplay4/main.yaml

# Station 4 — Green
esphome -s id 4 -s color GRN -s font_color 0x00E000 run Displays/NeatoDisplay4/main.yaml

# Station 2 — Blue
esphome -s id 2 -s color BLU -s font_color 0x00BFFF run Displays/NeatoDisplay4/main.yaml

# Station 3 — Orange
esphome -s id 3 -s color ORG -s font_color 0xFF6000 run Displays/NeatoDisplay4/main.yaml
```

### Batch Programming

Use `program.sh` from the parent repo to compile and upload multiple displays.
Colors are assigned automatically by ID (1→YLW, 2→GRN, 3→BLU, 4→ORG, cycling):

```bash
# Compile + upload displays 1–4
./program.sh display 1 4

# Compile only
./program.sh display compile

# Upload only (already compiled)
./program.sh display upload
```

## Home Assistant Services

Call these from automations to update the display live:

| Service | Variable | Effect |
|---|---|---|
| `esphome.station_20X_set_score` | `score_value: int` | Update score label |
| `esphome.station_20X_set_hit` | `score_value: int` | Update hit count label |
| `esphome.station_20X_set_shot` | `score_value: int` | Update remaining shots label |
