// ==============================================================================
// SMART SCOREBOARD - MAIN LOGIC
// ==============================================================================

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------
const state = {};   // { playerId: { score, hits, shots } }

let ws = null;
let wsAuthDone = false;
let reconnectTimer = null;

// ----------------------------------------------------------------------------
// Init
// ----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  applyConfig();
  buildPlayerCards();
  resetScores();
  connectHA();
});

// ----------------------------------------------------------------------------
// Apply config to DOM
// ----------------------------------------------------------------------------
function applyConfig() {
  document.getElementById("title").textContent = CONFIG.title;
  document.getElementById("background").style.setProperty(
    "--bg-image", `url('${CONFIG.background}')`
  );
  document.getElementById("background").style.backgroundImage = `url('${CONFIG.background}')`;

  // Set grid columns and scaling class based on player count
  const grid = document.getElementById("players-grid");
  grid.style.gridTemplateColumns = `repeat(${CONFIG.players.length}, 1fr)`;
  grid.classList.add(`players-${CONFIG.players.length}`);
}

// ----------------------------------------------------------------------------
// Build player cards
// ----------------------------------------------------------------------------
function buildPlayerCards() {
  const grid = document.getElementById("players-grid");
  grid.innerHTML = "";

  CONFIG.players.forEach(player => {
    const card = document.createElement("div");
    card.className = "player-card";
    card.id = `player-${player.id}`;
    card.style.setProperty("--player-color", player.color || "#FFE000");

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name;

    const score = document.createElement("div");
    score.className = "player-score";
    score.id = `score-${player.id}`;
    score.textContent = "0";

    card.appendChild(name);
    card.appendChild(score);

    // Stats row — only in score_hits or score_shots_hits mode
    if (CONFIG.display_mode === "score_hits" || CONFIG.display_mode === "score_shots_hits") {
      const stats = document.createElement("div");
      stats.className = "player-stats";

      if (CONFIG.display_mode === "score_shots_hits") {
        stats.appendChild(makeStatBlock(`shots-${player.id}`, "Shots"));
      }
      stats.appendChild(makeStatBlock(`hits-${player.id}`, "Hits"));

      card.appendChild(stats);
    }

    grid.appendChild(card);
  });
}

function makeStatBlock(id, label) {
  const block = document.createElement("div");
  block.className = "stat-block";

  const value = document.createElement("div");
  value.className = "stat-value";
  value.id = id;
  value.textContent = "0";

  const lbl = document.createElement("div");
  lbl.className = "stat-label";
  lbl.textContent = label;

  block.appendChild(value);
  block.appendChild(lbl);
  return block;
}

// ----------------------------------------------------------------------------
// Reset scores
// ----------------------------------------------------------------------------
function resetScores() {
  CONFIG.players.forEach(player => {
    state[player.id] = { score: 0, hits: 0, shots: 0 };
    updateCard(player.id);
  });
}

// ----------------------------------------------------------------------------
// Update a player card from state
// ----------------------------------------------------------------------------
function updateCard(playerId) {
  const s = state[playerId];
  if (!s) return;

  const scoreEl = document.getElementById(`score-${playerId}`);
  if (scoreEl) scoreEl.textContent = s.score;

  const hitsEl = document.getElementById(`hits-${playerId}`);
  if (hitsEl) hitsEl.textContent = s.hits;

  const shotsEl = document.getElementById(`shots-${playerId}`);
  if (shotsEl) shotsEl.textContent = s.shots;
}

// ----------------------------------------------------------------------------
// Flash a player card on hit
// ----------------------------------------------------------------------------
function flashCard(playerId) {
  const card = document.getElementById(`player-${playerId}`);
  if (!card) return;
  card.classList.add("hit-flash");
  setTimeout(() => card.classList.remove("hit-flash"), 600);
}

// ----------------------------------------------------------------------------
// Process a target hit event from HA
// ----------------------------------------------------------------------------
function processHit(eventData) {
  const targetId = String(eventData.address);
  const points   = parseInt(eventData.points) || 0;

  CONFIG.players.forEach(player => {
    const targets = player.target_ids;
    const matches = targets.includes("*") || targets.includes(targetId);
    if (!matches) return;

    state[player.id].score += points;
    state[player.id].hits  += 1;

    updateCard(player.id);
    flashCard(player.id);
  });
}

function processShot(eventData) {
  const gunId = String(eventData.gun_id);

  CONFIG.players.forEach(player => {
    if (String(player.id) !== gunId) return;

    state[player.id].shots += 1;
    updateCard(player.id);
  });
}

// ----------------------------------------------------------------------------
// Home Assistant WebSocket connection
// ----------------------------------------------------------------------------
function connectHA() {
  if (ws) ws.close();

  const wsUrl = CONFIG.ha_url.replace(/^http/, "ws") + "/api/websocket";
  ws = new WebSocket(wsUrl);
  wsAuthDone = false;

  ws.onopen = () => {
    console.log("HA WebSocket connected");
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    // Auth handshake
    if (data.type === "auth_required") {
      ws.send(JSON.stringify({ type: "auth", access_token: CONFIG.ha_token }));
      return;
    }

    if (data.type === "auth_ok") {
      wsAuthDone = true;
      setConnectionStatus(true);
      // Subscribe to target hit events
      ws.send(JSON.stringify({
        id: 1,
        type: "subscribe_events",
        event_type: "esphome.target-hit",
      }));
      // Subscribe to gun fired events (for shot count)
      ws.send(JSON.stringify({
        id: 2,
        type: "subscribe_events",
        event_type: "esphome.gun_fired",
      }));
      // Subscribe to state changes (for game start/reset)
      ws.send(JSON.stringify({
        id: 3,
        type: "subscribe_events",
        event_type: "state_changed",
      }));
      return;
    }

    if (data.type === "auth_invalid") {
      console.error("HA auth failed — check ha_token in config.js");
      setConnectionStatus(false);
      return;
    }

    // Incoming event
    if (data.type === "event" && data.event?.event_type === "esphome.target-hit") {
      processHit(data.event.data);
    }

    if (data.type === "event" && data.event?.event_type === "esphome.gun_fired") {
      processShot(data.event.data);
    }

    // Reset player score when their game starts
    if (data.type === "event" && data.event?.event_type === "state_changed") {
      const entityId = data.event.data?.entity_id;
      const newState = data.event.data?.new_state?.state;
      CONFIG.players.forEach(player => {
        if (entityId === `input_boolean.player_${player.id}_active` && newState === "on") {
          state[player.id] = { score: 0, hits: 0, shots: 0 };
          updateCard(player.id);
        }
      });
    }
  };

  ws.onclose = () => {
    setConnectionStatus(false);
    console.log("HA WebSocket disconnected — reconnecting in 5s");
    reconnectTimer = setTimeout(connectHA, 5000);
  };

  ws.onerror = (err) => {
    console.error("HA WebSocket error", err);
    setConnectionStatus(false);
  };
}

function setConnectionStatus(connected) {
  const dot = document.getElementById("connection-status");
  dot.className = `status-dot ${connected ? "connected" : "disconnected"}`;
}
