#!/bin/bash
# ==============================================================================
# SmartScoreboard - Firefox Kiosk Launcher
# ==============================================================================

# Wait for desktop
sleep 5

# Launch Firefox in kiosk mode (Wayland) with hidden cursor via CSS pointer override
WAYLAND_DISPLAY=wayland-0 firefox-esr --kiosk --no-remote --new-instance http://localhost/scoreboard.html
