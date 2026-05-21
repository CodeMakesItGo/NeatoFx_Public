#!/bin/bash
# ==============================================================================
# SmartScoreboard - Update & Restart Script
# Run this on the Pi to pull latest changes and refresh the browser.
# ==============================================================================

set -e

echo "Pulling latest changes from GitHub..."
cd /home/digtown/SmartScoreboard

echo "Copying files to web root..."
sudo cp -r ./* /var/www/html/

echo "Restarting browser..."
pkill -f firefox-esr || true
sleep 1
UID_VAL=$(id -u digtown)
sudo -u digtown \
  WAYLAND_DISPLAY=wayland-0 \
  XDG_RUNTIME_DIR=/run/user/${UID_VAL} \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${UID_VAL}/bus \
  nohup bash /home/digtown/SmartScoreboard/setup/kiosk.sh > /dev/null 2>&1 &

echo "Done."
