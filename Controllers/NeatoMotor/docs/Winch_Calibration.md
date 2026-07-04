# NeatoFx Motor (Winch) — Calibration Guide

**Encoder:** 600 P/R optical quadrature (2400 counts/rev at 4× resolution)

Open the device web UI at `http://winch-<id>.local` to access all controls referenced below.

---

## Encoder Wiring

### Encoder wire colors (typical — verify against your encoder's label)

| Encoder Wire | Color | Connect To |
|-------------|-------|------------|
| VCC (power) | Red | 5V supply |
| GND | Black | GND (shared with controller) |
| A phase | Green | ESP32 GPIO13 |
| B phase | White | ESP32 GPIO4 |

> **Power:** The encoder runs on 5–24V. Use **5V** if available — simpler and cooler. Any voltage in that range works because the output signals are open-collector (the ESP32's internal pull-up resistors set the signal level to 3.3V regardless of encoder supply voltage).

> **No level shifter needed:** Open-collector outputs pull the signal line to GND when active and release it when inactive. The ESP32's 3.3V INPUT_PULLUP holds the line HIGH when released — safe for the ESP32 at any encoder supply voltage.

### Wemos D1 Mini ESP32 pin locations

```
                 USB
            ┌────────┐
       RST ─┤        ├─ TX
        3V ─┤        ├─ RX
       GND ─┤        ├─ D2  (GPIO26) ← Home limit switch
        5V ─┤        ├─ D4  (GPIO4)  ← Encoder B
      GPIO16─┤        ├─ D5  (GPIO5)
      GPIO17─┤        ├─ D6  (GPIO12)
      GPIO18─┤        ├─ D7  (GPIO13) ← Encoder A
      GPIO19─┤        ├─ D8  (GPIO15)
      GPIO21─┤        ├─ D9  (GPIO2)
      GPIO22─┤        ├─ D10 (GPIO0)
      GPIO23─┤        ├─ CLK (GPIO14)
            └────────┘
```

### Full connection summary

| Signal | ESP32 Pin | Notes |
|--------|-----------|-------|
| Encoder A | GPIO13 | With INPUT_PULLUP — no external resistor needed |
| Encoder B | GPIO4  | With INPUT_PULLUP — no external resistor needed |
| Encoder VCC | 5V pin | Or external 5V rail shared with controller |
| Encoder GND | GND | Must share GND with the ESP32 board |
| Home Limit Switch | GPIO26 | Normally-open switch between GPIO26 and GND |

> **Swap A and B** if reel-out makes the count go negative instead of positive. No firmware change needed — just swap the two signal wires.

---

## Step 1 — Verify encoder direction

Before calibrating, confirm the encoder counts in the right direction.

1. Power on the winch. It will automatically begin homing (reeling in). Watch the **Encoder Count** sensor.
2. While reeling **in**, the count should be **decreasing** (going negative from wherever it starts).
3. If it is increasing while reeling in, swap the A and B encoder wires and reboot.

> If swapping wires isn't convenient, change `encoder_a_pin` and `encoder_b_pin` in the firmware and re-flash.

---

## Step 2 — Auto-home on first boot

On every power-on the winch automatically homes itself:

1. The motor reels in at slow speed until the **Home Limit Switch** is triggered.
2. It backs off **Home Backoff** counts (default 1200 ≈ ½ revolution) and sets that position as **count = 0**.
3. Status changes from **Not Homed** → **Homing** → **Idle**.

Wait for the status to show **Idle** before proceeding. If homing fails or times out, check the limit switch wiring and press **Home Winch** to retry.

---

## Step 3 — Tune Home Backoff (optional, first time only)

Home Backoff sets how far off the limit switch the zero position sits. The default (1200 counts) is about ½ revolution.

- Too small: normal reel-in may bump the limit switch during operation.
- Too large: you lose that much usable rope travel.

To adjust:

1. Enable **Limit Override** switch.
2. Manually reel in until the limit switch activates (winch stops).
3. Note the **Encoder Count** value — it will be negative.
4. Set **Home Backoff** to a count value that gives a comfortable margin (e.g. if your motor does 5 rev/inch, 2400 counts = 1 inch of clearance).
5. Press **Home Winch** to re-home with the new value.
6. Turn off **Limit Override**.

---

## Step 4 — Calibrate max cable length

This teaches the controller where the end of travel is.

1. Confirm status shows **Idle** (homed successfully).
2. Hold the joystick **OUT** (or use the HA cover entity) to reel out the full length of cable.
3. Stop when the cable is fully extended.
4. Physically measure the deployed cable length in **feet**.
5. Set **Max Length (Input)** to that measured value.
6. Press **Set Max Length**.

The controller saves the current encoder count as `max_count` and the entered feet value. The **Cable Out Length** sensor will now show live position in meters, and the **Max Cable Length** sensor will reflect the calibrated maximum.

---

## Step 5 — Tune Slow Zone (optional)

The winch automatically slows down near each end of travel. The **Slow Zone** count sets how early it starts slowing.

| Setting | Effect |
|---------|--------|
| 0 | No slow zone — full speed until the limit |
| 2400 (default) | Slow zone starts ~1 revolution before each end |
| Higher | Longer slow approach — gentler on the mechanism |

Adjust to taste. A good starting point is 1–2 revolutions worth of counts for your gear ratio.

---

## Step 6 — Verify operation

1. Check **Winch Status** reads **Idle**.
2. Reel out — **Cable Out Length** should increase smoothly.
3. Reel in — length should decrease, motor should slow near zero and stop at home.
4. Confirm the motor slows noticeably when entering the slow zone at each end.
5. Confirm the motor stops at **max_count** without hitting a hard stop.

---

## Settings reference

| Control | Default | Description |
|---------|---------|-------------|
| Run Speed | 80% | Motor speed during normal travel |
| Slow Speed | 40% | Motor speed inside the slow zone |
| Slow Zone | 2400 counts | Counts from each limit where slow speed activates (~1 rev) |
| Home Backoff | 1200 counts | Counts to back off the limit switch during homing (~½ rev) |
| Stall Current Limit | 8 A | Motor stops if current exceeds this (prevents damage) |
| Direction Change Ramp | 300 ms | Time to ramp down/up when reversing direction |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Status stuck on **Not Homed** | Limit switch not wiring or not triggering | Check switch wiring on GPIO26; manually press switch to test |
| Encoder Count doesn't change | Encoder not wired or wrong pins | Verify A→GPIO13, B→GPIO4; check 5V supply to encoder |
| Count goes wrong direction | A and B phase swapped | Swap encoder A/B wires |
| Winch overshoots home | Home Backoff too small | Increase **Home Backoff** in web UI |
| Cable Out Length shows — | Not homed or not calibrated | Complete Steps 2–4 |
| Motor stops mid-travel | Stall current limit too low | Increase **Stall Current Limit** in web UI |
