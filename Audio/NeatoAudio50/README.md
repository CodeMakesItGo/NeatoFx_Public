# NEATO Audio 50 - WiFi Audio Controller

The NEATO Audio 50 is a modular WiFi-enabled audio controller designed for interactive shooting galleries, escape rooms, and entertainment attractions. It delivers synchronized sound effects triggered by external inputs, with flexible audio output controls and game integration capabilities.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Hardware](#hardware)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Operation](#operation)
- [Web Interface](#web-interface)
- [Home Assistant Integration](#home-assistant-integration)
- [Sound Management](#sound-management)
- [Troubleshooting](#troubleshooting)

## Overview

SmartSpeaker is a professional-grade audio controller that responds to trigger inputs from IR detectors, buttons, or RF signals. It's perfect for:

- **Shooting Galleries**: Synchronized audio feedback for targets
- **Escape Rooms**: Audio cues and ambient sound management
- **Interactive Attractions**: Multi-source sound triggering with game logic
- **Theme Parks**: Coordinated audio with lighting and motion effects
- **Educational Displays**: Sound accompaniment for interactive exhibits

Each speaker features multiple input channels, selectable audio outputs, background loop capability, and full home automation integration.

## Features

### Core Functionality
- **Multiple Trigger Inputs**: 2 hardwired inputs plus 4 RF wireless buttons
- **MP3 Playback**: DFPlayer Mini support with up to 255 sound files per card
- **Audio Output Controls**: 2 relay outputs + 2 FET outputs for amplifiers and accessories
- **Background Loops**: Continuous ambient sound with auto-return capability
- **Random Playback**: Configurable random sound selection per input

### Advanced Features
- **Per-Input Configuration**: Different sounds and outputs for each input
- **Volume Control**: 30-level adjustable volume (0-30)
- **Amplifier Control**: GPIO pins for audio amplifier wake/mute management
- **Playback Timeout**: Automatic DFPlayer reset on stuck playback (5-300 seconds)
- **Status Feedback**: Heartbeat LED, logging, and Home Assistant events

### Connectivity
- **Standalone Mode**: Independent WiFi AP for direct control
- **Networked Mode**: Full Home Assistant integration with custom services
- **Web Interface**: Real-time control, monitoring, and configuration
- **OTA Updates**: Remote firmware updates over WiFi

## Hardware

### Board Specifications
- **MCU**: ESP32 (Wemos D1 Mini32 form factor)
- **Flash**: 4MB
- **Operating Voltage**: 3.3V-5V USB or 7V-12V power supply
- **WiFi**: 802.11 b/g/n (2.4GHz only)

### Rev 2.x Hardware Connections

| Pin | Function | Purpose |
|-----|----------|---------|
| GPIO16 | UART RX | DFPlayer Mini RX |
| GPIO17 | UART TX | DFPlayer Mini TX |
| GPIO34 | Input 1 | Primary audio trigger |
| GPIO39 | Input 2 | Secondary audio trigger |
| GPIO36 | RF Button A | Wireless remote channel A |
| GPIO2 | RF Button B | Wireless remote channel B |
| GPIO15 | RF Button C | Wireless remote channel C |
| GPIO35 | RF Button D | Wireless remote channel D |
| GPIO26 | Relay 1 | High-current output (up to 2A) |
| GPIO27 | Relay 2 | High-current output (up to 2A) |
| GPIO33 | FET 1 | PWM lighting or amplifier control |
| GPIO25 | FET 2 | PWM lighting or amplifier control |
| GPIO0 | Amp Wake | Amplifier power control |
| GPIO5 | Amp Unmute | Amplifier mute control |
| GPIO23 | Heartbeat LED | Status indicator |
| GPIO22 | Status LED | Communication indicator |

### Required Accessories
- DFPlayer Mini MP3 module (UART serial connection)
- Micro SD card (32GB max, FAT32 format) with MP3 files
- Power supply (USB or 7-12V DC)
- Optional: Amplifier module for relay outputs
- Optional: RF wireless remote control receiver

## Getting Started

### Prerequisites
1. ESPHome installed (via pip or Home Assistant)
2. USB cable for initial programming
3. WiFi network for networked mode (optional)

### Step 1: Prepare SD Card
1. Format a micro SD card as FAT32
2. Create folder structure: `01`, `02`, `03`, etc. (two digits required)
3. Place MP3 files in folders: `01/001.mp3`, `01/002.mp3`, etc.
4. Or place files directly in root: `0001.mp3`, `0002.mp3`, etc.
5. Insert SD card into DFPlayer Mini module

### Step 2: Flash Firmware
1. Connect ESP32 to computer via USB
2. Choose operating mode in `main.yaml`:
   ```yaml
   # For networked mode (with Home Assistant):
   config_file: !include configs/networked.yaml

   # For standalone mode (WiFi AP only):
   #config_file: !include configs/standalone.yaml
   ```

3. Optionally select board revision and RFTX mode in `main.yaml`:
   ```yaml
   # Rev 2.4/2.5/2.6 (current production):
   board: !include boards/rev2_4.yaml
   # Rev 2.3 (legacy):
   #board: !include boards/rev2_3.yaml

   # RFTX connector as RF transmitter outputs (default):
   rftx: !include boards/rftx_outputs.yaml
   # RFTX connector as 4 trigger inputs:
   #rftx: !include boards/rftx_inputs.yaml
   ```

4. Place your WiFi credentials in `secrets.yaml` (one directory above this repo).
   See [`_shared/secrets.template.yaml`](../../_shared/secrets.template.yaml).

5. Flash to device:
   ```bash
   # Compile and flash audio ID 1
   esphome -s id 1 run Audio/NeatoAudio50/main.yaml

   # Or compile + upload separately
   esphome -s id 1 compile Audio/NeatoAudio50/main.yaml
   esphome -s id 1 upload Audio/NeatoAudio50/main.yaml
   ```

### Step 3: Initial Configuration
1. **Networked Mode**: Device appears in Home Assistant after connection
2. **Standalone Mode**:
   - Connect to WiFi SSID: `audio-1` (or your ID)
   - Password: `neato123`
   - Open browser to: `http://192.168.4.1`

## Configuration

### Web Interface Controls

#### Sound Configuration
- **DFPlayer Volume**: 0-30 (default: 15) - Master volume control
- **Input 1 MP3**: 0-255 (file number to play, 0=disabled)
- **Input 2 MP3**: 0-255 (file number to play, 0=disabled)
- **RF A/B/C/D MP3**: 0-255 (wireless button sound assignments)
- **Background Loop MP3**: 1-255 (continuous ambient sound file)
- **Max MP3 Files**: 1-255 (for random mode, default: 32)

#### Playback Control
- **Background Loop Enable**: Toggle continuous ambient sound on/off
- **Input 1 Random**: Enable random playback instead of specific file
- **Input 2 Random**: Enable random playback instead of specific file
- **RF A/B/C/D Random**: Enable random playback per wireless button
- **Playback Timeout**: 5-300 seconds (auto-reset on DFPlayer hang)

#### Output Selection
Each input can trigger a different output combination:
- **Input 1 Output**: None / Relay 1 / Relay 2 / FET 1 / FET 2
- **Input 2 Output**: None / Relay 1 / Relay 2 / FET 1 / FET 2
- **RF A/B/C/D Output**: None / Relay 1 / Relay 2 / FET 1 / FET 2

#### System Controls
- **Restart**: Reboot the device
- **WiFi Reset**: Clear WiFi credentials and enter AP mode
- **Factory Reset**: Reset all settings to defaults

### Typical Configurations

**Shooting Gallery Setup:**
```
Input 1: Play hit sound #1, trigger Relay 1 (target effect)
Input 2: Play hit sound #2, trigger Relay 2 (target effect)
Background Loop: Enable ambient game music (#10)
```

**Escape Room Setup:**
```
Input 1: Play unlock sound (#5), trigger FET 1 (lighting effect)
Input 2: Play warning sound (#3), trigger Relay 1 (door actuator)
RF Button A: Play hint audio (#7), trigger Relay 2
RF Button B: Play hint audio (#8), trigger Relay 2
Background Loop: Enable ambient music with varying intensity
```

## Operation

### Basic Workflow

1. **Device Boot** (30-60 seconds):
   - DFPlayer initializes and reads SD card
   - WiFi connects (networked mode) or creates AP
   - Status LED indicates ready state

2. **Input Triggered**:
   - Sound plays at configured volume
   - Associated relay/FET activates
   - Event logged to Home Assistant (networked mode)
   - Playback timeout begins

3. **Playback Finished**:
   - Outputs deactivate automatically
   - If background loop enabled, returns to ambient sound
   - System ready for next trigger

### Input Types

**Hardware Inputs (GPIO-based):**
- **Input 1 (GPIO34)**: Hardwired trigger (0V = active)
- **Input 2 (GPIO39)**: Hardwired trigger (0V = active)

**RF Wireless (GPIO-based):**
- **RF Button A-D (GPIO36, GPIO2, GPIO15, GPIO35)**: Wireless receiver channels

**Web Interface:**
- **Test Input 1**: Simulates Input 1 trigger
- **Test Input 2**: Simulates Input 2 trigger
- **Test Play Random MP3**: Play random sound file

## Web Interface

Access at: `http://audio-1.local` or IP address in networked mode

### Dashboard Sections

**Audio Control**
- Volume slider with numeric input
- Background loop toggle
- Individual input MP3 selectors
- Random playback toggles
- Output assignment dropdowns

**System Status**
- WiFi signal strength
- IP address and SSID
- Device uptime
- Last event timestamp

**Test Buttons**
- Test Input 1/2 (simulates hardwired triggers)
- Test Random MP3 (plays random sound)
- WiFi Reset (returns to AP mode)
- Restart device

## Home Assistant Integration

### Standalone Mode
Speaker creates its own WiFi access point. No Home Assistant connection, but full control via web interface.

### Networked Mode
Speaker integrates fully with Home Assistant via ESPHome API.

#### Available Services

```yaml
# Play a specific sound file
service: esphome.speaker_1_play_sound
data:
  sound_id: 5  # 1-255

# Control background loop
service: switch.turn_on
data:
  entity_id: switch.speaker_1_background_loop_enable

# Set volume
service: number.set_value
data:
  entity_id: number.speaker_1_dfplayer_volume
  value: 20
```

#### Available Entities

- `switch.speaker_1_relay_1` - Manual relay control
- `switch.speaker_1_relay_2` - Manual relay control
- `switch.speaker_1_background_loop_enable` - Background music toggle
- `number.speaker_1_dfplayer_volume` - Volume (0-30)
- `number.speaker_1_input_1_mp3` - Input 1 sound (0-255)
- `number.speaker_1_input_2_mp3` - Input 2 sound (0-255)
- `light.speaker_1_spotlight_1` - FET 1 light control
- `light.speaker_1_spotlight_2` - FET 2 light control

#### Events

Speaker sends events to Home Assistant on input triggers:

```yaml
event_type: esphome.speaker-triggered
data:
  address: "1"      # Speaker ID
  input: "1"        # Which input was triggered (1-2)
```

## Sound Management

### SD Card Preparation

**File Structure Options:**

Option 1 (Recommended - Organized by folder):
```
SD Card/
├── 01/
│   ├── 001.mp3 (Input 1 - Hit sound 1)
│   ├── 002.mp3 (Input 1 - Hit sound 2)
│   └── 003.mp3 (Input 1 - Hit sound 3)
├── 02/
│   ├── 001.mp3 (Input 2 - Reload sound)
│   └── 002.mp3 (Input 2 - Empty trigger)
└── 03/
    └── 001.mp3 (Background loop music)
```

Option 2 (Root directory - Simpler):
```
SD Card/
├── 0001.mp3 (Sound file 1)
├── 0002.mp3 (Sound file 2)
├── 0003.mp3 (Sound file 3)
└── ...
```

### Audio Format Support
- **Format**: MP3 (DFPlayer native support)
- **Bitrate**: 32-320 kbps
- **Sample Rate**: 8-48 kHz
- **Max File Count**: 255 per folder, 65,535 on SD card

### Volume Levels
Speaker has 30 volume levels (0-30):
- **0-5**: Very quiet (background only)
- **10-15**: Normal conversation level
- **20-25**: Loud (typical game sounds)
- **25-30**: Very loud (ensure amplifier supports)

## Troubleshooting

### DFPlayer Not Playing Sound

**Symptom**: MP3 files don't play despite correct configuration

**Causes & Solutions:**
1. **SD Card Not Detected**
   - Eject/reinsert SD card
   - Check SD card is FAT32 format
   - Verify card is not write-protected
   - Try different SD card (up to 32GB)

2. **File Not Found**
   - Ensure file numbers match web interface settings
   - Check file names are in format: `0001.mp3`, `001.mp3`, etc.
   - Verify files are actually on SD card
   - Try renaming files if special characters present

3. **DFPlayer Module Issue**
   - Check UART wiring (RX on GPIO16, TX on GPIO17)
   - Verify baud rate 9600 in configuration
   - Check for loose connections
   - Consider DFPlayer module failure (replace)

4. **Volume Set to 0**
   - Increase "DFPlayer Volume" to 15-20 via web interface
   - Check amplifier volume (if external amp used)

### WiFi Connection Issues

**Device doesn't connect to network:**
1. Verify SSID and password in `secrets.yaml`
2. Check WiFi signal strength at device location
3. Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
4. Restart WiFi router
5. Factory reset and reconfigure:
   - Power off device for 10 seconds
   - Power on and look for `audio-<ID>` AP
   - Connect and set WiFi credentials again

### Relay Not Activating

**Symptom**: Sound plays but relay doesn't trigger

**Causes & Solutions:**
1. **Output Not Assigned**
   - Open web interface
   - Set appropriate "Input X Output" to "Relay 1" or "Relay 2"
   - Verify relay is visible in web interface

2. **Relay Wiring**
   - Check physical connections to relay module
   - Verify relay module has power
   - Test relay directly by toggling in web interface
   - Check relay coil voltage (typically 5V or 12V)

3. **GPIO Short Circuit**
   - Check for accidental shorts on GPIO26/27
   - Verify no crossed wires on relay connector

### Web Interface Not Loading

**Symptom**: Can't reach device at `speaker-1.local`

**Solutions:**
1. Check device is powered and booted (wait 30 seconds)
2. Try IP address instead of hostname (find in router admin panel)
3. Clear browser cache (Ctrl+Shift+Delete)
4. Check firewall isn't blocking HTTP traffic
5. Try different browser
6. Disable WiFi proxy/VPN temporarily

### Playback Timeout Occurring

**Symptom**: DFPlayer stops working, auto-resets frequently

**Causes & Solutions:**
1. **Timeout Value Too Low**
   - Increase "Playback Timeout" to 120 seconds via web interface
   - This is normal if MP3 files are long

2. **SD Card Speed Issues**
   - Try faster SD card (Class 10+)
   - Verify SD card isn't full (leave 10% free space)

3. **DFPlayer Hardware Issue**
   - Check UART connections
   - Try reseating SD card
   - Consider module failure (replace)

### Multiple Sounds Playing Simultaneously

**Symptom**: Sound files overlap or distort

**Solutions:**
1. Set script mode to `single` instead of `queued` in YAML
2. Add delay between trigger events (debounce in hardware)
3. Disable "Input X Random" if causing overlap
4. Check external inputs aren't bouncing (electrically noisy)

## Specifications

### Power Requirements
- 5V USB (low power testing only)
- 7-12V DC power supply recommended for sustained operation
- Current draw:
  - ESP32 idle: ~100mA
  - DFPlayer playback: ~200mA
  - Relay active: +100-500mA per relay
  - **Total typical**: 300-1000mA

### Operating Environment
- Temperature: -10°C to +60°C
- Humidity: 10-90% non-condensing
- WiFi range: 30-50m (depends on obstacles)

### Connectivity
- WiFi: 802.11 b/g/n only (2.4GHz)
- Baud Rate: Serial 115200, DFPlayer 9600

## Support

For issues or questions:
1. Check this README troubleshooting section
2. Enable debug logging and check device logs
3. Review ESPHome documentation at esphome.io
4. Contact NEATO-FX support with device logs

Made by the NEATO-FX Team
*Last updated: April 2026*
