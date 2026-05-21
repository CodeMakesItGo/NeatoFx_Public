// ==============================================================================
// SMART SCOREBOARD - CONFIGURATION
// ==============================================================================
// Edit this file to customize the scoreboard for your gallery.
// ==============================================================================

const CONFIG = {

  // ----------------------------------------------------------------------------
  // HOME ASSISTANT CONNECTION
  // ----------------------------------------------------------------------------
  ha_url: "http://homeassistant.local:8123",
  ha_token: "REDACTED_HA_TOKEN",   // HA → Profile → Long-Lived Access Tokens
  // ----------------------------------------------------------------------------
  // DISPLAY
  // ----------------------------------------------------------------------------
  // Background image — place file in assets/backgrounds/
  background: "assets/backgrounds/IMG_1387.JPG",

  // Title shown at the top of the scoreboard
  title: "DigTown Shooting Gallery",

  // Display mode:
  //   "score"            — show score only
  //   "score_hits"       — show score + hits
  //   "score_shots_hits" — show score + shots + hits
  display_mode: "score_shots_hits",

  // Auto-reset scores after a game ends (0 = disabled)
  auto_reset_seconds: 0,

  // ----------------------------------------------------------------------------
  // PLAYERS
  // ----------------------------------------------------------------------------
  // Each player entry:
  //   id          - Unique player number shown on screen
  //   name        - Display name
  //   target_ids  - List of target IDs whose hits count for this player
  //                 Use ["*"] to count all targets for every player
  // ----------------------------------------------------------------------------
  // Player colors — match SmartDisplay colors:
  //   Yellow: #FFE000  |  Green: #00E000  |  Blue: #00BFFF  |  Orange: #FF6000
  players: [
    {
      id: 1,
      name: "Player 1",
      color: "#FFE000",
      target_ids: ["*"],
    },
 /* {
      id: 2,
      name: "Player 2",
      color: "#00BFFF",
      target_ids: ["*"],
    },
    {
      id: 3,
      name: "Player 3",
      color: "#FF6000",
      target_ids: ["*"],
    },*/

  ],

};
