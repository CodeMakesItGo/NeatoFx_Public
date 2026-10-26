/**
 * NeatoFx Audio 50 — Custom Web Interface
 *
 * Replaces the default ESPHome web UI with an audio-specific dashboard.
 * Communicates via ESPHome REST API and Server-Sent Events (/events).
 * Self-contained — no external dependencies, works in AP standalone mode.
 * Firmware updates are installed from this page too (Firmware Update card,
 * POST /update) — the default ESPHome UI is not needed for anything.
 */
(function () {
  'use strict';

  console.log('[NEATO-UI] script loaded');

  const DEVICE_NAME = document.title || 'NeatoFx Audio';
  const WEBSITE_URL = 'https://neatofx.com';

  // Entity type tags (must equal the ESPHome domain used in REST/SSE paths)
  const SW = 'switch', NUM = 'number', SEL = 'select', LT = 'light',
        BTN = 'button', TXT = 'text_sensor', SENS = 'sensor', BIN = 'binary_sensor';

  // Shared option lists (order is display-only; the value set is the string)
  const OUTPUTS     = ['None', 'Relay 1', 'Relay 2', 'PWR 1', 'PWR 2'];
  const PWR_OUTPUTS = ['None', 'PWR 1', 'PWR 2'];
  const PWR_EFFECTS = ['Fade', 'Strobe', 'Lightning'];

  // ── Entity registry ────────────────────────────────────────────────────────
  // Keys are internal-only DOM ids. `name` is the exact YAML `name:` — REST URLs
  // use it (object-ID URLs are removed in ESPHome 2026.7) and SSE name_id
  // matching uses it. `type` MUST equal the ESPHome domain so the SSE
  // "{domain}/{name}" and the DOM data-eid ("{type}-{key}") line up.
  //   ESPHome REST API: /{domain}/{name}/{action}
  //   ESPHome SSE:      {"name_id": "{domain}/[{device}/]{name}", "state": ..., "value": ...}
  // `auto: true` rows start hidden and appear when the entity reports a state.
  // The RFTX / RF entities no longer need it: they exist in every build, and
  // their cards follow the "RFTX Mode" select instead (see applyState).
  const ENTITIES = {
    // ── Device identity (one binary for every unit; see the card note) ──
    device_id:   { type: NUM, name: 'Device ID', label: 'Device ID', min: 0, max: 99, step: 1, box: true,
                   hint: '0 = unassigned', section: 'setup' },

    // ── Audio Control ──
    volume:      { type: NUM, name: 'DFPlayer Volume',  label: 'Volume', min: 0, max: 30, step: 1, section: 'audio' },
    max_mp3:     { type: NUM, name: 'Max MP3 Files',    label: 'Max MP3 Files', min: 1, max: 255, step: 1, box: true,
                   hint: 'Highest file # used by Sequential mode', section: 'audio' },
    pb_timeout:  { type: NUM, name: 'Playback Timeout', label: 'Playback Timeout', min: 5, max: 300, step: 5, box: true,
                   hint: 'Seconds before a stuck DFPlayer is reset', section: 'audio' },

    // ── Background Loop ──
    bg_enable: { type: SW,  name: 'Background Loop Enable', label: 'Loop Enable', section: 'bg' },
    bg_mp3:    { type: NUM, name: 'Background Loop MP3',    label: 'Loop MP3 #', min: 1, max: 255, step: 1, box: true, section: 'bg' },
    bg_fet:    { type: SEL, name: 'BG Loop PWR Output',     label: 'PWR Output', options: PWR_OUTPUTS, section: 'bg' },
    bg_effect: { type: SEL, name: 'BG Loop PWR Effect',     label: 'PWR Effect', options: PWR_EFFECTS, section: 'bg' },

    // ── Input 1 (collapsible) ──
    in1_mp3:   { type: NUM, name: 'Input 1 MP3',          label: 'MP3 #', min: 0, max: 255, step: 1, box: true,
                 hint: '0 = play nothing', section: 'in1' },
    in1_seq:   { type: SW,  name: 'Input 1 Sequential',   label: 'Sequential Mode',
                 hint: 'Play next file in order instead of MP3 #', section: 'in1' },
    in1_out:   { type: SEL, name: 'Input 1 Output',       label: 'Output', options: OUTPUTS, section: 'in1' },
    in1_timer: { type: NUM, name: 'Input 1 Output Timer', label: 'Output Timer (ms)', min: 0, max: 5000, step: 100, box: true,
                 hint: '0 = on for song duration', section: 'in1' },

    // ── Input 2 (collapsible) ──
    in2_mp3:   { type: NUM, name: 'Input 2 MP3',          label: 'MP3 #', min: 0, max: 255, step: 1, box: true,
                 hint: '0 = play nothing', section: 'in2' },
    in2_seq:   { type: SW,  name: 'Input 2 Sequential',   label: 'Sequential Mode',
                 hint: 'Play next file in order instead of MP3 #', section: 'in2' },
    in2_out:   { type: SEL, name: 'Input 2 Output',       label: 'Output', options: OUTPUTS, section: 'in2' },
    in2_timer: { type: NUM, name: 'Input 2 Output Timer', label: 'Output Timer (ms)', min: 0, max: 5000, step: 100, box: true,
                 hint: '0 = on for song duration', section: 'in2' },

    // ── RFTX Connector (collapsible) — mode + transmitter power ──
    rftx_mode: { type: SEL, name: 'RFTX Mode', label: 'RFTX Mode', options: ['Off', 'Inputs', 'Outputs'],
                 hint: 'Inputs = 4 trigger inputs (Aux 1-4). Outputs = RF transmitter (RF TX A-D). Off = unused',
                 section: 'rftxconn' },
    rf_power:  { type: SW,  name: 'RF TX Power', label: 'RF TX Power', hint: 'Transmitter supply on the connector', section: 'rftxconn' },

    // ── Aux Inputs (collapsible) — shown only when RFTX Mode = Inputs ──
    // The RFTX connector as 4 trigger inputs (RFTX0-3).
    aux1_mp3:  { type: NUM, name: 'Aux 1 MP3',          label: 'Aux 1 MP3 #', min: 0, max: 255, step: 1, box: true,
                 hint: '0 = play nothing', section: 'aux' },
    aux1_seq:  { type: SW,  name: 'Aux 1 Sequential',   label: 'Aux 1 Sequential', section: 'aux' },
    aux1_out:  { type: SEL, name: 'Aux 1 Output',       label: 'Aux 1 Output', options: OUTPUTS, section: 'aux' },
    aux1_test: { type: BTN, name: 'Test Aux 1 (RFTX0)', label: 'Test Aux 1', btnText: 'Trigger', section: 'aux' },
    aux2_mp3:  { type: NUM, name: 'Aux 2 MP3',          label: 'Aux 2 MP3 #', min: 0, max: 255, step: 1, box: true,
                 hint: '0 = play nothing', section: 'aux' },
    aux2_seq:  { type: SW,  name: 'Aux 2 Sequential',   label: 'Aux 2 Sequential', section: 'aux' },
    aux2_out:  { type: SEL, name: 'Aux 2 Output',       label: 'Aux 2 Output', options: OUTPUTS, section: 'aux' },
    aux2_test: { type: BTN, name: 'Test Aux 2 (RFTX1)', label: 'Test Aux 2', btnText: 'Trigger', section: 'aux' },
    aux3_mp3:  { type: NUM, name: 'Aux 3 MP3',          label: 'Aux 3 MP3 #', min: 0, max: 255, step: 1, box: true,
                 hint: '0 = play nothing', section: 'aux' },
    aux3_seq:  { type: SW,  name: 'Aux 3 Sequential',   label: 'Aux 3 Sequential', section: 'aux' },
    aux3_out:  { type: SEL, name: 'Aux 3 Output',       label: 'Aux 3 Output', options: OUTPUTS, section: 'aux' },
    aux3_test: { type: BTN, name: 'Test Aux 3 (RFTX2)', label: 'Test Aux 3', btnText: 'Trigger', section: 'aux' },
    aux4_mp3:  { type: NUM, name: 'Aux 4 MP3',          label: 'Aux 4 MP3 #', min: 0, max: 255, step: 1, box: true,
                 hint: '0 = play nothing', section: 'aux' },
    aux4_seq:  { type: SW,  name: 'Aux 4 Sequential',   label: 'Aux 4 Sequential', section: 'aux' },
    aux4_out:  { type: SEL, name: 'Aux 4 Output',       label: 'Aux 4 Output', options: OUTPUTS, section: 'aux' },
    aux4_test: { type: BTN, name: 'Test Aux 4 (RFTX3)', label: 'Test Aux 4', btnText: 'Trigger', section: 'aux' },

    // ── Outputs (collapsible) ──
    relay1:       { type: SW,  name: 'Relay 1', label: 'Relay 1', section: 'out' },
    relay2:       { type: SW,  name: 'Relay 2', label: 'Relay 2', section: 'out' },
    spot1_bright: { type: NUM, name: 'SpotLight 1 Trigger Brightness', label: 'SpotLight 1 Brightness',
                    min: 0, max: 100, step: 5, unit: '%', section: 'out' },
    spot2_bright: { type: NUM, name: 'SpotLight 2 Trigger Brightness', label: 'SpotLight 2 Brightness',
                    min: 0, max: 100, step: 5, unit: '%', section: 'out' },

    // ── RF Receiver (collapsible) — independent of the RFTX connector ──
    // What an RF remote button does: which MP3 plays and which output fires.
    // With RF Receiver Enabled off, the card shows only that switch.
    rf_rx_enabled: { type: SW, name: 'RF Receiver Enabled', label: 'RF Receiver Enabled',
                     hint: 'Off if no RF receiver is plugged in', section: 'rf' },
    rf_a_mp3: { type: NUM, name: 'RF A MP3',       label: 'RF A MP3 #', min: 0, max: 255, step: 1, box: true, section: 'rf' },
    rf_a_seq: { type: SW,  name: 'RF A Sequential', label: 'RF A Sequential', section: 'rf' },
    rf_a_out: { type: SEL, name: 'RF A Output',    label: 'RF A Output', options: OUTPUTS, section: 'rf' },
    rf_b_mp3: { type: NUM, name: 'RF B MP3',       label: 'RF B MP3 #', min: 0, max: 255, step: 1, box: true, section: 'rf' },
    rf_b_seq: { type: SW,  name: 'RF B Sequential', label: 'RF B Sequential', section: 'rf' },
    rf_b_out: { type: SEL, name: 'RF B Output',    label: 'RF B Output', options: OUTPUTS, section: 'rf' },
    rf_c_mp3: { type: NUM, name: 'RF C MP3',       label: 'RF C MP3 #', min: 0, max: 255, step: 1, box: true, section: 'rf' },
    rf_c_seq: { type: SW,  name: 'RF C Sequential', label: 'RF C Sequential', section: 'rf' },
    rf_c_out: { type: SEL, name: 'RF C Output',    label: 'RF C Output', options: OUTPUTS, section: 'rf' },
    rf_d_mp3: { type: NUM, name: 'RF D MP3',       label: 'RF D MP3 #', min: 0, max: 255, step: 1, box: true, section: 'rf' },
    rf_d_seq: { type: SW,  name: 'RF D Sequential', label: 'RF D Sequential', section: 'rf' },
    rf_d_out: { type: SEL, name: 'RF D Output',    label: 'RF D Output', options: OUTPUTS, section: 'rf' },

    // ── RF Transmitter (collapsible) — shown only when RFTX Mode = Outputs ──
    // Each channel switch fires a 100ms momentary pulse (the YAML turns it back off).
    rf_tx_a:  { type: SW,  name: 'RF TX A',        label: 'RF TX A (pulse)', section: 'rftx' },
    rf_tx_b:  { type: SW,  name: 'RF TX B',        label: 'RF TX B (pulse)', section: 'rftx' },
    rf_tx_c:  { type: SW,  name: 'RF TX C',        label: 'RF TX C (pulse)', section: 'rftx' },
    rf_tx_d:  { type: SW,  name: 'RF TX D',        label: 'RF TX D (pulse)', section: 'rftx' },

    // ── Testing (collapsible) ──
    test_in1:   { type: BTN, name: 'Test Input 1',     label: 'Test Input 1',     btnText: 'Trigger', section: 'test' },
    test_in2:   { type: BTN, name: 'Test Input 2',     label: 'Test Input 2',     btnText: 'Trigger', section: 'test' },
    test_spot1: { type: SW,  name: 'Test SpotLight 1', label: 'Test SpotLight 1', section: 'test' },
    test_spot2: { type: SW,  name: 'Test SpotLight 2', label: 'Test SpotLight 2', section: 'test' },

    // ── Diagnostics (collapsible) — read-only, except Log Level ──
    log_level:   { type: SEL,  name: 'Log Level', label: 'Log Level',
                   options: ['NONE', 'ERROR', 'WARN', 'INFO', 'CONFIG', 'DEBUG'],
                   hint: 'WARN = normal. INFO / DEBUG to troubleshoot (Device Log below); back to WARN on restart',
                   section: 'debug' },
    in1_state:   { type: BIN,  name: 'Input 1',              label: 'Input 1',       section: 'debug' },
    in2_state:   { type: BIN,  name: 'Input 2',              label: 'Input 2',       section: 'debug' },
    push_button: { type: BIN,  name: 'Push Button',          label: 'Push Button',   section: 'debug' },
    // Live RF receiver pin state (GPIO36/2/15/35). ON while a remote button is
    // held. A channel stuck ON with no remote pressed is a floating/mis-driven
    // pin — it will never fire on_press again, since there is no edge left.
    rx_a_state:  { type: BIN,  name: 'Remote BtnA',          label: 'RF RX A',       auto: true, section: 'debug' },
    rx_b_state:  { type: BIN,  name: 'Remote BtnB',          label: 'RF RX B',       auto: true, section: 'debug' },
    rx_c_state:  { type: BIN,  name: 'Remote BtnC',          label: 'RF RX C',       auto: true, section: 'debug' },
    rx_d_state:  { type: BIN,  name: 'Remote BtnD',          label: 'RF RX D',       auto: true, section: 'debug' },
    wifi_ssid:   { type: TXT,  name: 'WiFi SSID',            label: 'WiFi SSID',     section: 'debug' },
    wifi_ip:     { type: TXT,  name: 'WiFi IP Address',      label: 'IP Address',    section: 'debug' },
    wifi_mac:    { type: TXT,  name: 'WiFi MAC Address',     label: 'MAC',           section: 'debug' },
    wifi_signal: { type: SENS, name: 'WiFi Signal Strength', label: 'WiFi Signal',   section: 'debug' },
    uptime:      { type: SENS, name: 'Uptime Sensor',        label: 'Uptime', fmt: 'uptime', section: 'debug' },

    // ── Reset (collapsible, bottom) ──
    restart:       { type: BTN, name: 'Restart Device', label: 'Restart',       btnText: 'Restart',
                     confirm: 'Restart the device?', section: 'reset' },
    wifi_reset:    { type: BTN, name: 'WiFi Reset',     label: 'Reset WiFi',    btnText: 'Reset', danger: true,
                     confirm: 'Clear saved WiFi credentials and reboot into setup (AP) mode?', section: 'reset' },
    factory_reset: { type: BTN, name: 'Factory Reset',  label: 'Factory Reset', btnText: 'Erase', danger: true,
                     confirm: 'ERASE all settings and WiFi credentials? The device reboots to defaults.', section: 'reset' },
  };

  // Reverse lookup: entity name → registry key (for SSE name_id matching)
  const NAME_TO_KEY = {};
  Object.keys(ENTITIES).forEach(function (k) { NAME_TO_KEY[ENTITIES[k].name] = k; });

  // ── API helpers ────────────────────────────────────────────────────────────
  const post = (url) => fetch(url, { method: 'POST' }).catch(() => {});

  // Entity-name URL path: /{domain}/{name}/... (name is URL-encoded)
  const path = (domain, key) => '/' + domain + '/' + encodeURIComponent(ENTITIES[key].name);

  const api = {
    switchOn:  (id)    => post(path(SW, id) + '/turn_on'),
    switchOff: (id)    => post(path(SW, id) + '/turn_off'),
    lightOn:   (id)    => post(path(LT, id) + '/turn_on'),
    lightOff:  (id)    => post(path(LT, id) + '/turn_off'),
    numSet:    (id, v) => post(path(NUM, id) + '/set?value=' + encodeURIComponent(v)),
    selSet:    (id, v) => post(path(SEL, id) + '/set?option=' + encodeURIComponent(v)),
    btnPress:  (id)    => post(path(BTN, id) + '/press'),
    playNext:  ()      => post('/button/' + encodeURIComponent('Test Play Next MP3') + '/press'),
  };

  // ── Value formatters ─────────────────────────────────────────────────────────
  function fmt(unit, val) {
    var v = parseFloat(val);
    if (isNaN(v)) return '–';
    if (unit === 'ms' && v >= 1000) {
      var s = v / 1000;
      return (s === Math.floor(s) ? s.toFixed(0) : s.toFixed(1)) + 's';
    }
    return v + (unit ? ' ' + unit : '');
  }

  function fmtUptime(val) {
    var v = parseInt(val, 10);
    if (isNaN(v)) return '–';
    var d = Math.floor(v / 86400), h = Math.floor((v % 86400) / 3600),
        m = Math.floor((v % 3600) / 60), s = v % 60;
    var out = [];
    if (d) out.push(d + 'd');
    if (h || d) out.push(h + 'h');
    if (m || h || d) out.push(m + 'm');
    out.push(s + 's');
    return out.join(' ');
  }

  // ── SSE connection ─────────────────────────────────────────────────────────
  var es = null;
  var retryTimer = null;

  function connect() {
    es = new EventSource('/events');

    // Every log line the device prints at its current Log Level (web_server
    // forwards them over /events) — shown in Diagnostics › Device Log.
    es.addEventListener('log', function (ev) { addLogLine(ev.data); });
    es.addEventListener('state', function (ev) {
      try { applyState(JSON.parse(ev.data)); } catch (_) {}
    });

    es.onopen = function () {
      clearTimeout(retryTimer);
      setLive(true);
    };

    es.onerror = function () {
      setLive(false);
      es.close();
      retryTimer = setTimeout(connect, 3000);
    };
  }

  // Stop SSE (used while a firmware upload runs: it frees one of the device's
  // few HTTP sockets for the upload, and the stream would only error when the
  // device reboots)
  function disconnect() {
    clearTimeout(retryTimer);
    if (es) {
      es.onerror = null;
      es.close();
      es = null;
    }
  }

  // Sections that start hidden and appear when one of their entities reports a
  // state (the RF receiver / RF transmitter cards, which only exist in some
  // rftx_* builds). Keyed by section name. Filled by build().
  var autoCards = {};

  function reveal(card, cfg) {
    if (card.classList.contains('auto-hide')) card.classList.remove('auto-hide');
    var sec = autoCards[cfg && cfg.section];
    if (sec && sec.classList.contains('auto-hide')) sec.classList.remove('auto-hide');
  }

  // Apply an incoming SSE state update to the DOM.
  // Name-based format "{domain}/[{device}/]{name}" arrives as `name_id`
  // (2026.7-2026.8) or as `id` itself (2026.9+, where name_id was dropped).
  // Falls back to the legacy id format "{domain}-{object_id}".
  function applyState(data) {
    var type, objId;
    var nid = data.name_id || (data.id && String(data.id).indexOf('/') !== -1 ? data.id : null);

    if (nid) {
      var parts = String(nid).split('/');
      type = parts[0];
      var name = parts[parts.length - 1];
      if (name === 'Firmware Version') objId = 'fw_version';
      else                             objId = NAME_TO_KEY[name];
      if (!objId) return;
    } else if (data.id) {
      var dashIdx = data.id.indexOf('-');
      if (dashIdx === -1) return;
      type  = data.id.slice(0, dashIdx);
      objId = data.id.slice(dashIdx + 1);
    } else {
      return;
    }

    // Header readouts (not real cards)
    if (objId === 'device_id' && data.value != null) {
      var di = document.getElementById('dev-id');
      if (di) {
        var n = Math.round(data.value);
        di.textContent = n === 0 ? 'unassigned' : n;
        di.parentNode.classList.toggle('unset', n === 0);
      }
      // fall through so the editable card row updates too
    }
    if (objId === 'fw_version') {
      var fv = document.getElementById('fw-ver');
      if (fv && data.state) fv.textContent = data.state;
      return;
    }

    var card = document.querySelector('[data-eid="' + type + '-' + objId + '"]');
    if (!card) return;
    var cfg = ENTITIES[objId];
    if (cfg && cfg.auto) reveal(card, cfg);

    // Hero volume readout mirrors the DFPlayer Volume number
    if (objId === 'volume' && data.value != null) {
      var vv = document.getElementById('vol-val');
      if (vv) vv.textContent = Math.round(data.value);
    }

    if (type === 'switch' || type === 'light') {
      var on = data.value === true || data.state === 'ON';
      card.classList.toggle('on', on);
      // RF Receiver card collapses to its enable switch while the receiver is off.
      if (objId === 'rf_rx_enabled') {
        var rxCard = card.closest('.card');
        if (rxCard) rxCard.classList.toggle('rx-off', !on);
      }
    }

    // RFTX Mode decides which of the Aux Inputs / RF Transmitter cards shows.
    if (objId === 'rftx_mode' && data.state) {
      var appEl = document.querySelector('.app');
      if (appEl) appEl.dataset.rftx = data.state;
    }

    if (type === 'number') {
      var input = card.querySelector('input');
      var disp  = card.querySelector('.val');
      if (input && document.activeElement !== input) input.value = data.value;
      if (disp) disp.textContent = fmt(cfg && cfg.unit, data.value);
    }

    if (type === 'select') {
      var sel = card.querySelector('select');
      if (sel && document.activeElement !== sel) sel.value = data.state;
    }

    if (type === 'text_sensor' || type === 'sensor') {
      var ro = card.querySelector('.ro-val');
      if (ro) {
        if (cfg && cfg.fmt === 'uptime') ro.textContent = fmtUptime(data.value);
        else if (data.state != null && data.state !== '') ro.textContent = data.state;
        else if (data.value != null) ro.textContent = data.value;
        else ro.textContent = '–';
      }
    }

    if (type === 'binary_sensor') {
      var bon = data.value === true || data.state === 'ON';
      card.classList.toggle('on', bon);
      var bro = card.querySelector('.ro-val');
      if (bro) bro.textContent = bon ? 'ACTIVE' : 'IDLE';
    }
  }

  function setLive(on) {
    var dot = document.getElementById('live-dot');
    var txt = document.getElementById('live-txt');
    if (dot) {
      dot.style.background  = on ? '#25c0d9' : '#ef4444';
      dot.style.boxShadow   = on ? '0 0 8px #25c0d9' : 'none';
    }
    if (txt) txt.textContent = on ? 'Live' : 'Reconnecting…';
  }

  // ── Component builders ─────────────────────────────────────────────────────

  // Label with optional hint line beneath it
  function lblHtml(cfg) {
    return '<span class="lbl">' + cfg.label +
           (cfg.hint ? '<span class="hint">' + cfg.hint + '</span>' : '') +
           '</span>';
  }

  function makeToggle(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = cfg.type + '-' + id;
    div.innerHTML   =
      lblHtml(cfg) +
      '<div class="tgl" role="switch" aria-checked="false" tabindex="0">' +
        '<div class="tgl-thumb"></div>' +
      '</div>';
    var toggle = div.querySelector('.tgl');
    var action = cfg.type === LT
      ? function () { div.classList.contains('on') ? api.lightOff(id)  : api.lightOn(id);  }
      : function () { div.classList.contains('on') ? api.switchOff(id) : api.switchOn(id); };
    toggle.addEventListener('click', action);
    toggle.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') action();
    });
    return div;
  }

  function makeSlider(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'slider';
    div.dataset.eid = 'number-' + id;
    div.innerHTML   =
      '<div class="slider-hdr">' +
        lblHtml(cfg) +
        '<span class="val">–</span>' +
      '</div>' +
      '<input type="range" min="' + cfg.min + '" max="' + cfg.max + '" step="' + cfg.step + '"' +
             ' value="' + Math.round((cfg.min + cfg.max) / 2) + '">';
    var range = div.querySelector('input');
    var disp  = div.querySelector('.val');
    range.addEventListener('input',  function () { disp.textContent = fmt(cfg.unit, range.value); });
    range.addEventListener('change', function () { api.numSet(id, range.value); });
    return div;
  }

  // Compact numeric box (for wide ranges like MP3 #, where a slider is fiddly)
  function makeNumberBox(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = 'number-' + id;
    div.innerHTML   = lblHtml(cfg);
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'numbox';
    inp.min = cfg.min; inp.max = cfg.max; inp.step = cfg.step;
    inp.addEventListener('change', function () { api.numSet(id, inp.value); });
    div.appendChild(inp);
    return div;
  }

  function makeSelect(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = 'select-' + id;
    div.innerHTML   = lblHtml(cfg);
    var sel = document.createElement('select');
    cfg.options.forEach(function (opt) { sel.add(new Option(opt, opt)); });
    sel.addEventListener('change', function () { api.selSet(id, sel.value); });
    div.appendChild(sel);
    return div;
  }

  function makeButton(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = 'button-' + id;
    div.innerHTML   = lblHtml(cfg);
    var b = document.createElement('button');
    b.className   = 'act-btn' + (cfg.danger ? ' danger' : '');
    b.textContent = cfg.btnText || 'Run';
    b.addEventListener('click', function () {
      if (cfg.confirm && !window.confirm(cfg.confirm)) return;
      api.btnPress(id);
    });
    div.appendChild(b);
    return div;
  }

  // Read-only value row (sensor / text_sensor / binary_sensor)
  function makeReadout(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row ro';
    div.dataset.eid = cfg.type + '-' + id;
    div.innerHTML   =
      lblHtml(cfg) +
      '<span class="ro-val">–</span>';
    return div;
  }

  function makeItem(id, cfg) {
    var el;
    switch (cfg.type) {
      case NUM:  el = cfg.box ? makeNumberBox(id, cfg) : makeSlider(id, cfg); break;
      case SEL:  el = makeSelect(id, cfg);  break;
      case SW:
      case LT:   el = makeToggle(id, cfg);  break;
      case BTN:  el = makeButton(id, cfg);  break;
      case SENS:
      case TXT:
      case BIN:  el = makeReadout(id, cfg); break;
      default:   el = document.createElement('div');
    }
    if (cfg.auto) el.classList.add('auto-hide');
    return el;
  }

  // Items belonging to a section, in registry order, built by type
  function sectionItems(section) {
    return Object.keys(ENTITIES)
      .filter(function (k) { return ENTITIES[k].section === section; })
      .map(function (k) { return makeItem(k, ENTITIES[k]); });
  }

  // A short explanatory paragraph, used above the Device ID control.
  function makeNote(html) {
    var d = document.createElement('div');
    d.className = 'note';
    d.innerHTML = html;
    return d;
  }

  const DEVICE_ID_NOTE =
    'Every unit ships with the same firmware, so this number — not the factory — ' +
    'is what tells the system which unit this is. Home Assistant and the other ' +
    'NeatoFx devices use it to address this one. Change it when you swap this unit ' +
    'in for another: set the replacement to the same number and it takes over that ' +
    'role, with no reflashing. ' +
    '<b>0 means unassigned</b> — the unit still works, but reports as device 0 so a ' +
    'forgotten ID shows up plainly instead of quietly clashing with another unit. ' +
    'Changing this restarts the device.';

  function makeCard(title, items) {
    var card = document.createElement('div');
    card.className = 'card';
    if (title) {
      var ttl = document.createElement('div');
      ttl.className   = 'card-ttl';
      ttl.textContent = title;
      card.appendChild(ttl);
    }
    items.forEach(function (item) { card.appendChild(item); });
    return card;
  }

  // Collapsible card (hidden until its header is tapped)
  function makeCollapsible(title, items) {
    var card = document.createElement('div');
    card.className = 'card';

    var btn = document.createElement('div');
    btn.className = 'adv-btn';
    btn.innerHTML = '<span class="chev">▾</span> ' + title;

    var body = document.createElement('div');
    body.className = 'adv-body';
    body.appendChild(makeCard(null, items));

    btn.addEventListener('click', function () {
      var open = body.classList.toggle('open');
      btn.classList.toggle('adv-open', open);
    });
    card.appendChild(btn);
    card.appendChild(body);
    return card;
  }

  // ── Device log ─────────────────────────────────────────────────────────────
  // The web server streams each log line as an SSE "log" event, in every
  // network mode and with no internet — so troubleshooting needs neither USB
  // nor `esphome logs`. Lines are what the device prints at its current Log
  // Level (WARN by default, so normally quiet); there is no history from
  // before the page connected. Only the last LOG_MAX lines are kept, and the
  // DOM is touched only while the Diagnostics card is open, so a busy DEBUG stream
  // costs a phone very little until someone looks at it.
  var LOG_MAX = 300;
  var logLines = [], logPaused = false, logBox = null, logDirty = false;

  function addLogLine(raw) {
    // Strip ANSI color codes; ESPHome lines look like "[W][tag:123]: message".
    var text = String(raw).replace(/\x1b\[[0-9;]*m/g, '');
    var m = text.match(/^\[([EWICDV])\]/);
    logLines.push({ lvl: m ? m[1] : '', text: text });
    if (logLines.length > LOG_MAX) logLines.shift();
    logDirty = true;   // drawn by the timer in makeLogView, at most 4x a second
  }

  function renderLog() {
    if (!logBox || logPaused || !logDirty || !logBox.offsetParent) return;  // hidden: render on open
    logDirty = false;
    var frag = document.createDocumentFragment();
    logLines.forEach(function (l) {
      var d = document.createElement('div');
      d.className = 'log-line' + (l.lvl ? ' log-' + l.lvl : '');
      d.textContent = l.text;
      frag.appendChild(d);
    });
    logBox.textContent = '';
    logBox.appendChild(frag);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function makeLogView() {
    var wrap = document.createElement('div');
    wrap.className = 'log-wrap';
    wrap.innerHTML =
      '<div class="row"><span class="lbl-wrap"><span class="lbl">Device Log</span>' +
        '<span class="note">Live log at the current Log Level (above). WARN shows only problems; pick INFO or DEBUG to see more. Starts empty — nothing from before this page opened.</span></span></div>' +
      '<div class="log-box"></div>' +
      '<div class="log-btns"><button class="act-btn log-pause">Pause</button>' +
        '<button class="act-btn log-clear">Clear</button></div>';
    logBox = wrap.querySelector('.log-box');
    var pauseBtn = wrap.querySelector('.log-pause');
    pauseBtn.addEventListener('click', function () {
      logPaused = !logPaused;
      pauseBtn.textContent = logPaused ? 'Resume' : 'Pause';
      if (!logPaused) { logDirty = true; renderLog(); }
    });
    wrap.querySelector('.log-clear').addEventListener('click', function () {
      logLines = []; logDirty = true; logBox.textContent = '';
    });
    // Redraw at most 4x a second (a DEBUG stream can be dozens of lines a
    // second), and catch up when the Diagnostics card is opened.
    setInterval(renderLog, 250);
    return wrap;
  }

  // ── Firmware update ────────────────────────────────────────────────────────
  // Uploads a .bin straight to the device's own OTA endpoint (POST /update,
  // provided by `ota: - platform: web_server`), so a firmware update needs no
  // internet and no default ESPHome UI. The same multipart field name ("update")
  // the default UI's form uses.
  //
  // The file is sanity-checked before anything is sent: an ESP32 app image
  // starts with the 0xE9 magic byte, and a *.factory.bin (bootloader +
  // partition table + app, for USB flashing) has the partition table magic
  // 0xAA 0x50 at 0x8000. Flashing a factory image over OTA fails on the device
  // anyway, but only after the whole upload; catching it here is instant.
  function makeFirmwareUpdate() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="note">Install a firmware file from this phone or computer — no internet needed. ' +
        'Use the OTA image (<b>firmware.ota.bin</b>, or the .bin from a NeatoFx release), not <b>*.factory.bin</b>. ' +
        'Settings and WiFi are kept. Keep this page open until the device restarts.</div>' +
      '<div class="row">' +
        '<input type="file" class="fw-file" accept=".bin,application/octet-stream">' +
        '<button class="act-btn" disabled>Install</button>' +
      '</div>' +
      '<div class="fw-bar"><div class="fw-fill"></div></div>' +
      '<div class="fw-msg"></div>';

    var input = wrap.querySelector('.fw-file');
    var btn   = wrap.querySelector('button');
    var fill  = wrap.querySelector('.fw-fill');
    var msg   = wrap.querySelector('.fw-msg');

    function say(text, cls) {
      msg.textContent = text;
      msg.className = 'fw-msg' + (cls ? ' ' + cls : '');
    }

    input.addEventListener('change', function () {
      fill.style.width = '0';
      var f = input.files[0];
      btn.disabled = !f;
      say(f ? f.name + ' — ' + Math.round(f.size / 1024) + ' KB' : '');
    });

    function checkImage(file) {
      return file.slice(0, 0x8002).arrayBuffer().then(function (buf) {
        var b = new Uint8Array(buf);
        if (b.length < 1 || b[0] !== 0xE9) return 'This is not an ESP32 firmware image.';
        if (b.length >= 0x8002 && b[0x8000] === 0xAA && b[0x8001] === 0x50)
          return 'This is a factory image (for USB flashing). Choose the .ota.bin instead.';
        return null;
      });
    }

    // After a successful upload the device reboots. Poll until it answers
    // again, then reload so the page reflects the new firmware.
    function waitForReboot() {
      var tries = 0;
      (function poll() {
        tries++;
        fetch('/', { cache: 'no-store' }).then(function (r) {
          if (r.ok) location.reload();
          else throw 0;
        }).catch(function () {
          if (tries < 60) setTimeout(poll, 2000);
          else say('Installed. The device has not come back yet — refresh this page in a moment.', 'ok');
        });
      })();
    }

    btn.addEventListener('click', function () {
      var file = input.files[0];
      if (!file) return;
      btn.disabled = true;
      checkImage(file).then(function (problem) {
        if (problem) { say(problem, 'err'); btn.disabled = false; return; }
        if (!window.confirm('Install ' + file.name + '? The device restarts when it finishes.')) {
          btn.disabled = false;
          return;
        }
        input.disabled = true;
        disconnect();
        setLive(false);

        var form = new FormData();
        form.append('update', file, file.name);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/update');
        xhr.upload.onprogress = function (e) {
          if (!e.lengthComputable) return;
          var pct = Math.round(e.loaded * 100 / e.total);
          fill.style.width = pct + '%';
          say(pct < 100 ? 'Uploading… ' + pct + '%' : 'Writing firmware…');
        };
        xhr.onload = function () {
          if (xhr.status === 200 && !/fail/i.test(xhr.responseText)) {
            fill.style.width = '100%';
            say('Installed. Restarting…', 'ok');
            setTimeout(waitForReboot, 4000);
          } else {
            fail('Update failed' + (xhr.responseText ? ': ' + xhr.responseText.trim() : ' (HTTP ' + xhr.status + ')'));
          }
        };
        xhr.onerror = function () { fail('Upload interrupted — check the connection and try again.'); };
        xhr.send(form);
      });
    });

    function fail(text) {
      say(text, 'err');
      fill.style.width = '0';
      input.disabled = false;
      btn.disabled = false;
      connect();
    }

    return wrap;
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  // All rules are scoped under .app so nothing leaks into the host page.
  var CSS = [
    '.app, .app *, .app *::before, .app *::after { box-sizing: border-box; margin: 0; padding: 0; }',

    /* Full-screen overlay — sits on top of ESPHome's Lit UI */
    '.app {',
    '  position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
    '  overflow-y: auto; -webkit-overflow-scrolling: touch;',
    '  background: #0d0d1a; color: #e0e0e0; z-index: 99999;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  font-size: 15px;',
    '}',
    '.app-inner {',
    '  max-width: 480px; margin: 0 auto;',
    '  padding: 12px 12px 40px; display: flex; flex-direction: column; gap: 10px;',
    '}',

    /* Header */
    '.hdr {',
    '  display: flex; align-items: center; justify-content: space-between; gap: 10px;',
    '  background: #1a1a2e; border: 1px solid #252540; border-radius: 14px;',
    '  padding: 12px 16px;',
    '}',
    '.hdr-l { min-width: 0; }',
    '.hdr-name { font-size: 1.05rem; font-weight: 700; color: #fff; }',
    '.hdr-sub  { font-size: 0.72rem; color: #666; margin-top: 3px; }',
    '.hdr-link { color: #25c0d9; text-decoration: none; }',
    '.hdr-link:hover { text-decoration: underline; }',
    '.hdr-ver  { font-size: 0.68rem; color: #4a4a68; margin-top: 3px; letter-spacing: .3px; }',
    '.hdr-id   { font-size: 0.72rem; color: #4a4a68; margin-top: 2px; letter-spacing: .3px; font-weight: 600; }',
    '.hdr-id.unset { color: #b45309; }',   /* amber while the ID is still 0 */
    '.note { font-size: 0.72rem; line-height: 1.45; color: #555; padding: 2px 2px 8px; }',
    '.note b { color: #b45309; }',
    '.live { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: #666; flex-shrink: 0; }',
    '#live-dot {',
    '  width: 8px; height: 8px; border-radius: 50%; background: #ef4444;',
    '  flex-shrink: 0; transition: background .3s, box-shadow .3s;',
    '}',

    /* Hero row — volume readout + Play Next MP3 test button */
    '.hero-row {',
    '  display: flex; align-items: center; gap: 14px;',
    '  background: #1a1a2e; border: 1px solid #252540; border-radius: 14px;',
    '  padding: 14px 16px;',
    '}',
    '.hero-info { flex: 0 0 auto; }',
    '.hero-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 2px; }',
    '#vol-val { font-size: 3rem; font-weight: 800; color: #25c0d9; line-height: 1; min-width: 56px; }',
    '.test-btn {',
    '  flex: 1; background: linear-gradient(135deg, #25c0d9 0%, #1c93a7 100%);',
    '  color: #101116; border: none; border-radius: 12px; padding: 20px 12px;',
    '  font-size: 1rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;',
    '  cursor: pointer; box-shadow: 0 4px 20px rgba(37,192,217,.3);',
    '  transition: transform .1s, box-shadow .1s; -webkit-tap-highlight-color: transparent;',
    '}',
    '.test-btn:active { transform: scale(.96); box-shadow: 0 2px 10px rgba(37,192,217,.15); }',

    /* Cards */
    '.card {',
    '  background: #1a1a2e; border: 1px solid #252540;',
    '  border-radius: 14px; overflow: hidden;',
    '}',
    '.card-ttl {',
    '  font-size: 0.65rem; font-weight: 700; text-transform: uppercase;',
    '  letter-spacing: 1.5px; color: #555; padding: 10px 16px 4px;',
    '}',

    /* RFTX mode cards: Aux Inputs only in Inputs mode, RF Transmitter only in
       Outputs mode (data-rftx on .app is set from the RFTX Mode select) */
    '.app:not([data-rftx="Inputs"]) .only-inputs { display: none; }',
    '.app:not([data-rftx="Outputs"]) .only-outputs { display: none; }',
    /* RF Receiver card: only its enable switch while the receiver is off */
    '.rx-off > [data-eid]:not([data-eid="switch-rf_rx_enabled"]) { display: none; }',
    /* Auto-hidden rows/sections */
    '.auto-hide { display: none !important; }',

    /* Toggle / row */
    '.row {',
    '  display: flex; align-items: center; justify-content: space-between; gap: 10px;',
    '  padding: 14px 16px; border-top: 1px solid #1e1e38;',
    '}',
    '.card-ttl + .row, .card-ttl + .slider { border-top: none; }',
    '.lbl { font-size: 0.95rem; color: #ccc; }',
    '.hint { display: block; font-size: 0.7rem; color: #555; margin-top: 2px; }',
    '.tgl {',
    '  width: 50px; height: 27px; background: #2a2a45; border-radius: 14px;',
    '  position: relative; cursor: pointer; flex-shrink: 0;',
    '  transition: background .2s; outline: none;',
    '}',
    '.row.on .tgl { background: #25c0d9; }',
    '.tgl-thumb {',
    '  width: 21px; height: 21px; background: #fff; border-radius: 50%;',
    '  position: absolute; top: 3px; left: 3px;',
    '  transition: transform .2s; box-shadow: 0 1px 4px rgba(0,0,0,.4);',
    '}',
    '.row.on .tgl-thumb { transform: translateX(23px); }',

    '.app select {',
    '  background: #12122a; color: #e0e0e0; border: 1px solid #2a2a45;',
    '  border-radius: 8px; padding: 7px 10px; font-size: 0.88rem;',
    '  cursor: pointer; outline: none; max-width: 185px;',
    '}',
    '.app input.numbox {',
    '  background: #12122a; color: #e0e0e0; border: 1px solid #2a2a45;',
    '  border-radius: 8px; padding: 7px 10px; font-size: 0.9rem;',
    '  width: 84px; text-align: right; outline: none;',
    '}',

    /* Read-only value rows (sensors) */
    '.ro-val { font-size: 0.9rem; font-weight: 600; color: #8a8ab0; text-align: right; word-break: break-all; }',
    '.ro.on .ro-val { color: #25c0d9; }',

    /* Action buttons (reset, etc.) */
    '.act-btn {',
    '  background: #2a2a45; color: #cfcfe6; border: 1px solid #33334f;',
    '  border-radius: 8px; padding: 7px 16px; font-size: 0.82rem; font-weight: 600;',
    '  cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent;',
    '  transition: background .15s;',
    '}',
    '.act-btn:active { background: #33334f; }',
    '.act-btn.danger { background: #3a1620; color: #ff7089; border-color: #5a2130; }',
    '.act-btn.danger:active { background: #4a1c29; }',

    /* Slider */
    '.slider { padding: 12px 16px 18px; border-top: 1px solid #1e1e38; }',
    '.slider-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }',
    '.val { font-size: 0.9rem; font-weight: 600; color: #25c0d9; }',
    '.app input[type=range] {',
    '  -webkit-appearance: none; appearance: none;',
    '  width: 100%; height: 4px; background: #2a2a45; border-radius: 2px;',
    '  outline: none; cursor: pointer;',
    '}',
    '.app input[type=range]::-webkit-slider-thumb {',
    '  -webkit-appearance: none;',
    '  width: 22px; height: 22px; background: #25c0d9; border-radius: 50%;',
    '  box-shadow: 0 0 0 3px rgba(37,192,217,.2);',
    '}',
    '.app input[type=range]::-moz-range-thumb {',
    '  width: 22px; height: 22px; background: #25c0d9;',
    '  border-radius: 50%; border: none;',
    '}',

    /* Collapsible cards */
    '.adv-btn {',
    '  display: flex; align-items: center; justify-content: center; gap: 6px;',
    '  padding: 12px; cursor: pointer; color: #555; font-size: 0.8rem;',
    '  user-select: none; transition: color .2s;',
    '  -webkit-tap-highlight-color: transparent;',
    '}',
    '.adv-btn:hover { color: #888; }',
    '.chev { display: inline-block; transition: transform .25s; line-height: 1; }',
    '.adv-body { display: none; }',
    '.adv-body.open { display: block; }',
    '.adv-open .chev { transform: rotate(180deg); }',

    /* Firmware update */
    '.fw-file { flex: 1; min-width: 0; color: #aaa; font-size: 0.8rem; }',
    '.fw-file::file-selector-button {',
    '  background: #252540; color: #e0e0e0; border: 0; border-radius: 6px;',
    '  padding: 6px 10px; margin-right: 8px; cursor: pointer;',
    '}',
    '.fw-bar { height: 6px; background: #252540; border-radius: 3px; overflow: hidden; margin: 6px 0; }',
    '.fw-fill { height: 100%; width: 0; background: #25c0d9; transition: width .2s; }',
    '.fw-msg { font-size: 0.8rem; color: #aaa; min-height: 1.2em; }',
    '.fw-msg.err { color: #ef4444; }',
    '.fw-msg.ok  { color: #25c0d9; }',

    /* Device log */
    '.log-box {',
    '  height: 240px; overflow-y: auto; background: #08080f; border: 1px solid #252540;',
    '  border-radius: 8px; padding: 6px 8px; margin: 4px 0 6px;',
    '  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.7rem; line-height: 1.35;',
    '}',
    '.log-line { white-space: pre-wrap; word-break: break-word; color: #9a9ab8; }',
    '.log-E { color: #ef4444; }',
    '.log-W { color: #fbbf24; }',
    '.log-I { color: #66e73a; }',
    '.log-C { color: #8a8ab0; }',
    '.log-D { color: #60a5fa; }',
    '.log-V { color: #6f6f92; }',
    '.log-btns { display: flex; gap: 8px; justify-content: flex-end; }',
  ].join('\n');

  // ── Build UI ───────────────────────────────────────────────────────────────
  function build() {
    console.log('[NEATO-UI] building DOM...');

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var app = document.createElement('div');
    app.className = 'app';

    var inner = document.createElement('div');
    inner.className = 'app-inner';
    app.appendChild(inner);

    // Header — brand, website link, live version readout, connection indicator
    var hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.innerHTML =
      '<div class="hdr-l">' +
        '<div class="hdr-name">' + DEVICE_NAME + '</div>' +
        '<div class="hdr-sub">' +
          '<a class="hdr-link" href="' + WEBSITE_URL + '" target="_blank" rel="noopener">neatofx.com</a>' +
        '</div>' +
        '<div class="hdr-ver">v<span id="fw-ver">–</span></div>' +
        '<div class="hdr-id">ID <span id="dev-id">–</span></div>' +
      '</div>' +
      '<div class="live">' +
        '<div id="live-dot"></div>' +
        '<span id="live-txt">Connecting…</span>' +
      '</div>';
    inner.appendChild(hdr);

    // Volume readout + Play Next MP3 test button
    var heroRow = document.createElement('div');
    heroRow.className = 'hero-row';
    heroRow.innerHTML =
      '<div class="hero-info">' +
        '<div class="hero-lbl">Volume</div>' +
        '<div id="vol-val">–</div>' +
      '</div>';
    var testBtn = document.createElement('button');
    testBtn.className   = 'test-btn';
    testBtn.textContent = '▶ Play Next MP3';
    testBtn.addEventListener('click', api.playNext);
    heroRow.appendChild(testBtn);
    inner.appendChild(heroRow);

    // Primary cards
    // Device identity first — it is the one thing that must be set on a new unit.
    inner.appendChild(makeCard('Device ID',
      [makeNote(DEVICE_ID_NOTE)].concat(sectionItems('setup'))));

    inner.appendChild(makeCard('Audio Control',   sectionItems('audio')));
    inner.appendChild(makeCard('Background Loop', sectionItems('bg')));

    // Collapsible cards
    inner.appendChild(makeCollapsible('Input 1',     sectionItems('in1')));
    inner.appendChild(makeCollapsible('Input 2',     sectionItems('in2')));
    // RFTX connector: mode + power, then the mode's own card (Aux Inputs for
    // Inputs, RF Transmitter for Outputs; neither for Off — see the CSS).
    inner.appendChild(makeCollapsible('RFTX Connector', sectionItems('rftxconn')));
    var auxCard = makeCollapsible('Aux Inputs (RFTX)', sectionItems('aux'));
    auxCard.classList.add('only-inputs');
    inner.appendChild(auxCard);
    inner.appendChild(makeCollapsible('Outputs',     sectionItems('out')));
    // The RF receiver is separate hardware from the RFTX connector: its own card.
    inner.appendChild(makeCollapsible('RF Receiver', sectionItems('rf')));
    var rfTxCard = makeCollapsible('RF Transmitter', sectionItems('rftx'));
    rfTxCard.classList.add('only-outputs');
    inner.appendChild(rfTxCard);
    inner.appendChild(makeCollapsible('Testing',     sectionItems('test')));
    inner.appendChild(makeCollapsible('Diagnostics', sectionItems('debug').concat([makeLogView()])));
    inner.appendChild(makeCollapsible('Reset',       sectionItems('reset')));

    inner.appendChild(makeCollapsible('Firmware Update', [makeFirmwareUpdate()]));

    document.body.appendChild(app);
    console.log('[NEATO-UI] DOM ready');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    build();
    connect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
