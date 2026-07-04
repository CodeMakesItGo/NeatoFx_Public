# Neato Target IR — LCD Face Setup

Hardware: **1.28" Round TFT, 240×240, GC9A01 driver, 7-pin SPI**  
Board: Rev 3.x target board  
Firmware entry point: `target_main_lcd.yaml`

---

## Wiring

The 7-pin display pinout (left to right on the module): **RST, CS, DC, SDA, SCL, GND, VCC**

| Display Pin | Connect To | Notes |
|-------------|-----------|-------|
| RST | GPIO5 (LEDCTRL) | Already on face connector |
| CS | GND | Wire directly to GND — bypasses R8 on module |
| DC | GPIO21 | New wire through face connector |
| SDA | GPIO19 | Already on face connector (was IR) |
| SCL | GPIO18 | Already on face connector (was trigger) |
| GND | GND | |
| VCC | Aux +5V | Controlled by GPIO26 (ALWAYS_ON) |

### Face connector pins repurposed

| GPIO | Was | Now |
|------|-----|-----|
| GPIO18 | External trigger input | SPI CLK |
| GPIO19 | IR receiver | SPI MOSI |
| GPIO5 | LED Strip 1 | LCD RST |

New wires needed through the face connector:
- **GPIO21** → display DC
- **GPIO32** → IR receiver (relocated from GPIO19)

LED Strip 1 is internally mapped to GPIO13 (unconnected dummy) so the shared hit script compiles without changes. It has no physical effect on the LCD face.

---

## Key Config Decisions

### CS wired to GND, not a GPIO
The module has an R8 resistor footprint to tie CS to GND. Rather than relying on R8 being populated, wire the display CS pin directly to GND on the connector. This permanently selects the display (it's the only device on the SPI bus) and frees GPIO5 for DC.

### GPIO5 for RST, GPIO21 for DC
GPIO5 is the default VSPI\_SS (chip select) pin on ESP32. It was initially suspected to conflict with RST, but the actual blocker was the memory allocation failure (115 KB OOM). Once `color_palette: 8BIT` resolved the memory issue, GPIO5 works correctly as RST.

### `invert_colors: true`
The GC9A01A initializes with hardware display inversion on (INVON). Without `invert_colors: true` in ESPHome, all colors appear inverted — black shows as white, etc.

### `color_palette: 8BIT`
A full 16-bit framebuffer for 240×240 requires 115 KB. The ESP32 (no PSRAM) cannot allocate this contiguous block after WiFi loads (~100 KB). Using `color_palette: 8BIT` (RGB332) halves the buffer to 57 KB, which allocates successfully. Colors are 3-bit red, 3-bit green, 2-bit blue — sufficient for the bullseye palette (black, white, red, yellow).

### `aux_pwr: ALWAYS_ON`
Display VCC is routed through the aux power rail (GPIO26). ESPHome component `setup()` — including the display SPI init sequence — runs before `on_boot` callbacks. The aux power switch must be `ALWAYS_ON` so the display has power when the init sequence is sent. If aux starts OFF, the display receives the init sequence while unpowered and shows garbage after power is restored.

---

## Flash Command

```bash
esphome -s id 1 run SmartTarget/target_main_lcd.yaml
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Static / snow, not changing | SPI not reaching display | Check DC and CS wiring |
| `Could not allocate buffer` | 115 KB framebuffer OOM | Use `color_palette: 8BIT` or `GRAYSCALE` |
| All white | `invert_colors: false` on GC9A01A | Set `invert_colors: true` |
| All grey | `color_palette: GRAYSCALE` active | Switch to `color_palette: 8BIT` for color |
| Display initialized but wrong colors | RGB/BGR order | Try `color_order: RGB` vs `BGR` |
| 976 ms/frame warning | `data_rate` too low | Use `data_rate: 10MHz` |
