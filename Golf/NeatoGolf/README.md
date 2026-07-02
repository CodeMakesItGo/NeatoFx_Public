# NeatoGolf - WiFi Enabled Golf Course Target System

The NEATO-FX NeatoGolf is a professional-grade WiFi-enabled IR-sensitive target system designed for indoor golf entertainment, mini-golf courses, and interactive golf-themed attractions. Each target detects IR signals from golf clubs or sensors and responds with visual effects, sound, and game integration.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Hardware](#hardware)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Operation](#operation)
- [Web Interface](#web-interface)
- [Home Assistant Integration](#home-assistant-integration)
- [Troubleshooting](#troubleshooting)

## Overview

NeatoGolf is designed for:

- **Indoor Golf**: Simulated golf courses with digital scoring
- **Mini-Golf Attractions**: Interactive obstacles and scoring
- **Golf Training**: Practice zones with feedback
- **Themed Entertainment**: Golf-themed interactive games
- **Party/Arcade**: Social golf games and competitions

Each target features infrared detection, dazzling LED effects, relay outputs for mechanical feedback, servo control for animation, and full game integration.

## Features

### Core Functionality
- **IR Detection**: Multi-protocol infrared receiver (Laser Tag, NEC)
- **RGB LED Effects**: Full-color LED strip with custom animations
- **Relay Output**: Control external devices (scoreboards, sound effects)
- **Servo Control**: Optional animated responses (doors, flags, etc.)
- **Hit Detection**: Responsive ball detection and scoring
- **Real-time Feedback**: Visual and audio responses to hits

### Advanced Features
- **Configurable Scoring**: Adjustable points per hit
- **Hit Timers**: Adjustable cooldown and relay activation times
- **LED Effects**: Rainbow, color wipe, strobe, twinkle, and custom patterns
- **FPP Integration**: Synchronized light shows with Falcon Player
- **Servo Animation**: Automated prop movement on hits (Rev 3.x)
- **Event Tracking**: All hits logged and reported to Home Assistant

### Connectivity
- **Standalone Mode**: Independent WiFi AP for direct control
- **Networked Mode**: Full Home Assistant integration with scoring
- **Web Interface**: Real-time monitoring and game configuration
- **OTA Updates**: Remote firmware updates over WiFi

## Hardware

### Board Specifications
- **MCU**: ESP32 (Wemos D1 Mini32)
- **Flash**: 4MB
- **Operating Voltage**: 7V-14V
- **WiFi**: 802.11 b/g/n (2.4GHz only)
- **GPIO**: Multiple I/O for expansion

### Rev 3.x Hardware Connections

| Pin | Function | Purpose |
|-----|----------|---------|
| GPIO19 | IR Receiver | Ball detection input |
| GPIO5 | LED Strip | WS2812 addressable LEDs |
| GPIO23 | Relay Output | External device trigger (2A) |
| GPIO4 | Servo Pin | Optional animated response |

### Required Accessories
- NeatoGolf PCB (Rev 3.x)
- 12V 2-5A Power Supply
- IR emitter (ball sensor or laser)
- WS2812 LED strip (6-12 LEDs recommended)
- Relay module (optional, for sound/mechanical effects)
- Servo motor (optional, for animation)

## Getting Started

### Prerequisites
1. ESPHome installed (via pip or Home Assistant)
2. USB cable for initial programming
3. WiFi network for networked mode (optional)
4. Power supply (12V recommended for LED brightness)

### Step 1: Flash Firmware

1. Connect ESP32 to computer via USB

2. Edit `main.yaml`:
   ```yaml
   # Choose operating mode:
   # For standalone (default):
   config_file: !include configs/standalone.yaml

   # For networked (with Home Assistant):
   #config_file: !include configs/networked.yaml
   ```

3. For networked mode, create `configs/secrets.yaml`:
   ```yaml
   wifi_ssid: "YourWiFiNetwork"
   wifi_password: "YourPassword"
   ```

4. Flash to device:
   ```bash
   esphome -s id 1 run Golf/NeatoGolf/main.yaml
   ```

### Step 2: Physical Installation

1. **Mount Target**:
   - Secure to golf course location (above hole, at obstacle, etc.)
   - Position IR receiver toward expected ball path
   - Orient LED strip toward players

2. **Connect IR Emitter**:
   - Connect ball sensor to GPIO19
   - Use IR sensor that triggers on ball detection
   - Test sensor activation in web interface

3. **Connect LED Strip**:
   - 5V power to LED strip
   - Ground connection
   - Data line to GPIO5
   - Test LEDs in web interface

4. **Optional: Relay Output**:
   - Connect relay module to GPIO23
   - Use for sound effects, scoreboards, or mechanical triggers
   - Test relay toggle in web interface

5. **Optional: Servo Animation**:
   - Connect servo to GPIO4
   - Program movements for hit responses
   - 90-degree return after animation

### Step 3: Initial Configuration

1. **Standalone Mode**:
   - Connect to WiFi SSID: `golf-1`
   - Password: `neato123`
   - Open: `http://192.168.4.1`

2. **Networked Mode**: Auto-appears in Home Assistant

3. **Test Hit Detection**:
   - Trigger IR sensor manually
   - Watch for LED flash response
   - Check relay activation (if enabled)
   - Verify score updates

## Configuration

### Core Parameters

#### Scoring
- **Points Per Hit**: 10 points default (adjustable 0-100)
- **Hit Display Time**: 3000ms (duration of LED effect)

#### Timers
- **Hit Duration**: 3000ms (how long effects display)
- **Cooldown Time**: 1000ms (time before next hit counted)
- **Relay Time**: 3000ms (how long relay stays active)

#### LED Effects
- **Effect Selection**: Choose animation pattern
  - Rainbow: Flowing color effect
  - Color Wipe: Solid color sweep
  - Strobe: Rapid flashing
  - Twinkle: Twinkling stars
  - Custom: Programmable effects
- **Color**: Adjustable RGB color selection
- **Brightness**: 0-100% LED intensity

#### Optional Features
- **Servo Animation**: Enable/disable automated responses
- **Relay Trigger**: Enable/disable external device triggering
- **FPP Integration**: Enable for light show synchronization

### Setting the Target Color

The LED strip color can be set two ways from the web interface (`http://golf-1.local`) or Home Assistant.

> **Important:** Color only displays as a solid fill when the **Golf LEDs Hit Effect** select is set to **Solid Color**. While an animated effect (Rainbow, Color Wipe, etc.) is active, that effect overrides the solid color you choose.

#### Method 1 — Preset Color (easiest)

Use the **Target LEDs Solid Color** dropdown to pick a named color:

1. Set **Golf LEDs Hit Effect** → **Solid Color**
2. Open the **Target LEDs Solid Color** dropdown
3. Choose one of: Red, Green, Blue, Yellow, Purple, Cyan, White, Orange, Pink

The strip switches to the selected color immediately.

> If your hardware has a second strip, the **LED Strip 2 Solid Color** dropdown controls it independently with the same color options.

#### Method 2 — Custom RGB Color (color picker)

For any color outside the presets, use the light entity directly:

1. Set **Golf LEDs Hit Effect** → **Solid Color**
2. Open the **Golf LEDs** light control
3. Use the RGB color picker to dial in any color, and the **Brightness** slider to set intensity (0–100%)

#### From Home Assistant

```yaml
# Pick a preset color
service: select.select_option
target:
  entity_id: select.golf_1_target_leds_solid_color
data:
  option: "Blue"

# Or set a custom RGB color directly on the light
service: light.turn_on
target:
  entity_id: light.golf_1_golf_leds
data:
  rgb_color: [255, 128, 0]   # orange
  brightness_pct: 100

# Make sure the effect is on Solid Color so the color shows
service: select.select_option
target:
  entity_id: select.golf_1_golf_leds_hit_effect
data:
  option: "Solid Color"
```

> Entity names use the device ID (e.g. `golf_1`). Substitute your device's ID accordingly.

### Typical Configurations

**Basic Hole Target:**
```
Points: 10 per hit
Hit Duration: 3000ms
LED Effect: Rainbow
Relay: Off (no external sound)
```

**Challenging Obstacle:**
```
Points: 50 per hit (harder target)
Cooldown: 2000ms (prevents rapid re-hits)
LED Effect: Strobe (exciting visual)
Relay: On (reward sound effect)
```

**Animated Mini-Golf Hole:**
```
Points: 25
LED Effect: Color Wipe (guiding color)
Servo: Enabled (flag waves on hit)
Relay: On (loud celebration sound)
Hold Time: 2000ms (animation runs 2 seconds)
```

## Operation

### Standard Golf Flow

1. **Target Idle**:
   - LED strip shows subtle pulse or static color
   - Waiting for ball impact
   - System ready for next hit

2. **Ball Detected** (IR trigger):
   - LED effect activates immediately
   - Relay triggers (if enabled)
   - Servo animates (if enabled)
   - Score incremented

3. **Hit Response** (3000ms):
   - Bright LED animation plays
   - External sounds/effects trigger
   - System reports hit to Home Assistant

4. **Cooldown** (1000ms):
   - System ignores additional hits
   - Prevents double-counting bounces
   - LED fades back to idle state

5. **Ready for Next** (after cooldown):
   - System reset and ready
   - Awaits next ball

### Manual Testing

Use web interface "Test" button to:
- Simulate ball hit
- Verify LED effects work
- Check relay activation
- Confirm servo movement
- See score update in real-time

## Web Interface

Access at: `http://golf-1.local` or IP address

### Dashboard
- **Live Score**: Current target score
- **Hit Counter**: Total hits recorded
- **Last Hit**: Timestamp of most recent detection
- **LED Status**: Current LED pattern and color

### Configuration
- **Points Per Hit**: 0-100 (adjustable)
- **Effect Selection**: Dropdown menu of LED patterns
- **Color Picker**: RGB color selection
- **LED Brightness**: 0-100% slider
- **Timers**: Hit duration, cooldown, relay time

### Control Buttons
- **Test Target Hit**: Simulate ball detection
- **Clear Score**: Reset hit counter to 0
- **LED Test**: Cycle through effects
- **Relay Test**: Pulse relay output

### System
- **Restart**: Reboot device
- **WiFi Reset**: Clear WiFi credentials
- **Factory Reset**: Reset all settings to default

## Home Assistant Integration

### Standalone Mode
NeatoGolf creates WiFi AP. Full control via web interface, no Home Assistant needed.

### Networked Mode
NeatoGolf integrates with Home Assistant via ESPHome API.

#### Available Services

```yaml
# Manually increment score
service: button.press
data:
  entity_id: button.golf_1_test_target_hit

# Clear score
service: button.press
data:
  entity_id: button.golf_1_clear_score

# Trigger relay manually
service: switch.turn_on
data:
  entity_id: switch.golf_1_relay_1
```

#### Available Entities

- `button.golf_1_test_target_hit` - Simulate ball detection
- `button.golf_1_clear_score` - Reset score to zero
- `switch.golf_1_relay_1` - Manual relay control
- `light.golf_1_target_leds` - LED control (on/off/color)
- `number.golf_1_points` - Points per hit (read-only, config in web UI)
- `sensor.golf_1_uptime` - Device uptime

#### Events

NeatoGolf sends events to Home Assistant on hits:

```yaml
event_type: esphome.target-hit
data:
  address: "1"  # Target ID
  points: 10    # Points awarded
```

#### Game Integration Example

```yaml
automation:
  - alias: "Track Golf Scores"
    trigger:
      - platform: event
        event_type: esphome.target-hit
    action:
      - service: input_number.increment
        target:
          entity_id: input_number.golf_score_player_1
      - service: media_player.play_media
        target:
          entity_id: media_player.golf_sound_system
        data:
          media_content_id: "golf_cheer_sound"
          media_content_type: audio
```

## Troubleshooting

### Target Not Detecting Ball Hits

**Symptom**: IR sensor doesn't trigger, no LED response

**Causes & Solutions:**
1. **IR Sensor Not Positioned**
   - Verify sensor faces ball path
   - Ensure emitter/reflector is clean
   - Test with multimeter for continuity

2. **IR Sensitivity Too Low**
   - Check sensor specifications
   - May need more powerful IR source
   - Try different sensor position/angle

3. **GPIO19 Issue**
   - Verify wiring from sensor to GPIO19
   - Check for loose connections
   - Test with direct button press to GPIO19

4. **Configuration Problem**
   - Verify IR protocol set correctly (NEC default)
   - Check IR receiver not inverted in code
   - Review device logs for sensor messages

### LED Effects Not Working

**Symptom**: No light output despite hit detection

**Causes & Solutions:**
1. **LED Strip Not Powered**
   - Verify 5V power to LED strip
   - Check power supply has adequate current
   - Test with multimeter: should show 5V at LED input

2. **Data Line Issue**
   - Verify GPIO5 connected to LED data pin
   - Check for loose connections
   - Test with different LED strip

3. **LED Count Wrong**
   - Verify LED count matches configuration
   - Wrong count will cause partial or no effect
   - Update configuration to actual LED count

4. **Brightness at 0%**
   - Check "LED Brightness" slider in web UI
   - Set to 50-100% for testing
   - May appear off at very low brightness

### Relay Not Activating

**Symptom**: Hit detected, LED works, but relay doesn't trigger

**Causes & Solutions:**
1. **Relay Module Issue**
   - Verify relay module powered separately
   - Check relay toggle in web interface
   - Test manual relay press button

2. **GPIO23 Wiring**
   - Verify relay input connected to GPIO23
   - Check for loose connections
   - Use multimeter to check GPIO23 voltage during hit

3. **Relay Configuration**
   - Verify "Relay Trigger" enabled in config
   - Check relay time setting is >0
   - Review device logs for relay status

### WiFi Connection Issues

**Device doesn't connect to network:**
1. Verify SSID and password in secrets.yaml
2. Check 2.4GHz WiFi available (5GHz not supported)
3. Factory reset: Power cycle 3 times rapidly
4. Reconnect through AP: `golf-1`

### Web Interface Not Accessible

**Can't reach at golf-1.local:**
1. Verify device powered and booted (wait 20 seconds)
2. Try IP address instead of hostname
3. Check firewall allows HTTP traffic
4. Clear browser cache
5. Try different browser

### Servo Animation Not Working

**Symptom**: Hit detected but servo doesn't move

**Causes & Solutions:**
1. **Servo Power Issue**
   - Verify servo powered from 7-14V supply
   - Check servo connector wired correctly
   - Test servo with external power source

2. **GPIO4 Wiring**
   - Verify servo signal pin connected to GPIO4
   - Check connections not loose
   - Use multimeter to check GPIO4 PWM during animation

3. **Servo Configuration**
   - Verify servo animation enabled in config
   - Check servo range (0-180 degrees typical)
   - Review device logs for servo messages

## Specifications

### Power Requirements
- **Voltage**: 7V-14V DC (12V recommended for LEDs)
- **Current**:
  - ESP32: 100-200mA
  - LED strip: Up to 500mA (depends on brightness/count)
  - Relay: 100mA
  - Servo: 200-500mA during movement
  - **Total typical**: 1-2A

### Operating Environment
- **Temperature**: -10°C to +60°C
- **Humidity**: 10-90% non-condensing
- **WiFi Range**: 30-50m

### Performance
- **Hit Detection**: <100ms response time
- **LED Update Rate**: 30+ FPS (smooth animation)
- **Maximum Score**: Unlimited (uses integer)

## Support

For issues:
1. Check this troubleshooting section
2. Review device web interface logs
3. Test IR with smartphone camera
4. Verify power supply voltage
5. Contact NEATO-FX support with device logs

Made by the NEATO-FX Team
*Last updated: April 2026*