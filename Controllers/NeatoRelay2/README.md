# NeatoFx Relay 2 — 2-Channel WiFi Relay Controller

The NeatoFx Relay 2 is a WiFi-enabled two-channel relay controller for interactive attractions, escape rooms, shooting galleries and show control. Each channel can be latched on and off, or fired as a timed pulse — one board covers a pair of props, valves, lights or contactors, driven from Home Assistant, from a browser, or from the ESPHome API.

It is the two-channel sibling of the [NeatoFx Relay 8](../NeatoRelay8/README.md): same controls, same Home Assistant actions, same safety behaviour, for installs that only need two outputs.

## Table of Contents

- [Overview](#overview)
- [Hardware](#hardware)
- [Getting Started](#getting-started)
- [Controls](#controls)
- [Home Assistant](#home-assistant)
- [Safety Behaviour](#safety-behaviour)
- [Troubleshooting](#troubleshooting)

## Overview

The Relay 2 drives:

- **Props and set pieces**: lights, fans, smoke, motors via external contactors
- **Solenoids and air valves**: timed pulse firing per channel
- **Show cues**: two independent dry-contact outputs on one address
- **Prize and dispenser mechanisms**: single-shot pulses of a known length
- **Mains loads**: through appropriately rated relays / contactors

Both channels are independent — nothing is ganged, interlocked or paired in firmware.

### Choosing between Relay 2 and Relay 8

| | Relay 2 | Relay 8 |
|---|---|---|
| Channels | 2 | 8 |
| Relay GPIOs | GPIO16, GPIO17 | GPIO32, 33, 25, 26, 27, 14, 12, 13 |
| Strapping-pin caution | **None** | Relay 7 on GPIO12 (MTDI) must idle LOW |
| Module requirement | WROOM-32E only (**not** WROVER) | Any ESP32-WROOM-32/32E |
| Controls, HA actions, safety behaviour | Identical | Identical |

## Hardware

### Board Specifications

- **MCU**: ESP32-WROOM-32E (`esp32dev`)
- **Channels**: 2 relays, one GPIO each
- **WiFi**: 802.11 b/g/n (2.4 GHz only)
- **Modes**: networked (Home Assistant + web UI) or standalone AP

### Rev 1.x Pin Map

| Pin | Function | Notes |
|-----|----------|-------|
| GPIO16 | Relay 1 | Not a strapping pin. Unavailable on WROVER modules — see below |
| GPIO17 | Relay 2 | Not a strapping pin. Unavailable on WROVER modules — see below |

### Why GPIO16 / GPIO17

Neither pin is a strapping pin. The ESP32 samples GPIO0, GPIO2, GPIO5, GPIO12 (MTDI) and GPIO15 (MTDO) at reset to choose its boot mode and flash voltage; GPIO16 and GPIO17 are outside that set, so a relay driver on either one cannot affect boot. **The GPIO12 flash-voltage hazard that applies to Relay 8's channel 7 does not exist on this board** — there is no pin here that must idle LOW for the module to come out of reset.

Neither pin is input-only (that is GPIO34–39), and neither is used by the internal SPI flash (GPIO6–11), so both drive a relay coil driver directly.

**The one exception:** on **ESP32-WROVER** modules, GPIO16 and GPIO17 are wired to the on-package PSRAM and are not available. This board is specified as **WROOM-32E** (no PSRAM), where both pins are brought out and free. Do not substitute a WROVER module.

### Relay polarity

`relay_inverted` in [`boards/rev1.yaml`](boards/rev1.yaml) matches the firmware's idea of "on" to the driver hardware:

| Value | Meaning |
|---|---|
| `"false"` (default) | **Active HIGH** — GPIO high energises the coil (transistor / MOSFET low-side driver) |
| `"true"` | **Active LOW** — GPIO low energises the coil (typical off-the-shelf opto-isolated relay modules) |

Set it once to match the board. It is a hardware fact, not a per-unit setting, so it is a build-time substitution rather than a web UI control. Unlike Relay 8, setting it to `"true"` is safe on every channel here — no relay sits on a strapping pin, so an inverted boot state cannot stop the module booting.

## Getting Started

```bash
# Compile + flash over USB
esphome run Controllers/NeatoRelay2/main.yaml

# Compile only / watch logs
esphome compile Controllers/NeatoRelay2/main.yaml
esphome logs    Controllers/NeatoRelay2/main.yaml
```

Or flash a batch from the repo root:

```bash
./program.sh relay2            # compile once, flash unit after unit
./program.sh relay2 compile    # compile only
./program.sh relay2 upload 4   # flash 4 units from the existing build
```

**One binary, runtime identity.** Every Relay 2 runs the same firmware. The hostname carries the board's MAC (`relay2-a1b2c3`), and the board's logical number is the **Device ID**, set once from the web UI and kept in flash. Swapping in a replacement board is: flash it, set the same Device ID, done.

### First power-up

1. The board raises a setup hotspot named after itself (`relay2-a1b2c3`); the password is `ap_password` from `_shared/secrets.yaml`.
2. Join it and enter your WiFi credentials (or provision over USB / BLE with Improv).
3. Open `http://relay2-a1b2c3.local/` and set the **Device ID**. The board reboots so every consumer of the ID sees the same value.

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
| **Relay 1**, **Relay 2** | Switch | Latch a channel on or off |
| **Pulse Relay 1**, **Pulse Relay 2** | Button | Energise that channel for **Pulse Time**, then release it |
| **All Relays Off** | Button | Drop both channels — the panic / show-reset control |
| **All Relays On** | Button | Energise both channels (bench testing, continuity checks) |
| **Pulse Time** | Number | Pulse on-time in ms, 10–10000, default 250. Shared by both channels, saved to flash |
| **Relay States** | Text sensor | Channel map, e.g. `1-` = relay 1 energised, relay 2 off |
| **Relays On** | Sensor | How many channels are currently energised |
| **Any Relay On** | Binary sensor | True while either channel is energised |
| **Device ID** | Number | This board's logical number, 0–99 (0 = unassigned) |
| **Relay Board Name** | Text sensor | `relay2-<Device ID>` — which board this is, independent of the MAC hostname |
| **Firmware Version** | Text sensor | Firmware and hardware revision |

Pulses run in parallel, so both channels can be firing at once.

## Home Assistant

With `configs/networked.yaml`, the board appears as a standard ESPHome device: two switches, the pulse buttons and the summary sensors, all usable directly.

For automations, prefer the channel-number actions over entity names. Home Assistant derives entity ids from the device name, which carries the MAC suffix — an automation written against `switch.relay2_a1b2c3_relay_2` breaks the moment the board is swapped, while these take a plain 1-based channel number:

| Action | Fields | Effect |
|---|---|---|
| `esphome.<device>_set_relay` | `relay` (1–2), `state` (bool) | Latch a channel on or off |
| `esphome.<device>_pulse_relay` | `relay` (1–2) | Fire the channel for **Pulse Time** |
| `esphome.<device>_all_relays_off` | — | Drop both channels |

The action names and signatures are deliberately identical to Relay 8's, so an automation written for an 8-channel board works unchanged against a 2-channel one for relays 1–2. An out-of-range channel number (3–8 here) is logged as a warning and ignored rather than acted on.

## Safety Behaviour

- **The board never wakes up energised.** Relay states are not restored across reboots (`restore_mode: ALWAYS_OFF`), so a power cut can't restart a prop the moment mains returns with nobody expecting it. Both channels are also re-asserted off at boot priority 700, after the switches exist.
- **Pulses always end off.** A channel re-pulsed mid-window is released at the earlier deadline, never left latched.
- **Wire the load side for the real world.** Fit flyback diodes across DC coils and snubbers across inductive AC loads, and size the relays and any external contactors for the actual load — the firmware controls the coil, not the fault current.

If you need a channel to survive a reboot in its last state, change that channel's `restore_mode` to `RESTORE_DEFAULT_OFF` in [`boards/rev1.yaml`](boards/rev1.yaml), and be deliberate about it.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Neither relay responds and the board behaves oddly | A WROVER module was fitted instead of WROOM-32E. GPIO16/17 are the PSRAM bus on WROVER — see [Why GPIO16 / GPIO17](#why-gpio16--gpio17). |
| Relays are on when the firmware says off (and vice versa) | `relay_inverted` doesn't match the driver hardware. Flip it in `boards/rev1.yaml` and re-flash. |
| Relays chatter or the board resets when a channel switches | Coil supply sagging or inductive kickback. Separate the relay supply from the ESP32's, and fit flyback diodes / snubbers. |
| No hotspot and no `.local` hostname | The board has saved credentials for a network it can't see. Press **WiFi Reset** in the web UI, or re-provision over USB with Improv. |
| Home Assistant actions do nothing | Check the channel number is 1–2; out-of-range values are logged as a warning and ignored. |
| Device ID reads 0 | It has never been assigned. Set it in the web UI; the board reboots to apply it. |
