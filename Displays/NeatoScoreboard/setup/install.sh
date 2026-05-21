#!/bin/bash
# ==============================================================================
# SmartScoreboard - Pi Zero 2W Setup Script
# Run once after flashing Raspberry Pi OS Lite
# ==============================================================================

set -e

echo "Installing SmartScoreboard dependencies..."

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Firefox ESR + lighttpd + unclutter
# Firefox ESR fits in 512MB RAM (Pi Zero 2W) unlike Chromium which requires 1GB+
sudo apt-get install -y firefox-esr lighttpd unclutter xdotool

# Copy scoreboard files to web root
sudo cp -r /home/digtown/SmartScoreboard/* /var/www/html/

# Configure lighttpd
sudo systemctl enable lighttpd
sudo systemctl start lighttpd

# Install kiosk autostart
mkdir -p /home/digtown/.config/autostart
cat > /home/digtown/.config/autostart/scoreboard.desktop << EOF
[Desktop Entry]
Type=Application
Name=SmartScoreboard
Exec=/home/digtown/SmartScoreboard/setup/kiosk.sh
EOF

chmod +x /home/digtown/SmartScoreboard/setup/kiosk.sh

echo "Done. Reboot to start kiosk mode."
