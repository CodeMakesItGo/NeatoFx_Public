# Neato Target IR — LCD Face Setup

Hardware: **1.28" Round TFT, 240×240, GC9A01 driver, 7-pin SPI**  
Board: Rev 3.x target board  
Board file: `boards/rev3_lcd_1_1.yaml` (current) / `boards/rev3_lcd_1_0.yaml` (legacy face)

---

## Face revisions

| | Face 1.0 | Face 1.1 (current) |
|---|---|---|
| GPIO5 | LCD RST | **LED CTRL** — Target LEDs, 6× WS2812 |
| GPIO32 | IR receiver | **LCD RST** |
| GPIO35 | — | **IR receiver** |
| LED Strip 1 | dummy pin GPIO13, no physical LEDs | real 6-LED ring |

Face 1.1 restores the target LED ring, so it has full `boards/rev3.yaml` feature
parity except for the GPIO18 external trigger input (that pin is the SPI clock).
Use the **GPIO25 Hit Trigger** switch as the wired-trigger substitute.

---

## Wiring (face 1.1)

The 7-pin display pinout (left to right on the module): **RST, CS, DC, SDA, SCL, GND, VCC**

| Display Pin | Connect To | Notes |
|-------------|-----------|-------|
| RST | GPIO32 | Routed through face connector |
| CS | GND | Wire directly to GND — bypasses R8 on module |
| DC | GPIO21 | Routed through face connector |
| SDA | GPIO19 | Already on face connector (was IR) |
| SCL | GPIO18 | Already on face connector (was trigger) |
| GND | GND | |
| VCC | Aux +5V | Controlled by GPIO26 (ALWAYS_ON) |

Non-display face wires:

| GPIO | Function |
|------|----------|
| GPIO5 | LED CTRL — 6× WS2812 ring data |
| GPIO35 | IR receiver output |

### Face connector pins repurposed vs `boards/rev3.yaml`

| GPIO | Was | Now |
|------|-----|-----|
| GPIO18 | External trigger input | SPI CLK (trigger input dropped) |
| GPIO19 | IR receiver | SPI MOSI |
| GPIO5 | LED Strip 1 | LED Strip 1 (unchanged) |

### GPIO35 has no internal pull-up

GPIO34–39 on the ESP32 are input-only and have **no** internal pull-up/pull-down.
The IR pin's pull-up is therefore a substitution (`ir_pullup`, defined in
`boards/common/common.yaml`, set to `"false"` in the face-1.1 board file).
TSOP-style receivers already pull their own output up through an internal ~30 kΩ
resistor, so no external resistor is needed. If your receiver module has a bare
open-collector output, fit a 4.7–10 kΩ resistor from GPIO35 to 3V3.

This boot-time log line is expected and harmless:

```
E (520) gpio: gpio_pullup_en(85): GPIO number error (input-only pad has no internal PU)
```

ESP-IDF's RMT RX driver hard-codes `pull_up_en = true` on the receive GPIO in its
own `gpio_config()` call, independently of the pin config ESPHome generates.
`gpio_config()` discards the return value, so the RMT channel is created normally.
It cannot be suppressed from YAML.

---

## Key Config Decisions

### CS wired to GND, not a GPIO
The module has an R8 resistor footprint to tie CS to GND. Rather than relying on R8 being populated, wire the display CS pin directly to GND on the connector. This permanently selects the display (it's the only device on the SPI bus) and frees GPIO5 for DC.

### GPIO32 for RST, GPIO21 for DC (face 1.1)
On face 1.0 RST sat on GPIO5. Face 1.1 gives GPIO5 back to the LED ring and moves
RST to GPIO32, freeing nothing else — GPIO32 is a plain bidirectional pin and RST
is only toggled once at init. (Historical note: GPIO5 as RST was initially
suspected of conflicting with VSPI\_SS; the actual blocker was the 115 KB
framebuffer OOM, fixed by `color_palette: 8BIT`.)

### `auto_clear_enabled: false`
Auto-clear runs *before* the display lambda and fills the entire framebuffer,
which marks all 240×240 pixels dirty on every tick. That defeats the ili9xxx
dirty-rectangle optimisation (forcing a ~25 ms full-frame SPI flush 10×/s that
stalls the LED animation) and blanks the panel on idle ticks where the lambda
returns early. Every branch of the lambda calls `it.fill()` itself, so auto-clear
must stay off.

### `invert_colors: true`
The GC9A01A initializes with hardware display inversion on (INVON). Without `invert_colors: true` in ESPHome, all colors appear inverted — black shows as white, etc.

### `color_palette: 8BIT`
A full 16-bit framebuffer for 240×240 requires 115 KB. The ESP32 (no PSRAM) cannot allocate this contiguous block after WiFi loads (~100 KB). Using `color_palette: 8BIT` (RGB332) halves the buffer to 57 KB, which allocates successfully. Colors are 3-bit red, 3-bit green, 2-bit blue — sufficient for the bullseye palette (black, white, red, yellow).

### `aux_pwr: ALWAYS_ON`
Display VCC is routed through the aux power rail (GPIO26). ESPHome component `setup()` — including the display SPI init sequence — runs before `on_boot` callbacks. The aux power switch must be `ALWAYS_ON` so the display has power when the init sequence is sent. If aux starts OFF, the display receives the init sequence while unpowered and shows garbage after power is restored.

---

## Flash Command

Select the LCD board line in `main.yaml`, then:

```bash
esphome -s id 1 run Targets/NeatoTargetIR/main.yaml
```

---

## Resource budget (LCD + 6 LEDs + IR together)

| Resource | Used | Headroom |
|---|---|---|
| RAM | ~58 KB framebuffer (8-bit palette) + WiFi/API/web | Tight; do **not** go back to 16-bit, and **no BLE** (see below) |
| RMT channels | 1 (LED ring, 64 sym) + 2 (LED strip 2, 128 sym) + 1 (IR RX) = 4 of 8 | OK |
| SPI | VSPI, display only, 40 MHz | OK |
| LEDC | ch 0 (servo, timer 0), ch 2 (GND ramp, timer 1) | OK |
| Main loop | Full-frame flush ≈ 25 ms; happens only while `hit_processing` is true | Worst case ~25 % duty during a hit |

IR reception is captured by the RMT peripheral in hardware and drained from a
10 kB ring buffer, so a display flush delays decoding but never drops a frame.
LED updates are also RMT-driven (≈180 µs for 6 LEDs). The only visible symptom of
running all three at once is slight LED-animation jitter during the LCD hit
animation. If that matters, raise the display `update_interval` from 100 ms to
150–200 ms — the hit animations are coarse enough to tolerate it.

---

### No BLE on LCD builds

`_shared/networked_base.yaml` enables `esp32_improv`, which pulls in Bluedroid
(~60–70 KB internal DRAM). That does not coexist with the 57.6 KB framebuffer on a
no-PSRAM ESP32 — `btc_config_init()` fails, then Bluedroid aborts on a NULL mutex:

```
assert failed: xQueueSemaphoreTake queue.c:1709 (( pxQueue ))
  ... btc_config_lock → btc_storage_get_ble_local_key → btc_init_bluetooth
```

`main.yaml` carries `esp32_improv: !remove` for LCD builds. It must live in
`main.yaml`, not the board file: `!remove` only takes effect from the top-level
config, which merges last; board packages merge first as the lowest-precedence
base, so a `!remove` there is a no-op. **Comment the line back out when switching
back to a non-LCD board.** `improv_serial` (UART provisioning) is unaffected.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Boot loop, `btc_init_bluetooth` assert | Bluedroid + framebuffer OOM | `esp32_improv: !remove` in `main.yaml` |
| `gpio_pullup_en ... input-only pad has no internal PU` | IDF RMT driver requesting a pull-up on GPIO35 | None needed — harmless |
| Static / snow, not changing | SPI not reaching display | Check DC and CS wiring |
| `Could not allocate buffer` | 115 KB framebuffer OOM | Use `color_palette: 8BIT` or `GRAYSCALE` |
| All white | `invert_colors: false` on GC9A01A | Set `invert_colors: true` |
| All grey | `color_palette: GRAYSCALE` active | Switch to `color_palette: 8BIT` for color |
| Display initialized but wrong colors | RGB/BGR order | Try `color_order: RGB` vs `BGR` |
| 976 ms/frame warning | `data_rate` too low | Use `data_rate: 10MHz` |
