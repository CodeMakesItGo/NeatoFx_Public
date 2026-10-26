/**
 * NeatoFx Motor — Custom Web Interface
 *
 * Replaces the default ESPHome web UI with a motor-controller dashboard
 * (same layout as the Target IR / Audio 50 UIs, Motor red accent).
 * Communicates via ESPHome REST API and Server-Sent Events (/events).
 * Self-contained — no external dependencies, works in AP standalone mode.
 * Firmware updates are installed from this page too (Firmware Update card,
 * POST /update) — the default ESPHome UI is not needed for anything.
 */
(function () {
  'use strict';

  console.log('[NEATO-UI] script loaded');

  // Placeholder until the device reports its own name (the SSE "ping" event's
  // title = friendly_name: NeatoFx Motor 24V / Motor 12V). See showDeviceName().
  const DEVICE_NAME = 'NeatoFx Motor';
  const WEBSITE_URL = 'https://neatofx.com';

  // Entity type tags (must equal the ESPHome domain used in REST/SSE paths)
  // TXT is the read-only text_sensor domain; TXTIN is the editable text domain.
  const SW = 'switch', NUM = 'number', SEL = 'select', LT = 'light',
        BTN = 'button', TXT = 'text_sensor', SENS = 'sensor', BIN = 'binary_sensor',
        TXTIN = 'text';

  // Motor types (boards/common/drives.yaml). Rows carry `types` to show
  // only for the selected type; rows without it always show.
  const DC = 'DC Motor', AC = 'AC Controller', LIN = 'Linear Actuator', WINCH = 'Winch', PULSE = 'Pulse';
  const TYPES = [DC, AC, LIN, WINCH, PULSE];
  const RUNNING_TYPES = [DC, LIN, WINCH];      // use Motor Speed / Ramp to Speed
  const LIMIT_TYPES   = [DC, AC, LIN];         // SW1 / SW2 are limit switches

  // ── Entity registry ────────────────────────────────────────────────────────
  // Keys are internal-only DOM ids. `name` is the exact YAML `name:` — REST URLs
  // use it (object-ID URLs are removed in ESPHome 2026.7) and SSE name_id
  // matching uses it. `type` MUST equal the ESPHome domain so the SSE
  // "{domain}/{name}" and the DOM data-eid ("{type}-{key}") line up.
  //   ESPHome REST API: /{domain}/{name}/{action}
  //   ESPHome SSE:      {"name_id": "{domain}/[{device}/]{name}", "state": ..., "value": ...}
  const ENTITIES = {
    // ── Source Address (one binary for every unit; see the card note) ──
    device_id:   { type: NUM, name: 'Source Address', label: 'Source Address', min: 0, max: 238, step: 1, box: true,
                   section: 'setup' },

    // ── Motor Type ──
    motor_type:  { type: SEL, name: 'Motor Type', label: 'Motor Type', options: TYPES,
                   note: 'What is wired to Output A / B. DC Motor = hold to run, ramps to speed. AC Controller = grounds one input of a 240VAC controller. Linear Actuator = Input 1 runs a timed extend then retract. Winch = encoder on SW1/SW2 instead of limit switches, with soft limits. Pulse = Input 1 / 2 fire Output A / B for Pulse Time. Changing it stops the motor.',
                   section: 'mtype' },

    // ── Drive ──
    speed:       { type: NUM, name: 'Motor Speed', label: 'Motor Speed', min: 1, max: 100, step: 1, unit: '%',
                   note: 'PWM duty the motor ramps up to. For a winch this is the run speed outside the slow zones.',
                   types: RUNNING_TYPES, section: 'drive' },
    ramp:        { type: NUM, name: 'Ramp to Speed', label: 'Ramp to Speed', min: 0, max: 2000, step: 50, unit: 'ms',
                   note: 'Time to ramp from 0 to Motor Speed on every start. 0 = instant.',
                   types: RUNNING_TYPES, section: 'drive' },
    limits_nc:   { type: SW,  name: 'invert SW 1 & 2 Logic', label: 'Normally-Closed Limit Switches',
                   note: 'On for normally-closed limit switches, off for normally-open. Applies to SW1 and SW2.',
                   types: LIMIT_TYPES, section: 'drive' },
    max_current: { type: NUM, name: 'Max Current', label: 'Max Current', min: 4, max: 30, step: 2, unit: 'A',
                   note: 'Over-current trip point. The Winch type stops above it on any board; on the 24V board CAN also trips every type (and the game display can set it).',
                   section: 'drive' },

    // ── Linear Actuator ──
    la_mode:     { type: SEL, name: 'Linear Mode', label: 'Linear Mode', options: ['Cycle', 'Toggle'], types: [LIN], section: 'linear',
                   note: 'Cycle = Input 1 extends for Extend Time, then retracts for Retract Time; Input 2 cancels and jogs in reverse. Toggle (doors) = each Input 1 makes one move, alternating extend / retract, and the actuator stays put until the next Input 1; Input 2 stops a move. Either way a move ends at its time or its limit switch.' },
    la_extend:   { type: NUM, name: 'Extend Time',  label: 'Extend Time',  min: 1, max: 60, step: 1, unit: 's', types: [LIN], section: 'linear' },
    la_retract:  { type: NUM, name: 'Retract Time', label: 'Retract Time', min: 1, max: 60, step: 1, unit: 's', types: [LIN], section: 'linear' },
    la_run:      { type: BTN, name: 'Run Cycle',    label: 'Run (same as Input 1)', btnText: 'Run',    types: [LIN], section: 'linear' },
    la_cancel:   { type: BTN, name: 'Cancel Cycle', label: 'Cancel / Stop',         btnText: 'Cancel', types: [LIN], section: 'linear' },
    la_phase:    { type: TXT, name: 'Cycle Phase',  label: 'Cycle Phase',  types: [LIN], section: 'linear' },

    // ── Winch ──
    w_cable:     { type: SENS, name: 'Cable Out Length', label: 'Cable Out', types: [WINCH], section: 'winch' },
    w_set_home:  { type: BTN, name: 'Set Home Here', label: 'Set Home Here', btnText: 'Set', types: [WINCH], section: 'winch',
                   note: 'Jog the winch fully in, then press: this is position 0. Until home is set the winch runs at Slow Speed with no soft limits.' },
    w_max_in:    { type: NUM, name: 'Max Length (Input)', label: 'Measured Max Length', min: 1, max: 200, step: 1, unit: 'ft', box: true,
                   types: [WINCH], section: 'winch' },
    w_set_max:   { type: BTN, name: 'Set Max Length', label: 'Set Max Length', btnText: 'Save', types: [WINCH], section: 'winch',
                   note: 'After setting home: reel out to full length, measure the cable, enter it above and press Save. Reel-out then stops there.' },
    w_slow:      { type: NUM, name: 'Winch Slow Speed', label: 'Slow Speed', min: 5, max: 80, step: 5, unit: '%', types: [WINCH], section: 'winch',
                   note: 'Used within Slow Zone of either end, and before home is set.' },
    w_zone:      { type: NUM, name: 'Winch Slow Zone',  label: 'Slow Zone', min: 0, max: 100, step: 1, unit: 'counts', types: [WINCH], section: 'winch' },
    w_override:  { type: SW,  name: 'Limit Override', label: 'Limit Override',
                   note: 'Bypasses both soft limits — for recalibrating. Turns itself off at restart.', types: [WINCH], section: 'winch' },
    w_count:     { type: SENS, name: 'Encoder Count', label: 'Encoder Count', types: [WINCH], section: 'winch' },

    // ── Pulse ──
    p_time:      { type: NUM, name: 'Pulse Time', label: 'Pulse Time', min: 10, max: 1000, step: 10, unit: 'ms', types: [PULSE], section: 'pulse',
                   note: 'How long Output A / B stay on per Input 1 / Input 2 press. Releasing the input does not cut the pulse short.' },
    p_trig_a:    { type: BTN, name: 'Trigger A', label: 'Fire Output A', btnText: 'Fire', types: [PULSE], section: 'pulse' },
    p_trig_b:    { type: BTN, name: 'Trigger B', label: 'Fire Output B', btnText: 'Fire', types: [PULSE], section: 'pulse' },

    // ── Diagnostics (collapsible) — read-only, except Log Level ──
    log_level:   { type: SEL,  name: 'Log Level', label: 'Log Level',
                   options: ['NONE', 'ERROR', 'WARN', 'INFO', 'CONFIG', 'DEBUG'],
                   note: 'How much the device logs right now. WARN is normal. Pick INFO or DEBUG to troubleshoot and watch Device Log below; it returns to WARN on the next restart. DEBUG is very busy and can slow this page.',
                   section: 'debug' },
    tgl1:        { type: BIN,  name: 'TGL1', label: 'Input 1 (TGL1)', section: 'debug' },
    tgl2:        { type: BIN,  name: 'TGL2', label: 'Input 2 (TGL2)', section: 'debug' },
    sw1:         { type: BIN,  name: 'SW1',  label: 'SW1', section: 'debug' },
    sw2:         { type: BIN,  name: 'SW2',  label: 'SW2', section: 'debug' },
    cur_a:       { type: SENS, name: 'Output A current', label: 'Output A Current', section: 'debug' },
    cur_b:       { type: SENS, name: 'Output B current', label: 'Output B Current', section: 'debug' },
    wifi_ssid:   { type: TXT,  name: 'WiFi SSID',            label: 'WiFi SSID',   section: 'debug' },
    wifi_ip:     { type: TXT,  name: 'WiFi IP Address',      label: 'IP Address',  section: 'debug' },
    wifi_mac:    { type: TXT,  name: 'WiFi MAC Address',     label: 'MAC',         section: 'debug' },
    wifi_signal: { type: SENS, name: 'WiFi Signal Strength', label: 'WiFi Signal', section: 'debug' },
    uptime:      { type: SENS, name: 'Uptime',               label: 'Uptime', fmt: 'uptime', section: 'debug' },

    // ── Reset (collapsible, bottom) ──
    wifi_reset:    { type: BTN, name: 'WiFi Reset',    label: 'Reset WiFi',     btnText: 'Reset', danger: true,
                     confirm: 'Clear saved WiFi credentials and reboot into setup (AP) mode?', section: 'reset' },
    factory_reset: { type: BTN, name: 'Factory Reset', label: 'Factory Reset',  btnText: 'Erase', danger: true,
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
    // An entity may pin the state it turns on with via ENTITIES[id].onQuery
    // (e.g. GND Switch forces full duty — see the note on that entry). Without
    // it a bare turn_on restores the light's LAST brightness, which for a
    // PWM-backed output is not necessarily full.
    lightOn:   (id)    => post(path(LT, id) + '/turn_on' +
                               (ENTITIES[id].onQuery ? '?' + ENTITIES[id].onQuery : '')),
    lightOff:  (id)    => post(path(LT, id) + '/turn_off'),
    numSet:    (id, v) => post(path(NUM, id) + '/set?value=' + encodeURIComponent(v)),
    textSet:   (id, v) => post(path(TXTIN, id) + '/set?value=' + encodeURIComponent(v)),
    selSet:    (id, v) => post(path(SEL, id) + '/set?option=' + encodeURIComponent(v)),
    btnPress:  (id)    => post(path(BTN, id) + '/press'),
    // The "Motor" cover: open = Input 1 action, close = Input 2 action, stop.
    cover:     (act)   => post('/cover/' + encodeURIComponent('Motor') + '/' + act),
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
  var pruneTimer = null;

  function connect() {
    es = new EventSource('/events');

    es.addEventListener('state', function (ev) {
      try { applyState(JSON.parse(ev.data)); } catch (_) {}
    });
    // Sent once on connect with the device config; title is the friendly name.
    // Every log line the device prints at its current Log Level (web_server
    // forwards them over /events) — shown in Diagnostics › Device Log.
    es.addEventListener('log', function (ev) { addLogLine(ev.data); });
    es.addEventListener('ping', function (ev) {
      try { showDeviceName(JSON.parse(ev.data).title); } catch (_) {}
    });

    es.onopen = function () {
      clearTimeout(retryTimer);
      setLive(true);
      // ESPHome dumps all entity states right after the stream opens; give it a
      // generous window on a slow phone, then drop whatever never reported.
      if (!pruneTimer && !pruned) pruneTimer = setTimeout(pruneMissing, 2500);
    };

    es.onerror = function () {
      setLive(false);
      es.close();
      retryTimer = setTimeout(connect, 3000);
    };
  }

  // Header name from the device's friendly name. ESPHome appends the MAC suffix
  // (" a1b2c3") when name_add_mac_suffix is on — dropped here; the MAC is in
  // Debug and the Device ID is shown under the name.
  function showDeviceName(title) {
    if (!title) return;
    var name = String(title).replace(/[\s-][0-9a-f]{6}$/i, '');
    var el = document.getElementById('hdr-name');
    if (el) el.textContent = name;
    document.title = name;
  }

  // Stop SSE (used while a firmware upload runs: it frees one of the device's
  // few HTTP sockets for the upload, and the stream would only error when the
  // device reboots)
  function disconnect() {
    clearTimeout(retryTimer);
    clearTimeout(pruneTimer);
    if (es) {
      es.onerror = null;
      es.close();
      es = null;
    }
  }

  // ── Prune controls the firmware doesn't have ───────────────────────────────
  // This one registry drives every build, but the entities behind it are
  // config-dependent: for example the Max Current trip and the network sensors
  // differ between the 24V / 12V boards and the network modes. (Motor-type rows
  // are different: they always exist and are hidden by applyMotorType.) A control
  // with no entity behind it is worse than useless — tapping it POSTs to a
  // nonexistent path, gets a 404, and never changes state (it just looks broken).
  //
  // ESPHome's /events stream dumps EVERY registered entity on connect, so any
  // control that has received no state shortly after connecting does not exist
  // in this firmware. Hide those, then hide any card left with nothing in it.
  // A late-arriving state un-hides its row, so this can only fail toward showing.
  var seen = {}, pruned = false;

  function pruneMissing() {
    pruned = true;
    // A board with no Motor Type select (the single-input Rev 3.0 12V board)
    // is a fixed Linear Actuator: show its rows only.
    if (!seen.motor_type) applyMotorType(LIN);
    Object.keys(ENTITIES).forEach(function (k) {
      if (seen[k]) return;
      var el = document.querySelector('[data-eid="' + ENTITIES[k].type + '-' + k + '"]');
      if (el) el.classList.add('absent');
    });
    // Hide cards whose every control was pruned
    Array.prototype.forEach.call(document.querySelectorAll('.app .card'), function (card) {
      var items = card.querySelectorAll('[data-eid]');
      if (!items.length) return;
      var allGone = Array.prototype.every.call(items, function (i) {
        return i.classList.contains('absent');
      });
      card.classList.toggle('absent', allGone);
    });
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
      if (name === 'Motor Status')          objId = 'motor_status';
      else if (name === 'Firmware Version') objId = 'fw_version';
      else                                  objId = NAME_TO_KEY[name];
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
    if (objId === 'motor_status') {
      var ms = document.getElementById('m-status');
      if (ms && data.state != null) ms.textContent = data.state;
      return;
    }
    if (objId === 'motor_type' && data.state) applyMotorType(data.state);
    if (objId === 'la_mode' && data.state) { curLinMode = data.state; applyMotorType(curType); }
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

    // This entity exists in the firmware — remember it for pruneMissing, and
    // un-hide it (and its card) if a state somehow arrived after the prune.
    seen[objId] = true;
    if (pruned && card.classList.contains('absent')) {
      card.classList.remove('absent');
      var owner = card.closest('.card');
      if (owner) owner.classList.remove('absent');
    }

    if (type === 'switch' || type === 'light') {
      var on = data.value === true || data.state === 'ON';
      card.classList.toggle('on', on);
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

    // Editable text: don't clobber what the user is currently typing
    if (type === 'text') {
      var tinp = card.querySelector('input');
      if (tinp && document.activeElement !== tinp) tinp.value = data.state != null ? data.state : '';
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
      if (bro) bro.textContent = bon ? 'HIGH' : 'LOW';
    }
  }

  function setLive(on) {
    var dot = document.getElementById('live-dot');
    var txt = document.getElementById('live-txt');
    if (dot) {
      dot.style.background  = on ? '#4ade80' : '#ef4444';
      dot.style.boxShadow   = on ? '0 0 8px #4ade80' : 'none';
    }
    if (txt) txt.textContent = on ? 'Live' : 'Reconnecting…';
  }

  // ── Component builders ─────────────────────────────────────────────────────

  function makeToggle(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = cfg.type + '-' + id;
    div.innerHTML   =
      '<span class="lbl-wrap"><span class="lbl">' + cfg.label + '</span>' +
        (cfg.note ? '<span class="note">' + cfg.note + '</span>' : '') +
      '</span>' +
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
        '<span class="lbl">' + cfg.label + '</span>' +
        '<span class="val">–</span>' +
      '</div>' +
      (cfg.note ? '<div class="note">' + cfg.note + '</div>' : '') +
      '<input type="range" min="' + cfg.min + '" max="' + cfg.max + '" step="' + cfg.step + '"' +
             ' value="' + Math.round((cfg.min + cfg.max) / 2) + '">';
    var range = div.querySelector('input');
    var disp  = div.querySelector('.val');
    range.addEventListener('input',  function () { disp.textContent = fmt(cfg.unit, range.value); });
    range.addEventListener('change', function () { api.numSet(id, range.value); });
    return div;
  }

  // Compact numeric box (for wide ranges like the MP3 #, where a slider is fiddly)
  function makeNumberBox(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = 'number-' + id;
    div.innerHTML   = '<span class="lbl-wrap"><span class="lbl">' + cfg.label + '</span>' +
      (cfg.note ? '<span class="note">' + cfg.note + '</span>' : '') + '</span>';
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'numbox';
    inp.min = cfg.min; inp.max = cfg.max; inp.step = cfg.step;
    inp.addEventListener('change', function () { api.numSet(id, inp.value); });
    div.appendChild(inp);
    return div;
  }

  // Editable free-text box (ESPHome `text` domain), committed on blur/Enter
  function makeTextBox(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = 'text-' + id;
    div.innerHTML   = '<span class="lbl">' + cfg.label + '</span>';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'txtbox';
    if (cfg.maxlen) inp.maxLength = cfg.maxlen;
    if (cfg.placeholder) inp.placeholder = cfg.placeholder;
    inp.addEventListener('change', function () { api.textSet(id, inp.value.trim()); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
    div.appendChild(inp);
    return div;
  }

  function makeSelect(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = 'select-' + id;
    var sel = document.createElement('select');
    cfg.options.forEach(function (opt) { sel.add(new Option(opt, opt)); });
    sel.addEventListener('change', function () { api.selSet(id, sel.value); });
    // Label, plus the optional explanatory note (same markup as makeToggle)
    var lbl = document.createElement('span');
    lbl.className = 'lbl-wrap';
    lbl.innerHTML = '<span class="lbl">' + cfg.label + '</span>' +
      (cfg.note ? '<span class="note">' + cfg.note + '</span>' : '');
    div.appendChild(lbl);
    div.appendChild(sel);
    return div;
  }

  function makeButton(id, cfg) {
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = 'button-' + id;
    div.innerHTML   = '<span class="lbl">' + cfg.label + '</span>';
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
      '<span class="lbl">' + cfg.label + '</span>' +
      '<span class="ro-val">–</span>';
    return div;
  }

  function makeItem(id, cfg) {
    switch (cfg.type) {
      case NUM:  return cfg.box ? makeNumberBox(id, cfg) : makeSlider(id, cfg);
      case TXTIN: return makeTextBox(id, cfg);
      case SEL:  return makeSelect(id, cfg);
      case SW:
      case LT:   return makeToggle(id, cfg);
      case BTN:  return makeButton(id, cfg);
      case SENS:
      case TXT:
      case BIN:  return makeReadout(id, cfg);
    }
    return document.createElement('div');
  }

  // Items belonging to a section, in registry order, built by type
  function sectionItems(section) {
    return Object.keys(ENTITIES)
      .filter(function (k) { return ENTITIES[k].section === section; })
      .map(function (k) {
        var el = makeItem(k, ENTITIES[k]);
        if (ENTITIES[k].types) el.dataset.types = ENTITIES[k].types.join('|');
        return el;
      });
  }

  // ── Motor type ─────────────────────────────────────────────────────────────
  // Show only the rows (and cards) that apply to the selected Motor Type, and
  // name the hero buttons for what Input 1 / Input 2 do in that type.
  var BTN_LABELS = {};
  BTN_LABELS[DC]    = ['◀ Reverse', 'Forward ▶'];
  BTN_LABELS[AC]    = ['◀ Reverse', 'Forward ▶'];
  BTN_LABELS[LIN]   = ['◀ Retract', 'Run Cycle ▶'];
  var LIN_TOGGLE_LABELS = ['■ Stop', 'Toggle ▶'];   // Linear Mode = Toggle
  var curType = DC, curLinMode = 'Cycle';
  BTN_LABELS[WINCH] = ['◀ Reel In', 'Reel Out ▶'];
  BTN_LABELS[PULSE] = ['Fire B', 'Fire A'];

  function applyMotorType(t) {
    curType = t;
    Array.prototype.forEach.call(document.querySelectorAll('.app [data-types]'), function (el) {
      el.classList.toggle('type-off', el.dataset.types.split('|').indexOf(t) === -1);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.app .card'), function (card) {
      var items = card.querySelectorAll('[data-eid]');
      if (!items.length) return;
      card.classList.toggle('type-off', Array.prototype.every.call(items, function (i) {
        return i.classList.contains('type-off') || i.classList.contains('absent');
      }));
    });
    var labels = (t === LIN && curLinMode === 'Toggle') ? LIN_TOGGLE_LABELS : (BTN_LABELS[t] || BTN_LABELS[DC]);
    var rev = document.getElementById('btn-rev'), fwd = document.getElementById('btn-fwd');
    if (rev) rev.textContent = labels[0];
    if (fwd) fwd.textContent = labels[1];
  }

  // A short explanatory paragraph, used above the Device ID control.
  function makeNote(html) {
    var d = document.createElement('div');
    d.className = 'note';
    d.innerHTML = html;
    return d;
  }

  const SOURCE_ADDRESS_NOTE =
    'Every unit ships with the same firmware, so this number — not the factory — ' +
    'is what tells the system which motor this is. On the 24V board it is the ' +
    'CAN node address (0-238); Home Assistant events carry it too. Set a ' +
    'replacement to the same number and it takes over that role, with no ' +
    'reflashing. <b>0 means unassigned</b> — a 24V board at 0 sends no CAN ' +
    'status. Changing this restarts the device.';

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
    '.hdr-link { color: #e94560; text-decoration: none; }',
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

    /* Hero: motor status + manual control */
    '.hit-row {',
    '  display: flex; flex-direction: column; gap: 12px;',
    '  background: #1a1a2e; border: 1px solid #252540; border-radius: 14px;',
    '  padding: 14px 16px;',
    '}',
    '.hit-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 2px; }',
    '#m-status { font-size: 1.9rem; font-weight: 800; color: #e94560; line-height: 1.1; }',
    '.ctl { display: flex; gap: 8px; }',
    '.test-btn {',
    '  flex: 1; background: linear-gradient(135deg, #e94560 0%, #b02f4a 100%);',
    '  color: #fff; border: none; border-radius: 12px; padding: 16px 8px;',
    '  font-size: 0.9rem; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;',
    '  cursor: pointer; box-shadow: 0 4px 20px rgba(233,69,96,.3);',
    '  transition: transform .1s, box-shadow .1s; -webkit-tap-highlight-color: transparent;',
    '}',
    '.test-btn:active { transform: scale(.96); box-shadow: 0 2px 10px rgba(233,69,96,.15); }',
    '.test-btn.stop { flex: 0 0 auto; background: #2a2a45; box-shadow: none; padding: 16px 18px; }',
    /* Rows / cards that do not apply to the selected Motor Type */
    '.app .type-off { display: none !important; }',

    /* Cards */
    '.card {',
    '  background: #1a1a2e; border: 1px solid #252540;',
    '  border-radius: 14px; overflow: hidden;',
    '}',
    '.card-ttl {',
    '  font-size: 0.65rem; font-weight: 700; text-transform: uppercase;',
    '  letter-spacing: 1.5px; color: #555; padding: 10px 16px 4px;',
    '}',

    /* Toggle / row */
    '.row {',
    '  display: flex; align-items: center; justify-content: space-between; gap: 10px;',
    '  padding: 14px 16px; border-top: 1px solid #1e1e38;',
    '}',
    '.card-ttl + .row, .card-ttl + .slider { border-top: none; }',
    /* Controls with no matching entity in this firmware build (see pruneMissing) */
    '.absent { display: none !important; }',
    '.lbl { font-size: 0.95rem; color: #ccc; }',
    /* Optional explanatory line under a control label */
    '.lbl-wrap { display: flex; flex-direction: column; gap: 3px; min-width: 0; }',
    '.note { font-size: 0.72rem; color: #6f6f92; line-height: 1.4; }',
    '.tgl {',
    '  width: 50px; height: 27px; background: #2a2a45; border-radius: 14px;',
    '  position: relative; cursor: pointer; flex-shrink: 0;',
    '  transition: background .2s; outline: none;',
    '}',
    '.row.on .tgl { background: #e94560; }',
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
    '.app input.txtbox {',
    '  background: #12122a; color: #e0e0e0; border: 1px solid #2a2a45;',
    '  border-radius: 8px; padding: 7px 10px; font-size: 0.88rem;',
    '  width: 150px; text-align: right; outline: none;',
    '}',

    /* Read-only value rows (sensors) */
    '.ro-val { font-size: 0.9rem; font-weight: 600; color: #8a8ab0; text-align: right; word-break: break-all; }',
    '.ro.on .ro-val { color: #4ade80; }',

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
    '.val { font-size: 0.9rem; font-weight: 600; color: #e94560; }',
    '.app input[type=range] {',
    '  -webkit-appearance: none; appearance: none;',
    '  width: 100%; height: 4px; background: #2a2a45; border-radius: 2px;',
    '  outline: none; cursor: pointer;',
    '}',
    '.app input[type=range]::-webkit-slider-thumb {',
    '  -webkit-appearance: none;',
    '  width: 22px; height: 22px; background: #e94560; border-radius: 50%;',
    '  box-shadow: 0 0 0 3px rgba(233,69,96,.2);',
    '}',
    '.app input[type=range]::-moz-range-thumb {',
    '  width: 22px; height: 22px; background: #e94560;',
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
    '.fw-fill { height: 100%; width: 0; background: #4ade80; transition: width .2s; }',
    '.fw-msg { font-size: 0.8rem; color: #aaa; min-height: 1.2em; }',
    '.fw-msg.err { color: #ef4444; }',
    '.fw-msg.ok  { color: #4ade80; }',

    /* Device log */
    '.log-box {',
    '  height: 240px; overflow-y: auto; background: #08080f; border: 1px solid #252540;',
    '  border-radius: 8px; padding: 6px 8px; margin: 4px 0 6px;',
    '  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.7rem; line-height: 1.35;',
    '}',
    '.log-line { white-space: pre-wrap; word-break: break-word; color: #9a9ab8; }',
    '.log-E { color: #ef4444; }',
    '.log-W { color: #fbbf24; }',
    '.log-I { color: #e94560; }',
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
        '<div class="hdr-name" id="hdr-name">' + DEVICE_NAME + '</div>' +
        '<div class="hdr-sub">' +
          '<a class="hdr-link" href="' + WEBSITE_URL + '" target="_blank" rel="noopener">neatofx.com</a>' +
        '</div>' +
        '<div class="hdr-ver">v<span id="fw-ver">–</span></div>' +
        '<div class="hdr-id">Addr <span id="dev-id">–</span></div>' +
      '</div>' +
      '<div class="live">' +
        '<div id="live-dot"></div>' +
        '<span id="live-txt">Connecting…</span>' +
      '</div>';
    inner.appendChild(hdr);

    // Hero: live Motor Status + manual control through the "Motor" cover
    var hero = document.createElement('div');
    hero.className = 'hit-row';
    hero.innerHTML =
      '<div><div class="hit-lbl">Motor</div><div id="m-status">–</div></div>' +
      '<div class="ctl">' +
        '<button class="test-btn" id="btn-rev">◀ Reverse</button>' +
        '<button class="test-btn stop" id="btn-stop">■</button>' +
        '<button class="test-btn" id="btn-fwd">Forward ▶</button>' +
      '</div>';
    hero.querySelector('#btn-rev').addEventListener('click',  function () { api.cover('close'); });
    hero.querySelector('#btn-stop').addEventListener('click', function () { api.cover('stop'); });
    hero.querySelector('#btn-fwd').addEventListener('click',  function () { api.cover('open'); });
    inner.appendChild(hero);

    // Primary cards. Rows / cards for other motor types hide themselves
    // (applyMotorType).
    inner.appendChild(makeCard('Motor Type',     sectionItems('mtype')));
    inner.appendChild(makeCard('Drive',          sectionItems('drive')));
    inner.appendChild(makeCard('Linear Actuator', sectionItems('linear')));
    inner.appendChild(makeCard('Winch',          sectionItems('winch')));
    inner.appendChild(makeCard('Pulse',          sectionItems('pulse')));
    inner.appendChild(makeCard('Source Address',
      [makeNote(SOURCE_ADDRESS_NOTE)].concat(sectionItems('setup'))));

    // Collapsible cards
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
