# NeatoFx Relay 8 — 8-Channel WiFi Relay Controller

The NeatoFx Relay 8 is a WiFi-enabled eight-channel relay controller for interactive attractions, escape rooms, shooting galleries and show control. Each channel can be latched on and off, or fired as a timed pulse — one board covers eight props, valves, lights or contactors, driven from Home Assistant, from a browser, or from the ESPHome API.

## Table of Contents

- [Overview](#overview)
- [Hardware](#hardware)
- [Getting Started](#getting-started)
- [Controls](#controls)
- [Home Assistant](#home-assistant)
- [Safety Behaviour](#safety-behaviour)
- [Troubleshooting](#troubleshooting)

## Overview

The Relay 8 drives:

- **Props and set pieces**: lights, fans, smoke, motors via external contactors
- **Solenoids and air valves**: timed pulse firing per channel
- **Show cues**: eight independent dry-contact outputs on one address
- **Prize and dispenser mechanisms**: single-shot pulses of a known length
- **Mains loads**: through appropriately rated relays / contactors

Every channel is independent — nothing is ganged, interlocked or paired in firmware.

## Hardware

### Board Specifications

- **MCU**: ESP32-WROOM-32E (`esp32dev`)
- **Channels**: 8 relays, one GPIO each
- **WiFi**: 802.11 b/g/n (2.4 GHz only)
- **Modes**: networked (Home Assistant + web UI) or standalone AP

### Rev 1.x Pin Map

| Pin | Function | Notes |
|-----|----------|-------|
| GPIO32 | Relay 1 | |
| GPIO33 | Relay 2 | |
| GPIO25 | Relay 3 | |
| GPIO26 | Relay 4 | |
| GPIO27 | Relay 5 | |
| GPIO14 | Relay 6 | |
| GPIO12 | Relay 7 | **Strapping pin (MTDI)** — must idle LOW at reset, see below |
| GPIO13 | Relay 8 | |

### GPIO12 / Relay 7 — boot strapping

GPIO12 is the ESP32's MTDI strapping pin. The WROOM-32E's SPI flash runs at 3.3 V, which the chip selects by sampling GPIO12 **LOW** at reset. If anything holds that pin HIGH as the board comes out of reset — an external pull-up, or an opto-isolated relay input pulled up to 3.3 V — the module latches the wrong flash voltage and does not boot at all. There is no log and no error; the board simply appears dead.

The firmware side is already safe: the relay switches are `ALWAYS_OFF` and ESPHome writes each pin low *before* configuring it, so the ESP32 never drives GPIO12 high by itself. The requirement is on the hardware — the Relay 7 driver must idle LOW, with no pull-up on the ESP32 side.

### Relay polarity

`relay_inverted` in [`boards/rev1.yaml`](boards/rev1.yaml) matches the firmware's idea of "on" to the driver hardware:

| Value | Meaning |
|---|---|
| `"false"` (default) | **Active HIGH** — GPIO high energises the coil (transistor / MOSFET low-side driver) |
| `"true"` | **Active LOW** — GPIO low energises the coil (typical off-the-shelf opto-isolated relay modules) |

Set it once to match the board. It is a hardware fact, not a per-unit setting, so it is a build-time substitution rather than a web UI control. An active-LOW board must not put Relay 7 on GPIO12 — inverting the pin inverts its boot state too, which is exactly what the strapping note above forbids.

## Getting Started

```bash
# Compile + flash over USB
esphome run Controllers/NeatoRelay8/main.yaml

# Compile only / watch logs
esphome compile Controllers/NeatoRelay8/main.yaml
esphome logs    Controllers/NeatoRelay8/main.yaml
```

Or flash a batch from the repo root:

```bash
./program.sh relay8            # compile once, flash unit after unit
./program.sh relay8 compile    # compile only
./program.sh relay8 upload 4   # flash 4 units from the existing build
```

**One binary, runtime identity.** Every Relay 8 runs the same firmware. The hostname carries the board's MAC (`relay8-a1b2c3`), and the board's logical number is the **Device ID**, set once from the web UI and kept in flash. Swapping in a replacement board is: flash it, set the same Device ID, done.

### First power-up

1. The board raises a setup hotspot named after itself (`relay8-a1b2c3`); the password is `ap_password` from `_shared/secrets.yaml`.
2. Join it and enter your WiFi credentials (or provision over USB / BLE with Improv).
3. Open `http://relay8-a1b2c3.local/` and set the **Device ID**. The board reboots so every consumer of the ID sees the same value.

### Network modes

Select one `config:` package in [`main.yaml`](main.yaml):

| Config package | Behavior |
|---|---|
| `configs/networked.yaml` | Joins your router. Web UI, ESPHome/Home Assistant API, channel-number actions. Works with or without a Home Assistant server. **Default.** |
| `configs/standalone.yaml` | AP-only. The board runs its own hotspot and is controlled from a browser — no router, no Home Assistant. |

## Controls

Available in the web UI, and as entities in Home Assistant when networked:

| Control | Type | Purpose |
|---|---|---|
| **Relay 1 … Relay 8** | Switch | Latch a channel on or off |
| **Pulse Relay 1 … 8** | Button | Energise that channel for **Pulse Time**, then release it |
| **All Relays Off** | Button | Drop every channel — the panic / show-reset control |
| **All Relays On** | Button | Energise every channel (bench testing, continuity checks) |
| **Pulse Time** | Number | Pulse on-time in ms, 10–10000, default 250. Shared by all eight channels, saved to flash |
| **Relay States** | Text sensor | Channel map, e.g. `12--5---` = relays 1, 2 and 5 energised |
| **Relays On** | Sensor | How many channels are currently energised |
| **Any Relay On** | Binary sensor | True while any channel is energised |
| **Device ID** | Number | This board's logical number, 0–99 (0 = unassigned) |
| **Relay Board Name** | Text sensor | `relay8-<Device ID>` — which board this is, independent of the MAC hostname |
| **Firmware Version** | Text sensor | Firmware and hardware revision |

Pulses run in parallel, so all eight channels can be firing at once.

## Home Assistant

With `configs/networked.yaml`, the board appears as a standard ESPHome device: eight switches, the pulse buttons and the summary sensors, all usable directly.

For automations, prefer the channel-number actions over entity names. Home Assistant derives entity ids from the device name, which carries the MAC suffix — an automation written against `switch.relay8_a1b2c3_relay_3` breaks the moment the board is swapped, while these take a plain 1-based channel number:

| Action | Fields | Effect |
|---|---|---|
| `esphome.<device>_set_relay` | `relay` (1–8), `state` (bool) | Latch a channel on or off |
| `esphome.<device>_pulse_relay` | `relay` (1–8) | Fire the channel for **Pulse Time** |
| `esphome.<device>_all_relays_off` | — | Drop every channel |

An out-of-range channel number is logged and ignored rather than acted on.

## Safety Behaviour

- **The board never wakes up energised.** Relay states are not restored across reboots (`restore_mode: ALWAYS_OFF`), so a power cut can't restart a prop the moment mains returns with nobody expecting it. Every channel is also re-asserted off at boot priority 700, after the switches exist.
- **Pulses always end off.** A channel re-pulsed mid-window is released at the earlier deadline, never left latched.
- **Wire the load side for the real world.** Fit flyback diodes across DC coils and snubbers across inductive AC loads, and size the relays and any external contactors for the actual load — the firmware controls the coil, not the fault current.

If you need a channel to survive a reboot in its last state, change that channel's `restore_mode` to `RESTORE_DEFAULT_OFF` in [`boards/rev1.yaml`](boards/rev1.yaml), and be deliberate about it.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Board completely dead after wiring Relay 7 | GPIO12 held HIGH at reset — see [GPIO12 / Relay 7](#gpio12--relay-7--boot-strapping). Remove the pull-up on the ESP32 side. |
| Relays are on when the firmware says off (and vice versa) | `relay_inverted` doesn't match the driver hardware. Flip it in `boards/rev1.yaml` and re-flash. |
| Relays chatter or the board resets when a channel switches | Coil supply sagging or inductive kickback. Separate the relay supply from the ESP32's, and fit flyback diodes / snubbers. |
| No hotspot and no `.local` hostname | The board has saved credentials for a network it can't see. Press **WiFi Reset** in the web UI, or re-provision over USB with Improv. |
| Home Assistant actions do nothing | Check the channel number is 1–8; out-of-range values are logged as a warning and ignored. |
| Device ID reads 0 | It has never been assigned. Set it in the web UI; the board reboots to apply it. |
