# NeatoFx Audio Whisper

A deliberately minimal WiFi MP3 player. It does one thing: play (or loop) an MP3
track by number, on request. Built on an ESP32 D1 Mini driving a **DY-SV8F**
voice/MP3 module over UART.

## Features

- **Play a track by number** — via the ESPHome/Home Assistant API
- **Loop a track by number** — via the API (repeats until stopped or another play)
- **Volume control** — 0–30
- **Web-UI test buttons** — Test Play / Test Loop / Stop, using a "Test MP3 Number"

That's it. No relays, no RF, no background-loop logic, no light effects.

## Hardware

- **MCU:** ESP32 (Wemos D1 Mini32 form factor)
- **Audio:** DY-SV8F voice module (onboard 5W class-D amp, 8 MB flash / MP3+WAV)

### DY-SV8F wiring

The DY-SV8F must be set to **UART Mode** with its DIP switches:
`CON1 = OFF, CON2 = OFF, CON3 = ON` (see the module manual, "Work Mode
Configuration": UART Mode = `1 0 0`).

| ESP32 D1 Mini | DY-SV8F pin        | Notes                          |
|---------------|--------------------|--------------------------------|
| GPIO21 (TX)   | RXD / IO1 (pin 4)  | ESP32 transmits commands       |
| GPIO22 (RX)   | TXD / IO0 (pin 3)  | ESP32 receives module replies  |
| GND           | 5V- / GND          | Common ground                  |
| 5V            | 5V+                | Module power (5V)              |

UART is **9600 baud, 8N1**.

### Audio files

Load MP3s onto the DY-SV8F flash over its Micro-USB port. Name them numerically
so the track number matches the file, e.g. `00001.mp3`, `00002.mp3`, … The
"track number" you pass to the API / test button selects the file by index.

## Build & Flash

```bash
esphome -s id 1 run     Audio/NeatoAudioWhisper/main.yaml
esphome -s id 1 compile Audio/NeatoAudioWhisper/main.yaml
esphome -s id 1 logs    Audio/NeatoAudioWhisper/main.yaml
```

Choose networked vs. standalone in [`main.yaml`](main.yaml):

```yaml
config: !include configs/networked.yaml    # WiFi + API (default) — needed for the API actions
#config: !include configs/standalone.yaml   # AP-only, web-UI test buttons only
```

Put WiFi credentials in `secrets.yaml` (see `_shared/secrets.template.yaml`).

## API

In networked mode the device exposes three actions (Home Assistant service names
shown for device id 1):

```yaml
# Play a track once
service: esphome.whisper_1_play_mp3
data:
  file: 5

# Loop a track forever (until stop or another play)
service: esphome.whisper_1_loop_mp3
data:
  file: 5

# Stop playback
service: esphome.whisper_1_stop
```

## Web Interface

`http://whisper-1.local` (networked) or `http://192.168.4.1` (standalone AP).

- **Volume** (0–30)
- **Test MP3 Number** — the track the test buttons act on
- **Test Play MP3** / **Test Loop MP3** / **Stop**
- **Restart**

## How it works

The DY-SV8F uses a `0xAA`-framed UART protocol (not the DFPlayer protocol), so
commands are sent as raw byte frames from [`scripts/mp3_control.yaml`](scripts/mp3_control.yaml).
Each frame is `AA <cmd> <len> <data…> <checksum>`, where the checksum is the low
8 bits of the sum of all preceding bytes. Playing a track sets the loop mode
(`01` repeat / `02` play-once) then issues the "specified song" command
(`AA 07 02 <hi> <lo> <sm>`).

Made by the NEATO-FX Team
