# NEATO-FX Entertainment System

Modular WiFi-enabled devices built on [ESPHome](https://esphome.io/) for interactive shooting galleries, escape rooms, and entertainment attractions. Each device joins your WiFi network and integrates directly with Home Assistant.

## Devices

| Device | Description |
|--------|-------------|
| [NEATO Target IR](Targets/NeatoTargetIR/) | IR-detecting shooting gallery target — LED effects, servo drop, relay output |
| [NEATO Audio 50](Audio/NeatoAudio50/) | 50W MP3 audio controller — trigger inputs, RF remote, background loop |
| [NEATO Display 4](Displays/NeatoDisplay4/) | LVGL touch-screen game display station (4") |
| [NEATO Display 7](Displays/NeatoDisplay7/) | LVGL touch-screen game display station (7") |
| [NEATO Motor](Controllers/NeatoMotor/) | AC/DC motor controller — limit switches, stall detection, winch/pulse/manual variants |
| [NEATO Blaster](Controllers/NeatoBlaster/) | IR blaster gun controller — pump action, relay trigger, Home Assistant scoring |
| [NEATO Golf](Golf/NeatoGolf/) | Golf hit target — LED effects, servo movement, FPP integration |

## Requirements

- [ESPHome](https://esphome.io/guides/installing_esphome) **2025.8.0+**
- ESP32 hardware (see each device's README for board specifications)
- A `secrets.yaml` file with your WiFi credentials (see [`_shared/secrets.template.yaml`](_shared/secrets.template.yaml))

## Getting Started

1. Clone this repository
2. Copy `_shared/secrets.template.yaml` to `secrets.yaml` one directory above this folder and fill in your WiFi credentials
3. Navigate to the device folder and follow its README

```bash
# Compile and flash a Target IR with ID 1
esphome -s id 1 run Targets/NeatoTargetIR/main.yaml

# Monitor live logs
esphome -s id 1 logs Targets/NeatoTargetIR/main.yaml
```

## Batch Programming

Use `program.sh` (in the parent repo) to compile and flash multiple devices:

```bash
./program.sh target        # Compile + upload Target IDs 1–20
./program.sh speaker       # Compile + upload Audio IDs 1–20
./program.sh display       # Compile + upload Display 4 IDs 1–20
./program.sh motor         # Compile + upload Motor IDs 1–20
./program.sh blaster       # Compile + upload Blaster IDs 1–20
./program.sh golf          # Compile + upload Golf IDs 1–20
./program.sh config        # YAML config check (no compile)
./program.sh verify        # Compile ID 1 of every device type
```

## Repository Structure

```
Targets/NeatoTargetIR/      # IR shooting gallery target
Audio/NeatoAudio50/         # MP3 audio controller
Displays/NeatoDisplay4/     # LVGL touch-screen display (4")
Displays/NeatoDisplay7/     # LVGL touch-screen display (7")
Controllers/NeatoMotor/     # AC/DC motor controller
Controllers/NeatoBlaster/   # IR blaster gun controller
Golf/NeatoGolf/             # Golf hit target
_shared/                    # Shared ESPHome base packages
```

## License

MIT — see [LICENSE](LICENSE).
