# NeatoFx Blaster - WiFi Enabled Infrared Blaster

The NeatoFx Blaster is a professional-grade WiFi-enabled infrared transmitter for interactive shooting galleries, laser tag games, and entertainment attractions. It features realistic trigger mechanics with optional pump-action gameplay and full game integration capabilities.

## Table of Contents

- [Overview](#overview)
- [Hardware Revisions](#hardware-revisions)
- [Features](#features)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Operation](#operation)
- [Web Interface](#web-interface)
- [Home Assistant Integration](#home-assistant-integration)
- [Troubleshooting](#troubleshooting)

## Overview

NeatoBlaster is designed for:

- **Shooting Galleries**: IR-based target shooting with game scoring
- **Laser Tag**: Team-based combat games with IR weaponry
- **Interactive Attractions**: Blasters as game controllers
- **Theme Parks**: Immersive experiences with IR weaponry
- **Educational Displays**: Interactive STEM learning exhibits

Each blaster features authentic trigger mechanics, IR target communication, audio feedback, and seamless integration with Home Assistant for advanced game logic.

## Hardware Revisions

NeatoBlaster comes in two distinct hardware revisions optimized for different use cases:

### Rev 1.x - Basic Laser Tag Blaster

**Best for**: Simple shooting galleries, testing, budget installations

**Features:**
- Simple GPIO audio triggers (3-pin control outputs)
- Basic IR firing via NEC protocol
- Minimal wiring requirements
- Compact form factor
- No MP3 player (external audio only)

**Audio Control:**
- 3 audio output pins for different sound effects
- GPIO22: Shot fired sound
- GPIO21: Reload/pump sound
- GPIO17: Empty trigger sound
- Each pin controls external audio system (relay, FET, amplifier)

**Limitations:**
- No advanced game state management
- Limited audio flexibility
- Single IR protocol (NEC)
- No local prize dispenser control

### Rev 3.x - Advanced Pump Blaster

**Best for**: Professional installations, complex games, advanced features

**Features:**
- Full MP3 audio via a DY-SV5W player on the serial port
- Relay output for prize dispensers and game devices
- Game start button for interactive gameplay
- Game state management (active/inactive)
- Pump-action feedback sounds
- Auxiliary power control for external devices

**Audio Control:**
- DY-SV5W MP3 player driven over the serial header (UART0):
  - GPIO1 (TX) -> DY-SV5W RX (commands out)
  - 9600 baud, 8N1
  - Playback is one-way, so the player's TX line is not wired back and
    GPIO3 (RX) stays free for the start game button
- Tracks are selected by number, so any track is reachable:
  - Track 1: Empty trigger (pump not engaged, or game inactive)
  - Track 2: Pump action sound
  - Track 3: Fire shot sound
  - Tracks 4+: Additional game audio
- Full volume control (0-30), restored from flash across reboots
- GPIO16/GPIO17 are now free — earlier firmware used them as one-shot trigger
  lines. GPIO25 was the third, and now carries the pump sensor

**Advanced Features:**
- Start game button (GPIO3 - the serial header's RX pin)
- Relay output (GPIO23) for prize dispensers
- Auxiliary power control (GPIO26) for external equipment
- Game active/inactive state tracking
- Automatic sound cycling per trigger

---

## Features

### Core Functionality (All Revisions)
- **IR Transmitter**: NEC protocol targets
- **Trigger Detection**: Responsive trigger sensor
- **Pump Action** (optional): Blaster pump mechanics
- **Status Feedback**: LED indicator, logging
- **Multiple Blaster Support**: Up to 99 blasters with unique IDs

### Rev 1.x Audio
- 3 GPIO output pins for sound control
- External audio amplifier integration
- Multiple shot sound cycling

### Rev 3.x Audio + Control
- DY-SV5W MP3 playback over serial
- Volume control (30 levels)
- Game state management
- Start game button input
- Relay output for prizes
- Auxiliary power control

### Connectivity (All Revisions)
- **Standalone Mode**: Independent WiFi AP
- **Networked Mode**: Full Home Assistant integration
- **Web Interface**: Real-time control and configuration
- **OTA Updates**: Remote firmware updates

## Getting Started

### Prerequisites
1. ESPHome installed (via pip or Home Assistant)
2. USB cable for initial programming
3. WiFi network for networked mode (optional)
4. Rev 3.x ONLY: Micro SD card with MP3 files (see Sound Management)

### Step 1: Identify Your Hardware

Check your blaster PCB or documentation:
- **Rev 1.x**: Simpler board, GPIO22/21/17 for audio
- **Rev 3.x**: More GPIO, includes MicroSD slot for MP3

### Step 2: Flash Firmware

1. Connect ESP32 to computer via USB

2. Edit `main.yaml`:
   ```yaml
   # Select hardware revision:
   # For Rev 1.x (default):
   board: boards/rev1.yaml

   # For Rev 3.x:
   board: boards/rev3.yaml
   ```

3. Choose operating mode:
   ```yaml
   # For networked (with Home Assistant):
   config: configs/networked.yaml

   # For standalone (WiFi AP only):
   #config: configs/standalone.yaml
   ```

4. For networked mode, create `configs/secrets.yaml`:
   ```yaml
   wifi_ssid: "YourWiFiNetwork"
   wifi_password: "YourPassword"
   ```

5. Flash to device:
   ```bash
   # Standard method
   esphome -s id 1 run Controllers/NeatoBlaster/main.yaml

   # Or explicit revision:
   esphome -s id 1 -s board boards/rev3.yaml run Controllers/NeatoBlaster/main.yaml
   ```

### Step 3: Rev 3.x Only - Prepare the DY-SV5W

1. **Strap the module for UART mode.** Out of the box a DY-SV5W is in one-key
   trigger mode and ignores its serial port entirely — nothing will play. Set
   the CON1/CON2/CON3 config pads to the UART combination from the module's
   datasheet before wiring it up.

2. **Wire the serial link** to the serial header:

   | ESP32 | DY-SV5W | Note |
   |-------|---------|------|
   | GPIO1 (TX) | RX | commands out — the only line playback needs |
   | GPIO3 (RX) | — | leave unwired; this is the start game button |
   | GND | GND | common ground is required |

   The player runs off aux power (GPIO26), which the firmware switches on at
   boot and then waits 1.5 s before sending the first frame.

3. Format the micro SD card as FAT32 and place the sound files:
   ```
   SD Card/
   ├── 0001.mp3 (Empty trigger sound)
   ├── 0002.mp3 (Pump sound)
   ├── 0003.mp3 (Fire sound)
   ├── 0004.mp3 (Game ready)
   └── ...
   ```
   Track numbers are the DY-SV5W's own index, which follows the order files
   were written to the card. Copy them in numeric order onto a freshly
   formatted card so index 3 really is `0003.mp3`.

4. Insert the SD card into the DY-SV5W. To play from the module's onboard
   flash or a USB stick instead, change `mp3_drive` in
   [boards/rev3.yaml](boards/rev3.yaml) (0 = USB, 1 = SD, 2 = flash).

### Step 4: Initial Configuration

1. **Networked Mode**: Device auto-appears in Home Assistant
2. **Standalone Mode**:
   - Connect to WiFi SSID: `blaster-1` (or your ID)
   - Password: `neato123`
   - Open: `http://192.168.4.1`

3. **First Fire Test**:
   - Turn ON the **"Game Active"** switch in the web UI. Both the trigger and
     the "Fire Blaster" button are gated on it, so a blaster with no Home
     Assistant helper behind it will play only the empty sound and transmit
     nothing until this is on.
   - Point blaster toward Neato Target IR
   - Pull trigger
   - Verify IR signal received (target should flash)
   - Check audio feedback

   In networked mode this override holds until Home Assistant next publishes
   `input_boolean.player_<id>_active`, which then takes over. Standalone
   builds latch the gate on at boot and need no switch. Use **"Test Sound"**
   to check audio alone — it ignores the gate entirely.

## Configuration

### All Revisions - Core Settings

#### Pump Configuration
- **Pump Required**: Enable/disable pump-before-fire mechanic
  - ON: Must pump before each shot
  - OFF: Fire normally without pumping

### Rev 3.x Only - Advanced Settings

#### Audio Configuration
- **MP3 Volume**: 0-30 (default: 20) - DY-SV5W playback volume, saved to flash
  and re-sent to the player on every boot
- **Test Sound**: plays the fire track without transmitting IR — use it to
  separate a dead serial link from a dead speaker
- Track numbers and the source drive are set by the `track_*` / `mp3_drive`
  substitutions in [boards/rev3.yaml](boards/rev3.yaml)
- **Game Active**: Toggle whether blaster responds to trigger
  - ON: Trigger fires normally
  - OFF: Start button must activate game first

#### No USB Serial Console on Rev 3.x

The DY-SV5W occupies GPIO1, which is also the USB console's TX line, so Rev
3.x sets `logger: baud_rate: 0`. Consequences:

- `esphome logs` over USB shows nothing. Use `esphome logs --device <host>`
  over WiFi, the API, or the web server — all logging is unaffected there.
- `improv_serial` (USB provisioning) is not available. Rev 3.x provisions over
  BLE Improv (`esp32_improv`) or the setup hotspot instead. Rev 1.x has
  nothing on UART0 and keeps serial provisioning, which is why the component
  is declared in [boards/rev1.yaml](boards/rev1.yaml) rather than in
  [configs/networked.yaml](configs/networked.yaml).
- Flashing over USB is unaffected — that uses the bootloader, not the logger.

#### Output Configuration
- **Relay on Trigger**: Enable/disable relay pulse when firing
  - Useful for prize dispensers
  - Configurable pulse duration
- **Relay Trigger Time**: 0-5000ms (pulse duration)

#### Game State Management
- Blaster tracks game state (active/inactive)
- Start Game Button (GPIO3) activates game
- Game state shown in web interface
- Used for game flow control

### Typical Configurations

**Basic Shooting Gallery (Rev 1.x):**
```
Pump Required: OFF
Audio Output: Relay 1 or GPIO relay
Target: Neato Target IR unit
Sound feedback: External amplifier
```

**Pump-Action Game (Any Revision):**
```
Pump Required: ON
Pump Sound: Enabled (Rev 3.x)
Fire Sound: Enabled (Rev 3.x)
Empty Sound: Enabled when pump required but not pumped
```

**Advanced Game (Rev 3.x):**
```
Game Active: Toggled by start button
Relay on Trigger: Enabled for prizes
Volume: 20-25 (loud for arcade)
Sound cycling: Different sound per shot
```

## Operation

### Basic Shooting Flow (All Revisions)

1. **Blaster Powered On** (5-10 seconds):
   - Initializes IR transmitter
   - WiFi connects or creates AP
   - Status LED ready

2. **Trigger Pulled**:
   - If Pump Required OFF: Fires immediately
   - If Pump Required ON: Check if blaster pumped
   - IR signal sent to target
   - Audio feedback plays (beep/shot sound)
   - Cooldown begins

3. **Target Response**:
   - Neato Target IR receives IR signal
   - Target flashes, plays sound, activates relay
   - Game logic processes hit
   - Cooldown prevents rapid re-firing

### Pump-Action Mechanics (Optional)

1. **Pull Trigger** (pump not engaged):
   - If Pump Required ON: Empty click sound plays
   - No IR signal sent
   - Blaster ready to pump

2. **Pump Blaster** (push/pull slide action):
   - Pump sensor detects motion
   - Pump sound plays (Rev 3.x)
   - Blaster now "loaded" and ready

3. **Pull Trigger** (after pump):
   - Full fire sequence executes
   - IR signal sent to target
   - Shot sound plays
   - Pump required again

### Game Button (Rev 3.x Only)

1. Press Start Game Button (GPIO3)
2. Game state changes to "active"
3. Trigger now responds to shots
4. Web interface shows game status
5. Game automations begin in Home Assistant

## Web Interface

Access at: `http://blaster-1.local` or IP address

### All Revisions - Core Controls
- **Fire Blaster**: Manual trigger simulation
- **Blaster ID**: Display or change blaster number
- **Pump Required**: Toggle pump mechanic
- **Status**: Trigger/pump sensor states

### Rev 3.x Additional Controls
- **Game Active**: Toggle game state
- **Volume**: 0-30 slider
- **Start Game Button**: Simulate start button
- **Relay Status**: Show relay activation state
- **Relay on Trigger**: Enable/disable prize dispenser

### System Controls (All)
- **Restart Device**: Reboot blaster
- **WiFi Reset**: Clear WiFi and enter AP mode
- **Factory Reset**: Reset all settings

## Home Assistant Integration

### Standalone Mode
Blaster creates WiFi AP. Full web interface control, no Home Assistant needed.

### Networked Mode
Blaster integrates with Home Assistant via ESPHome API.

#### Available Services (All Revisions)

```yaml
# Fire blaster manually
service: button.press
data:
  entity_id: button.blaster_1_fire_blaster

# Toggle pump requirement
service: switch.toggle
data:
  entity_id: switch.blaster_1_pump_required
```

#### Available Services (Rev 3.x Only)

```yaml
# Activate game
service: switch.turn_on
data:
  entity_id: switch.blaster_1_game_active

# Set volume
service: number.set_value
data:
  entity_id: number.blaster_1_dfplayer_volume
  value: 20

# Trigger relay output
service: switch.turn_on
data:
  entity_id: switch.blaster_1_relay_1
```

#### Available Entities

**All Revisions:**
- `button.blaster_1_fire_blaster` - Manual fire
- `switch.blaster_1_pump_required` - Pump mechanic toggle
- `binary_sensor.blaster_1_blaster_trigger` - Trigger sensor state
- `binary_sensor.blaster_1_pump_sensor` - Pump sensor state

**Rev 3.x Only:**
- `switch.blaster_1_game_active` - Game state toggle
- `switch.blaster_1_relay_1` - Relay output control
- `switch.blaster_1_aux_pwr` - Auxiliary power control
- `number.blaster_1_mp3_volume` - Volume (0-30)
- `button.blaster_1_test_sound` - Play the fire track (serial link checkout)

#### Events

Blaster sends events to Home Assistant:

```yaml
event_type: esphome.blaster_fired
data:
  blaster_id: "1"
  game_active: true
```

## Troubleshooting

### Blaster Won't Fire / No IR Signal

**Symptom**: Trigger responds but target doesn't flash

**Causes & Solutions (All Revisions):**
1. **IR LED Issue**
   - Verify IR LED connection on GPIO5
   - Test IR LED with camera (show as blue light in camera)
   - Replace IR LED if not visible to camera

2. **IR Protocol Mismatch**
   - Verify target is set to NEC protocol (or IR_CUSTOM)
   - Check IR target address/command in code matches blaster

3. **No Power to IR**
   - Check power supply voltage (7-12V recommended)
   - Test GPIO5 shows 5V with multimeter during fire
   - Check for shorts or loose wires

4. **Firmware Not Loaded**
   - Verify esphome compilation succeeded
   - Check device logs for errors
   - Reflash from scratch

### Audio Not Working (Rev 3.x)

**Symptom**: No sound when shooting

**Causes & Solutions:**
1. **SD Card Not Detected**
   - Verify SD card inserted in the DY-SV5W
   - Check FAT32 format
   - Try different SD card
   - Check micro SD contacts for corrosion

2. **Volume Set to 0**
   - Set "MP3 Volume" to 15+ in web interface
   - Check amplifier volume separately
   - Test with full 30 volume

3. **File Not Found**
   - Verify file numbers on SD card (0001.mp3, etc.)
   - Check file names match configuration
   - Ensure files actually exist on card

4. **DY-SV5W Not Responding**
   - Confirm the module is strapped for UART mode, not one-key trigger mode —
     this is the most common cause of total silence on a new player
   - Check UART wiring (GPIO1 -> DY RX) and that the ESP32 and the player
     share a ground
   - Confirm aux power (GPIO26) is on — the "Aux Pwr" switch in the web UI
   - Set the logger to DEBUG and watch for `DY-SV5W play track N` lines: if
     they appear, the firmware is sending and the fault is downstream. Note
     that Rev 3.x has no USB serial console (see below) — read the logs over
     WiFi with `esphome logs`, or in the device web UI
   - Power cycle device
   - Check for loose connections

### Pump Mechanic Not Working

**Symptom**: Pump toggle doesn't prevent firing

**Causes & Solutions:**
1. **Pump Sensor Wiring**
   - Verify pump switch wired to GPIO23 (Rev 1) or GPIO25 (Rev 3)
   - Rev 3.x firmware before this change used GPIO34 — see below
   - Check switch makes contact when pumped
   - Test continuity with multimeter

2. **Pump Configuration Disabled**
   - Toggle "Pump Required" ON in web interface
   - Verify setting persists after restart
   - Check device logs confirm setting applied

3. **Pump Switch Stuck**
   - Manually work pump action
   - Clean sensor contacts
   - Replace pump switch if faulty

### Pump Moved from GPIO34 to GPIO25 (Rev 3.x) — REWIRE REQUIRED

**The pump switch must be moved from the GPIO34 pin to GPIO25 on the
right-side connector.** Flashing this firmware without rewiring leaves the
pump permanently unpressed — GPIO25 idles high on its internal pull-up with
nothing attached, which reads as "not pumped".

**Why it moved**: GPIO34 is one of the ESP32's input-only pins (GPIO34-39).
Unlike every other input on the board, these have **no internal pull-up or
pull-down** — ESPHome rejects `pullup: true` on them outright. The switch
depended on an external pull-up on the PCB, and where that resistor was
missing or open the pin floated and fired pump events at random. GPIO25 has a
real internal pull-up and came free when the MP3 player moved to serial.

**Symptom this fixes**: "Pump Sensor" toggling on its own, pump sounds playing
untouched, or the blaster reporting itself pumped with nobody near it.

To keep the old GPIO34 wiring instead, set `pump_gpio: GPIO34` and change the
pump sensor's `mode: INPUT_PULLUP` back to `mode: INPUT` in
[boards/rev3.yaml](boards/rev3.yaml) — and fit a ~10 kΩ pull-up from GPIO34 to
3V3, because nothing in firmware can un-float that pin. GPIO16 and GPIO17 are
also free and support internal pull-ups if GPIO25 is inconvenient.

### WiFi Connection Issues

**Device won't connect to network:**
1. Verify SSID/password in secrets.yaml
2. Check 2.4GHz WiFi available (5GHz not supported)
3. Factory reset: Power cycle 3 times rapidly
4. Reconnect through new AP: `blaster-1`

### Web Interface Not Accessible

**Can't reach at blaster-1.local:**
1. Verify device powered and booted (wait 10 seconds)
2. Try IP address instead of hostname
3. Check firewall allows HTTP
4. Clear browser cache
5. Try different browser

## Specifications

### Power Requirements
- **Voltage**: 3.3V (USB) or 7-12V (barrel connector)
- **Current**: 200-500mA typical
- **Rev 3.x with sound**: Up to 1A during audio playback

### Operating Environment
- **Temperature**: -10°C to +60°C
- **Humidity**: 10-90% non-condensing
- **WiFi Range**: 30-50m

### IR Transmission
- **Protocol**: NEC (IR_NEC)
- **Frequency**: 38kHz carrier
- **Range**: 10-30m (depending on target sensitivity)
- **Transmission Rate**: ~100ms per shot

## Support

For issues:
1. Check this troubleshooting section
2. Review device logs in web interface
3. Test IR with smartphone camera
4. Verify power supply voltage
5. Contact NEATO-FX support with device logs

Made by the NEATO-FX Team
*Last updated: April 2026*
