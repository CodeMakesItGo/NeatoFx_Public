# NeatoFx Motor (Winch) — Setup & Calibration Guide

A winch is the standard NeatoFx Motor with a position encoder **instead of limit switches**. Set **Motor Type = Winch** in the web UI (Rev 4.3 24V or Rev 3.3 12V board — the single-input Rev 3.0 board is linear-actuator only).

Open the device web UI at `http://motor-24v-xxxxxx.local` / `http://motor-12v-xxxxxx.local` (or the unit's IP) for every control below — they are in the **Winch** card, which appears when Motor Type is Winch.

---

## Encoder wiring

The encoder's two channels go on the **SW1 / SW2 limit-switch inputs** — no other pins, and GPIO26 stays the status LED.

| Encoder wire | Connect to | Rev 4.3 24V | Rev 3.3 12V |
|---|---|---|---|
| Channel A | SW2 input | GPIO13 | GPIO13 |
| Channel B | SW1 input | GPIO25 | GPIO4 |
| VCC | 5 V | | |
| GND | GND (shared with the controller) | | |

> **Open-collector outputs, no level shifter:** the inputs use the ESP32's internal 3.3 V pull-ups, so an open-collector / NPN Hall encoder is safe at any supply voltage in its range. Use 5 V if available.

> **Which way is "out" does not depend on the wiring.** Every edge on either channel is one count, and the direction comes from which way the motor is being driven (reel out = count up). That is safe on a worm-gear winch, which does not coast or back-drive. So there is nothing to swap if the count looks "backwards" — check Motor Type and which output the motor is wired to instead.

> **Use a low-resolution encoder.** The inputs are read in the main loop, not by a hardware counter, so they suit a few hundred counts per second — e.g. 8 magnets × 2 Hall sensors = 32 counts per revolution. A high-resolution optical encoder (hundreds of pulses per revolution) at speed will miss counts.

---

## Step 1 — Check the encoder counts

1. Set **Motor Type = Winch**.
2. Jog with Input 1 (reel out) / Input 2 (reel in), or the **Reel Out / Reel In** buttons at the top of the page.
3. **Encoder Count** (Winch card) should go up while reeling out and down while reeling in. If it does not change, check the encoder power and the two signal wires.

Until home is set the winch only runs at **Slow Speed** and has no soft limits.

---

## Step 2 — Set home

1. Jog the winch fully **in** (cable fully retracted).
2. Press **Set Home Here**. Encoder Count becomes 0.

Home and the count are saved, so they survive a restart. Reel-in now stops at 0.

---

## Step 3 — Calibrate the maximum length

1. Reel out to the full working length.
2. Measure the cable that is out and enter it in **Measured Max Length** (ft).
3. Press **Set Max Length**.

Reel-out now stops at that point, **Cable Out** shows the length in feet, and the slow zones are active.

To recalibrate: turn **Limit Override** on (bypasses both soft limits), move to the new end, redo Step 2 or 3, then turn Limit Override off (it also turns itself off at restart).

---

## Step 4 — Speeds (optional)

| Setting | Card | What it does |
|---|---|---|
| Motor Speed | Drive | Run speed in mid-travel |
| Ramp to Speed | Drive | Time to ramp up on every start |
| Slow Speed | Winch | Speed near either end, and before home is set |
| Slow Zone | Winch | Counts from each end where Slow Speed applies |
| Max Current | Drive | The winch stops if either output stays above this (~200 ms) |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Runs slowly everywhere | Home not set | Step 2 |
| Will not reel in | Already at home (count ≤ 0) | Expected; use Limit Override to go further |
| Will not reel out | At the calibrated max | Expected; recalibrate (Step 3) to change it |
| Encoder Count does not change | Encoder unpowered / not on SW1–SW2 | Check wiring table above |
| Cable Out drifts over time | Missed counts | Lower Motor Speed or use a lower-resolution encoder; re-home |
| Stops on its own under load | Stall trip | Raise Max Current or reduce the load |
