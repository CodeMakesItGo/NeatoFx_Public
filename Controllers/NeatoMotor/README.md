# SmartMotor - WiFi Bidirectional Motor Controller

The NEATO-FX SmartMotor is a professional-grade WiFi-enabled motor controller designed for interactive attractions, escape rooms, and entertainment systems. It provides precise bidirectional control of DC motors, with limit switch support, current monitoring, and full automation integration.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Hardware](#hardware)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Operation](#operation)
- [Web Interface](#web-interface)
- [Home Assistant Integration](#home-assistant-integration)
- [Safety Features](#safety-features)
- [Troubleshooting](#troubleshooting)

## Overview

SmartMotor is a versatile motor controller for:

- **Animated Props**: Moving arms, rotating heads, opening mechanisms
- **Door/Gate Actuators**: Automated entry and exit systems
- **Linear Actuators**: Extending/retracting motion for interactive displays
- **Winches & Hoists**: Lifting and lowering mechanisms
- **Escape Room Effects**: Timed motor sequences and game logic
- **Theme Park Attractions**: Coordinated motion with other systems

Each motor controller features dual H-bridge outputs, limit switch inputs, real-time current sensing for stall detection, and comprehensive Home Assistant integration.

## Features

### Core Functionality
- **Bidirectional Control**: Forward and reverse motor direction
- **Speed Control**: PWM-based variable speed (0-100%)
- **Limit Switches**: Open and closed position detection
- **Stall Detection**: Automatic shutdown when motor stalls (current spike)
- **Timed Operation**: Run for specific duration or until limit switch
- **Manual Control**: Physical toggle button for local operation

### Advanced Features
- **Travel Modes**: 1-Direction (stop at end) or Bi-direction (auto-reverse)
- **Hold Times**: Configurable dwell period at open position before auto-close
- **Current Monitoring**: Real-time current sensing in both directions
- **Status Feedback**: Heartbeat LED, system logging, Home Assistant events
- **Safety Limits**: Configurable stall current threshold (8A default)

### Connectivity
- **Standalone Mode**: Independent WiFi AP for direct control
- **Networked Mode**: Full Home Assistant integration
- **Web Interface**: Real-time control, monitoring, and configuration
- **OTA Updates**: Remote firmware updates over WiFi

## Hardware

### Board Specifications
- **MCU**: ESP32 (Wemos D1 Mini32)
- **Motor Driver**: Dual BTN8962TA H-bridge modules
- **Max Current**: 8A per direction (with stall detection)
- **Operating Voltage**: 7V-14V DC
- **WiFi**: 802.11 b/g/n (2.4GHz only)

### Rev 3.0 Hardware Connections

| Pin | Function | Purpose |
|-----|----------|---------|
| GPIO18 | RPWM | Forward direction PWM |
| GPIO19 | LPWM | Reverse direction PWM |
| GPIO16 | R_EN | Right H-bridge enable |
| GPIO17 | L_EN | Left H-bridge enable |
| GPIO4 | Open Limit | Forward end position switch |
| GPIO13 | Closed Limit | Reverse end position switch |
| GPIO14 | Toggle Button | Manual direction toggle (momentary) |
| GPIO34 | Current IC1 | Forward direction current sensing (ADC) |
| GPIO35 | Current IC2 | Reverse direction current sensing (ADC) |
| GPIO22 | Status LED | Heartbeat indicator |

### Motor Power Requirements
- **Voltage**: 7V-14V DC (same as controller supply)
- **Current**: Depends on motor type and load
  - Typical: 0.5-2A during normal operation
  - Stall: 8-15A maximum (triggers safety shutdown)
- **Power Supply**: Minimum 8A rated for safe operation

### Required Accessories
- DC motor with rated voltage matching power supply
- Optional: Limit switches (mechanical or electronic)
- Optional: Physical toggle button for manual control
- Power supply (7-14V DC, 10A+ recommended)

## Getting Started

### Prerequisites
1. ESPHome installed (via pip or Home Assistant)
2. USB cable for initial programming
3. DC motor and power supply
4. WiFi network for networked mode (optional)

### Step 1: Physical Installation

1. **Mount Motor Securely**
   - Attach motor to mechanical assembly
   - Ensure load is properly supported
   - Connect motor terminals to H-bridge output

2. **Install Limit Switches** (optional but recommended)
   - Mount open limit switch at forward end of travel
   - Mount closed limit switch at reverse end of travel
   - Wire to GPIO4 (open) and GPIO13 (closed)
   - Use normally-open switch design (0V when triggered)

3. **Install Toggle Button** (optional)
   - Mount momentary push button for manual control
   - Wire to GPIO14 (ground to activate)

4. **Power Connections**
   - Supply 7-14V DC power to controller
   - Connect motor power through H-bridge outputs
   - Ensure proper ground connection

### Step 2: Flash Firmware

1. Connect ESP32 to computer via USB

2. Choose operating mode in `motor_main.yaml`:
   ```yaml
   # For networked mode (with Home Assistant):
   config: !include configs/motor_networked_config.yaml

   # For standalone mode (WiFi AP only):
   #config: !include configs/motor_standalone_config.yaml
   ```

3. For networked mode, create `configs/secrets.yaml`:
   ```yaml
   wifi_ssid: "YourWiFiNetwork"
   wifi_password: "YourPassword"
   ```

4. Flash to device:
   ```bash
   # For motor ID 1
   esphome -s id 1 run SmartMotor/motor_main.yaml

   # Or compile + upload separately
   esphome -s id 1 compile SmartMotor/motor_main.yaml
   esphome -s id 1 upload SmartMotor/motor_main.yaml
   ```

### Step 3: Initial Configuration

1. **Networked Mode**: Device appears in Home Assistant automatically
2. **Standalone Mode**:
   - Connect to WiFi SSID: `motor-1` (or your ID)
   - Password: `neato123`
   - Open browser to: `http://192.168.4.1`

3. **First Operation Test**:
   - Open web interface
   - Set Motor Timer to 0 (run until limit/button)
   - Press "Open" or "Close" button
   - Motor should turn in that direction
   - Monitor current readings for proper operation

## Configuration

### Web Interface Controls

#### Motor Parameters
- **Motor Timer**: 0-65535 milliseconds (0 = run until limit or toggle)
- **Toggle Delay**: 0-5000ms (pause between stop and reverse on direction change)
- **Default Direction**: "Forward" or "Reverse" (starting direction when timer=0)

#### Limit Switch Configuration
- **Open Limit Switch Enabled**: Enable/disable forward-end limit detection
- **Closed Limit Switch Enabled**: Enable/disable reverse-end limit detection

#### Travel Modes
- **"1 Direction"**: Stop at limit switch and stay stopped
- **"Bi-direction"**: Automatically reverse at limit (for shuttle motion)

#### Bi-direction Options (when travel mode is bi-direction)
- **Open Hold Time**: 0-10000ms (pause at forward end before auto-reverse)
  - Set to 0 for immediate reversal
  - Set to 2000+ to dwell at open position

#### System Controls
- **Restart**: Reboot the device
- **WiFi Reset**: Clear WiFi credentials and enter AP mode
- **Factory Reset**: Reset all settings to defaults

### Typical Configurations

**Animated Door (Opens and Stays):**
```
Travel Mode: 1 Direction
Motor Timer: 0 (run until limit)
Default Direction: Forward
Open Limit Enabled: Yes
Closed Limit Enabled: Yes
```

**Escape Room Shuttle (Back and Forth):**
```
Travel Mode: Bi-direction
Motor Timer: 0 (continuous shuttle)
Open Hold Time: 1000ms (1 second pause at each end)
Default Direction: Forward
```

**Timed Extension (10 second cycle):**
```
Motor Timer: 10000ms (10 seconds)
Toggle Delay: 500ms (safety pause)
Default Direction: Forward (then reverses automatically)
```

**Linear Actuator with Safety:**
```
Travel Mode: 1 Direction (safer than bi-direction)
Motor Timer: 0
Open Limit Enabled: Yes
Closed Limit Enabled: Yes
```

## Operation

### Basic Workflow

1. **Device Boot** (10-20 seconds):
   - H-bridge disabled (motor safe)
   - WiFi connects or creates AP
   - Status LED shows heartbeat (ready state)

2. **Motor Start** (via button or web interface):
   - Direction selected (forward or reverse)
   - H-bridge enables and motor runs
   - Current monitored continuously
   - LED shows motion state

3. **Motor Running**:
   - If limit switch triggered: motor stops at that end
   - If current exceeds limit (8A stall): auto-shutoff for safety
   - If timer expires: motor stops after time interval
   - If toggle button pressed: motor reverses

4. **Motor Stop**:
   - H-bridge disables
   - Outputs turn off
   - System awaits next command

### Control Methods

**Web Interface:**
- Open button: Run forward until limit or timer expires
- Close button: Run reverse until limit or timer expires
- Stop button: Immediately halt motor
- Toggle button: Change direction

**Physical Toggle Button** (GPIO14):
- Press to start motor in default direction
- Press again to reverse
- Press at any time to stop

**Home Assistant**:
- Use entity controls from Home Assistant interface
- Create automations for complex sequences
- Monitor status in real-time

## Web Interface

Access at: `http://motor-1.local` or IP address

### Dashboard Sections

**Motor Control**
- Open/Close/Stop buttons
- Direction indicator
- Motor running status

**Configuration**
- Motor timer (0-65535ms)
- Toggle delay (0-5000ms)
- Travel mode selector (1 Direction / Bi-direction)
- Hold time for bi-direction operation
- Limit switch enable toggles
- Default direction selector

**Monitoring**
- Current draw (forward and reverse)
- Limit switch status
- Motor state (idle, forward, reverse, stalled)
- WiFi signal strength
- Device uptime

**System**
- WiFi Reset button
- Restart button
- Factory Reset button

## Home Assistant Integration

### Standalone Mode
Motor creates its own WiFi access point. Full control via web interface, no Home Assistant required.

### Networked Mode
Motor integrates with Home Assistant via ESPHome API.

#### Available Services

```yaml
# Start motor forward
service: button.press
data:
  entity_id: button.motor_1_open

# Start motor reverse
service: button.press
data:
  entity_id: button.motor_1_close

# Stop motor immediately
service: button.press
data:
  entity_id: button.motor_1_stop

# Set motor timer
service: number.set_value
data:
  entity_id: number.motor_1_motor_timer
  value: 5000  # 5 seconds
```

#### Available Entities

- `button.motor_1_open` - Start forward motion
- `button.motor_1_close` - Start reverse motion
- `button.motor_1_stop` - Stop motor immediately
- `binary_sensor.motor_1_open_limit_switch` - Forward limit status
- `binary_sensor.motor_1_closed_limit_switch` - Reverse limit status
- `binary_sensor.motor_1_toggle_button` - Physical button state
- `sensor.motor_1_uptime` - System uptime
- `number.motor_1_motor_timer` - Timer setting (0-65535ms)
- `number.motor_1_toggle_delay` - Delay between direction changes

#### Events

Motor sends events to Home Assistant on state changes:

```yaml
event_type: esphome.motor-idle
data:
  address: "1"  # Motor ID (when transitions to idle)
```

## Safety Features

### Stall Detection
- **Function**: Monitors current draw to detect jammed motor
- **Threshold**: 8A (configurable in code)
- **Action**: Automatic immediate shutdown
- **Recovery**: Requires new command to restart

### Limit Switches
- **Purpose**: Prevent over-travel and mechanical damage
- **Effect**: Stops motor at limits or reverses (based on travel mode)
- **Required**: Strongly recommended for all installations

### H-Bridge Safety
- **Boot Behavior**: H-bridge disabled on startup (motor disabled until command)
- **Timeout Protection**: Motors automatically stop if firmware hangs
- **Current Limiting**: BTN8962TA module has internal current protection

### Recommendations
1. Always install limit switches at mechanical limits
2. Use proper wire gauge for current capacity (>8A)
3. Test emergency stop procedures
4. Monitor current readings during operation
5. Use power supply with over-current protection
6. Never operate without firmware safety checks enabled

## Troubleshooting

### Motor Won't Start

**Symptom**: Buttons work but motor doesn't move

**Causes & Solutions:**
1. **Power Not Supplied**
   - Check power supply is connected and powered
   - Verify voltage meter shows 7-14V at controller input
   - Check motor ground connection

2. **Motor Wiring Issue**
   - Verify motor terminals connected to H-bridge outputs
   - Test motor directly with battery (bypasses controller)
   - Check for loose connections

3. **H-Bridge Disabled**
   - Check firmware booted correctly (wait 20 seconds)
   - Restart controller if recently powered
   - Check ESPHome logs for errors

4. **Stalled on Startup**
   - If motor was stalled when powered off, it may think it's stuck
   - Power cycle and immediately press a direction button
   - Check for mechanical jam

### Motor Continuously Stalls

**Symptom**: Motor stops immediately with stall detection

**Causes & Solutions:**
1. **Mechanical Jam**
   - Check for obstructions in travel path
   - Manually move mechanism to verify it moves freely
   - Ensure proper lubrication if required

2. **Excessive Load**
   - Motor cannot handle load even without jam
   - Reduce load or upgrade to more powerful motor
   - Check gearing ratios if using transmission

3. **Current Sensor Issue**
   - Faulty current sensor reading too high
   - In code, increase stall threshold from 8.0A to 10.0A
   - Replace current sensor if faulty

### Motor Runs but Limit Switch Not Working

**Symptom**: Motor doesn't stop at limit switch

**Causes & Solutions:**
1. **Switch Not Wired**
   - Verify limit switch terminals connected to GPIO4/GPIO13
   - Check wiring continuity with multimeter
   - Ensure switch makes contact when triggered

2. **Switch Logic Inverted**
   - Verify switch is wired to pull GPIO LOW when triggered
   - Check configuration: `inverted: true` in code (should be present)
   - Test with multimeter: 0V when triggered, 3.3V otherwise

3. **Disabled in Configuration**
   - Check web interface: "Open Limit Switch Enabled" toggle
   - Make sure both limit switches are enabled if you want both

4. **Switch Doesn't Touch**
   - Mechanically verify limit switch placement
   - Ensure moving mechanism actually triggers switch
   - Add spacers or adjust mount as needed

### WiFi Connection Issues

**Device doesn't connect to network:**
1. Verify SSID and password in `secrets.yaml`
2. Check WiFi signal strength at device location
3. Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
4. Factory reset:
   - Power cycle device 3 times rapidly
   - Device creates AP: `motor-1`
   - Connect and reconfigure WiFi

### Web Interface Not Loading

**Symptom**: Can't reach device at `motor-1.local`

**Solutions:**
1. Verify device is powered and booted (wait 20 seconds)
2. Try IP address instead of hostname
3. Check firewall isn't blocking HTTP
4. Clear browser cache
5. Try different browser

### Current Readings Incorrect

**Symptom**: Current sensor shows wrong values

**Causes & Solutions:**
1. **Sensor Not Calibrated**
   - Current display is approximate (uses voltage scaling)
   - Readings should be proportional to actual current
   - Compare with external multimeter

2. **ADC Noise**
   - Current readings may be noisy
   - Firmware applies averaging filter
   - Use moving average if readings unstable

3. **Sensor Wiring**
   - Verify current sense outputs connected to GPIO34/GPIO35
   - Check sensor connections aren't loose

## Specifications

### Electrical
- **Supply Voltage**: 7V-14V DC
- **Supply Current**: 10A+ recommended
- **Motor Current**: 0.5-8A typical
- **Logic Voltage**: 3.3V (ESP32)
- **Max Output Current**: 8A per direction with stall protection

### Mechanical
- **Motor Type**: Standard brushed DC motors (3V-14V)
- **Gearing**: Any ratio (configure timers accordingly)
- **Duty Cycle**: Continuous (with cooling)

### Operating Environment
- **Temperature**: -10°C to +60°C
- **Humidity**: 10-90% non-condensing
- **WiFi Range**: 30-50m (depends on obstacles)

### Connectivity
- **WiFi**: 802.11 b/g/n only (2.4GHz)
- **Control**: Web interface, Home Assistant, physical button

## Support

For issues or questions:
1. Check this README troubleshooting section
2. Enable debug logging and review device logs
3. Verify all mechanical components move freely
4. Test motor directly with power supply
5. Review ESPHome documentation at esphome.io
6. Contact NEATO-FX support with device logs

Made by the NEATO-FX Team
*Last updated: April 2026*
