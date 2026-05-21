# SmartMotor Controller

General-purpose bidirectional DC motor controller for linear actuators, winches, animatronic props, automated doors, and any reversible DC motor load.

**Hardware:** ESP32 (Wemos D1 Mini32) + 2× BTN8962TA H-bridge
**Config file:** `SmartMotor/boards/motor_rev3_0.yaml`

---

## GPIO Pinout

| GPIO | Function | Direction |
|------|----------|-----------|
| GPIO18 | RPWM — Forward PWM | Output |
| GPIO19 | LPWM — Reverse PWM | Output |
| GPIO16 | R_EN — Right half-bridge enable | Output |
| GPIO17 | L_EN — Left half-bridge enable | Output |
| GPIO4 | Open limit switch | Input (pullup, inverted) |
| GPIO13 | Closed limit switch | Input (pullup, inverted) |
| GPIO14 | Toggle button | Input (pullup, inverted) |
| GPIO34 | Current sense — forward direction (ADC) | Input only |
| GPIO35 | Current sense — reverse direction (ADC) | Input only |
| GPIO22 | Status LED | Output |

> **Note:** Input LEDs (LED3, LED7, LED8) on the toggle, open, and closed switch connectors are wired anode-to-5V. Ensure LEDs are installed with the anode toward the 5V rail, cathode toward the resistor.

---

## Web UI Controls

### Numbers

| Control | Range | Default | Description |
|---------|-------|---------|-------------|
| Motor Speed | 1–100% (step 1) | 100% | PWM duty cycle applied to the active motor direction. Takes effect on the next run. |
| Motor Timer | 0–60000 ms (step 100) | 0 | Run duration per direction. 0 = run indefinitely until a limit switch or toggle stops it. |
| Toggle Delay | 50–5000 ms (step 50) | 500 ms | Pause between motor stop and restart when changing direction. Prevents current spikes and mechanical stress. |

### Switches

| Switch | Default | Description |
|--------|---------|-------------|
| Open Switch Enabled | OFF | When ON, the open/forward limit switch affects motor behavior. When OFF, it only reports position to Home Assistant. |
| Closed Switch Enabled | OFF | When ON, the closed/reverse limit switch affects motor behavior. When OFF, it only reports position to Home Assistant. |

### Selects

| Select | Options | Default | Description |
|--------|---------|---------|-------------|
| Travel Mode | 1 Direction / Bi-direction | 1 Direction | What happens when a limit switch fires (if enabled) or the timer expires. See behavior tables below. |

---

## Behavior Tables

### On Startup

Motor is **always stopped** on boot. The first toggle press always runs **Forward**. If forward is the wrong direction for your application, swap the motor wiring.

### On Toggle Button Press (or Home Assistant toggle)

The toggle always: **stops the motor → waits Toggle Delay → flips direction → starts**.

| Timer | Travel Mode | Full Behavior |
|-------|-------------|---------------|
| 0 | 1 Direction | Motor runs until a limit switch (if enabled) stops it, or the next toggle |
| 0 | Bi-direction | Motor runs until a limit switch (if enabled) stops it, or the next toggle |
| ≥ 10 ms | 1 Direction | Motor runs for timer ms (or until limit switch), then stops |
| ≥ 10 ms | Bi-direction | Motor runs for timer ms (or until limit switch), stops, waits Toggle Delay, returns in opposite direction for timer ms (or until limit switch), stops |

> **Bi-direction + Timer:** After the full round trip completes, `current_direction` is restored to where it started. The next toggle will repeat the same round trip.

### On Open Limit Switch

| Open Switch Enabled | Travel Mode | Behavior |
|---------------------|-------------|----------|
| OFF | Either | Nothing — position reported to HA only |
| ON | 1 Direction | Motor stops |
| ON | Bi-direction | Motor stops, waits Toggle Delay, reverses, runs (no timer on reversal — runs until the other limit switch or a toggle) |

### On Closed Limit Switch

Identical to Open Limit Switch behavior above, but for the reverse/closed end.

---

## Stall Detection

Current draw is monitored on both H-bridge channels at 100 ms intervals. If either channel exceeds **8.0 A**, all scripts are cancelled and the motor is immediately braked. This protects the motor and H-bridge from sustained stall conditions (e.g. a jam, mechanical blockage, or over-travel past a limit switch).

The 8.0 A threshold corresponds approximately to 0.94V on the BTN8962TA IS pin with a 1kΩ sense resistor (IS ratio ≈ 1:8500).

---

## Scripting Architecture

Three scripts handle all motor logic:

### `motor_run_cycle` (mode: restart)
Starts the motor in `current_direction` at the configured Motor Speed. If timer ≥ 10 ms, waits for the timer then brakes. In Bi-direction mode with a timer, also runs the return trip at the same speed, then restores the original direction when complete.

Calling this script while it is already running restarts it from the beginning (due to `mode: restart`).

### `motor_limit_reverse` (mode: restart)
Called by a limit switch when it is enabled and Travel Mode is Bi-direction. Cancels `motor_run_cycle`, brakes, waits Toggle Delay, flips `current_direction`, then starts the motor at Motor Speed without a timer.

### `do_toggle` (mode: restart)
Called by the physical toggle button. Cancels both running scripts, brakes, waits Toggle Delay, flips `current_direction`, then calls `motor_run_cycle`.

### `current_direction` global
A non-persistent boolean (`true` = forward/open, `false` = reverse/close). Always starts as `true` (forward) on boot. Changed by toggle presses and limit switch reversals.

---

## Home Assistant Cover Entity

The motor is exposed as a **gate** cover entity named `Motor`. Home Assistant open/close/stop commands work as follows:

- **Open:** Cancels any running scripts, forces `current_direction` to forward, executes `motor_run_cycle`
- **Close:** Cancels any running scripts, forces `current_direction` to reverse, executes `motor_run_cycle`
- **Stop:** Cancels all scripts, brakes motor

---

## Common Configurations

### Linear Actuator (position A ↔ position B, timed)
1. Set **Motor Timer** to the travel time in ms (e.g. 3000)
2. Set **Travel Mode** to `1 Direction`
3. Set **Motor Speed** to suit your load
4. Leave limit switches disabled (actuators have built-in end stops)
5. Press toggle: actuator travels for 3 s then stops. Press again: travels back for 3 s.

### Linear Actuator (automatic return, timed)
1. Set **Motor Timer** to travel time
2. Set **Travel Mode** to `Bi-direction`
3. Press toggle once: actuator extends for timer ms, pauses Toggle Delay, retracts for timer ms, stops. Repeats each toggle.

### Gate / Door with Physical Limit Switches
1. Set **Motor Timer** to `0`
2. Enable **Open Switch Enabled** and **Closed Switch Enabled**
3. Set **Travel Mode** to `1 Direction`
4. Motor runs to each end and stops at the limit switch. Toggle reverses direction.

### Continuously Bouncing Actuator (bi-directional with limit switches)
1. Set **Motor Timer** to `0`
2. Enable both limit switches
3. Set **Travel Mode** to `Bi-direction`
4. Press toggle to start. Motor runs forward first, then reverses automatically at each limit switch and bounces indefinitely.

### Winch / Animatronic Prop (triggered run)
1. Set **Motor Timer** to desired extension time
2. Set **Travel Mode** to `Bi-direction`
3. Set **Motor Speed** to control prop speed
4. Trigger via Home Assistant automation on an `esphome.target-hit` event
5. Winch extends, returns, and stops — ready for the next trigger.

### Reduced Speed Run
1. Set **Motor Speed** to desired percentage (e.g. 50% for half speed)
2. Configure timer and travel mode as normal
3. Speed applies to both forward and return legs of all run cycles

---

## Flash & Monitor Commands

```bash
# Flash
esphome -s id 0001 run SmartMotor/motor_main.yaml

# Monitor logs
esphome -s id 0001 logs SmartMotor/motor_main.yaml

# Compile only
esphome -s id 0001 compile SmartMotor/motor_main.yaml
```
