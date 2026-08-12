/**
 * NeatoFx Smart Target — Custom Web Interface
 *
 * Replaces the default ESPHome web UI with a target-specific dashboard.
 * Communicates via ESPHome REST API and Server-Sent Events (/events).
 * Self-contained — no external dependencies, works in AP standalone mode.
 */
(function () {
  'use strict';

  console.log('[NEATO-UI] script loaded');

  const DEVICE_NAME = document.title || 'NeatoFx Target';
  const WEBSITE_URL = 'https://neatofx.com';

  // Entity type tags (must equal the ESPHome domain used in REST/SSE paths)
  // TXT is the read-only text_sensor domain; TXTIN is the editable text domain.
  const SW = 'switch', NUM = 'number', SEL = 'select', LT = 'light',
        BTN = 'button', TXT = 'text_sensor', SENS = 'sensor', BIN = 'binary_sensor',
        TXTIN = 'text';

  // Shared option lists (order is display-only; the value set is the string)
  const HIT_EFFECTS = ['Rainbow Effect', 'Color Wipe Effect', 'Scanner Effect', 'Twinkle Effect', 'Heartbeat Effect', 'Strobe Flash', 'Solid Color'];
  // Idle (resting) effects — same set minus the transient Strobe Flash
  const IDLE_EFFECTS = ['Rainbow Effect', 'Color Wipe Effect', 'Scanner Effect', 'Twinkle Effect', 'Heartbeat Effect', 'Solid Color'];
  const COLORS = ['White', 'Red', 'Green', 'Blue', 'Yellow', 'Purple', 'Cyan', 'Orange', 'Pink'];

  // ── Entity registry ────────────────────────────────────────────────────────
  // Keys are internal-only DOM ids. `name` is the exact YAML `name:` — REST URLs
  // use it (object-ID URLs are removed in ESPHome 2026.7) and SSE name_id
  // matching uses it. `type` MUST equal the ESPHome domain so the SSE
  // "{domain}/{name}" and the DOM data-eid ("{type}-{key}") line up.
  //   ESPHome REST API: /{domain}/{name}/{action}
  //   ESPHome SSE:      {"name_id": "{domain}/[{device}/]{name}", "state": ..., "value": ...}
  const ENTITIES = {
    // ── Device identity (one binary for every unit; see the card note) ──
    device_id:   { type: NUM, name: 'Device ID', label: 'Device ID', min: 0, max: 99, step: 1, box: true,
                   hint: '0 = unassigned', section: 'setup' },

    // ── Base Target Events ──
    hit_points:     { type: NUM, name: 'Hit Points',    label: 'Hit Points', min: 10, max: 100, step: 10, unit: 'pts', section: 'base' },
    cooldown_timer: { type: NUM, name: 'Cooldown Timer', label: 'Cooldown',  min: 0, max: 10000, step: 100, unit: 'ms', section: 'base' },
    relay_timer:    { type: NUM, name: 'Relay Timer',   label: 'Relay Timer', min: 100, max: 10000, step: 100, unit: 'ms', section: 'base' },
    gnd_timer:      { type: NUM, name: 'GND Timer',     label: 'GND Timer (0 = follow relay)', min: 0, max: 3000, step: 100, unit: 'ms', section: 'base' },
    idle_effect:    { type: SEL, name: 'Target LEDs Idle Effect', label: 'Idle LED Effect',  options: IDLE_EFFECTS, section: 'base' },
    hit_effect:     { type: SEL, name: 'Target LEDs Hit Effect',  label: 'Hit LED Effect',  options: HIT_EFFECTS, section: 'base' },
    solid_color:    { type: SEL, name: 'Target LEDs Solid Color', label: 'Solid Color',      options: COLORS,      section: 'base' },
    led_brightness: { type: NUM, name: 'Target LEDs Brightness', label: 'LED Brightness', min: 0, max: 100, step: 1, unit: '%', section: 'base' },

    // ── Team Color (laser-tag protocols only; hidden on builds without them) ──
    // Two independent modes, deliberately worded to say what each one keeps:
    // the flash is temporary, capture is permanent.
    team_color:   { type: SW, name: 'Team Color On Hit',   label: 'Flash Team Color On Hit',
                    note: 'Hit flashes in the shooting team’s color. Solid Color / Strobe Flash hit effects only — animated effects keep their own colors. Resting color is restored after the hit.',
                    section: 'team' },
    team_capture: { type: SW, name: 'Team Color Capture',  label: 'Capture Mode (keep team color)',
                    note: 'Target KEEPS the last team’s color as its resting color, for capture-the-flag scoring. Overwrites Solid Color below. Set Idle LED Effect to “Solid Color” to see it.',
                    section: 'team' },

    // ── Aux Triggers ──
    gpio25_trigger: { type: SW, name: 'GPIO25 Hit Trigger', label: 'GPIO25 Trigger', section: 'aux' },
    gnd_ramp:       { type: SW, name: 'GND Ramp',           label: 'GND Ramp',       section: 'aux' },

    // ── LED Strip 2 ──
    led2:            { type: LT,  name: 'LED Strip 2',            label: 'LED Strip 2',     section: 'led2' },
    led2_brightness: { type: NUM, name: 'LED Strip 2 Brightness', label: 'LED Brightness', min: 0, max: 100, step: 1, unit: '%', section: 'led2' },
    led2_hit_effect: { type: SEL, name: 'LED Strip 2 Hit Effect', label: 'Hit LED Effect',  options: HIT_EFFECTS, section: 'led2' },
    led2_solid_color:{ type: SEL, name: 'LED Strip 2 Solid Color', label: 'Solid Hit Color', options: COLORS,     section: 'led2' },

    // ── Audio Trigger ──
    // Editable — re-point this target at a different speaker without recompiling.
    audio_target: { type: TXTIN, name: 'Audio Device IP',   label: 'Audio Device IP', maxlen: 32, placeholder: 'e.g. 192.168.8.3', section: 'audio' },
    // 0 = let the Audio-50 pick (runs its own Input N MP3); only meaningful in the Input modes.
    mp3_num:      { type: NUM, name: 'Hit Sound (MP3 #)',   label: 'Trigger Remote Sound (0 = speaker decides)', min: 0, max: 255, step: 1, box: true, section: 'audio' },
    // "MP3 Only" = sound alone; "Input 1/2" also fires that input's lights,
    // relay and timer on the Audio-50 (Net Trigger endpoint).
    remote_mode:  { type: SEL, name: 'Remote Audio Mode',   label: 'Remote Trigger Mode', options: ['MP3 Only', 'Input 1', 'Input 2'], section: 'audio' },
    remote_audio: { type: SW,  name: 'Remote Audio Enable', label: 'Remote Audio', section: 'audio' },

    // ── Servo ──
    servo_idle: { type: NUM, name: 'Servo Idle Position', label: 'Servo Idle', min: 0, max: 180, step: 1, unit: '°', section: 'servo' },
    servo_hit:  { type: NUM, name: 'Servo Hit Position',  label: 'Servo Hit',  min: 0, max: 180, step: 1, unit: '°', section: 'servo' },

    // ── Reset (collapsible, bottom) ──
    wifi_reset:    { type: BTN, name: 'WiFi Reset',    label: 'Reset WiFi',     btnText: 'Reset', danger: true,
                     confirm: 'Clear saved WiFi credentials and reboot into setup (AP) mode?', section: 'reset' },
    factory_reset: { type: BTN, name: 'Factory Reset', label: 'Factory Reset',  btnText: 'Erase', danger: true,
                     confirm: 'ERASE all settings and WiFi credentials? The device reboots to defaults.', section: 'reset' },

    // ── Test (collapsible) ──
    aux_pwr:     { type: SW, name: 'Aux Pwr',    label: 'Aux Power',   section: 'test' },
    gnd_switch:  { type: LT, name: 'Gnd Switch', label: 'GND Switch',  section: 'test' },
    relay_1:     { type: SW, name: 'Relay 1',    label: 'Relay',       section: 'test' },
    target_leds: { type: LT, name: 'Target LEDs', label: 'Target LEDs', section: 'test' },
    test_servo_hit: { type: BTN, name: 'Test Servo Hit', label: 'Test Servo Hit', btnText: 'Swing', section: 'test' },

    // ── Debug (collapsible) — all read-only ──
    gpio16:       { type: BIN,  name: 'GPIO16 Digital State',       label: 'GPIO16',         section: 'debug' },
    gpio17:       { type: BIN,  name: 'GPIO17 Digital State',       label: 'GPIO17',         section: 'debug' },
    gpio25_in:    { type: BIN,  name: 'GPIO25 Hit Trigger Input',   label: 'GPIO25 Trigger', section: 'debug' },
    trigger_in:   { type: BIN,  name: 'Trigger Input',             label: 'Trigger Input',  section: 'debug' },
    detected_team:{ type: TXT,  name: 'Detected Team',             label: 'Detected Team',  section: 'debug' },
    wifi_ssid:    { type: TXT,  name: 'WiFi SSID',                 label: 'WiFi SSID',      section: 'debug' },
    wifi_ip:      { type: TXT,  name: 'WiFi IP Address',           label: 'IP Address',     section: 'debug' },
    wifi_mac:     { type: TXT,  name: 'WiFi MAC Address',          label: 'MAC',            section: 'debug' },
    wifi_signal:  { type: SENS, name: 'WiFi Signal Strength',      label: 'WiFi Signal',    section: 'debug' },
    uptime:       { type: SENS, name: 'Uptime Sensor',            label: 'Uptime', fmt: 'uptime', section: 'debug' },
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
    textSet:   (id, v) => post(path(TXTIN, id) + '/set?value=' + encodeURIComponent(v)),
    selSet:    (id, v) => post(path(SEL, id) + '/set?option=' + encodeURIComponent(v)),
    btnPress:  (id)    => post(path(BTN, id) + '/press'),
    testHit:   ()      => post('/switch/' + encodeURIComponent('Test Target Hit') + '/turn_on'),
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

  // Stop SSE permanently (used when handing the page over to the default UI,
  // so each phone holds only one /events socket)
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
  // config-dependent: the Team Color switches exist only on laser-tag protocol
  // builds, the Audio Trigger controls only on networked/HA builds. A control
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
    Object.keys(ENTITIES).forEach(function (k) {
      if (seen[k]) return;
      var el = document.querySelector('[data-eid="' + ENTITIES[k].type + '-' + k + '"]');
      if (el) el.classList.add('absent');
    });
    // Hide cards whose every control was pruned (the Team Color card on a
    // non-laser-tag build, for example)
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
  // Prefers the new name_id format "{domain}/[{device}/]{name}"; falls back to
  // the legacy id format "{domain}-{object_id}" (removed in ESPHome 2026.8).
  function applyState(data) {
    var type, objId;

    if (data.name_id) {
      var parts = String(data.name_id).split('/');
      type = parts[0];
      var name = parts[parts.length - 1];
      if (name === 'Hit Count')            objId = 'hit_count';
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
    if (objId === 'hit_count') {
      var hc = document.getElementById('hit-count');
      if (hc) hc.textContent = data.value != null ? Math.round(data.value) : data.state;
      return;
    }
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
    div.innerHTML   = '<span class="lbl">' + cfg.label + '</span>';
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
    var lbl = document.createElement('span');
    lbl.className   = 'lbl';
    lbl.textContent = cfg.label;
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

  // ── CSS ────────────────────────────────────────────────────────────────────
  // All rules are scoped under .app so nothing leaks into the default ESPHome
  // UI if the user switches views.
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

    /* Hit row */
    '.hit-row {',
    '  display: flex; align-items: center; gap: 14px;',
    '  background: #1a1a2e; border: 1px solid #252540; border-radius: 14px;',
    '  padding: 14px 16px;',
    '}',
    '.hit-info { flex: 0 0 auto; }',
    '.hit-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 2px; }',
    '#hit-count { font-size: 3rem; font-weight: 800; color: #e94560; line-height: 1; min-width: 56px; }',
    '.test-btn {',
    '  flex: 1; background: linear-gradient(135deg, #e94560 0%, #b02f4a 100%);',
    '  color: #fff; border: none; border-radius: 12px; padding: 20px 12px;',
    '  font-size: 1rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;',
    '  cursor: pointer; box-shadow: 0 4px 20px rgba(233,69,96,.3);',
    '  transition: transform .1s, box-shadow .1s; -webkit-tap-highlight-color: transparent;',
    '}',
    '.test-btn:active { transform: scale(.96); box-shadow: 0 2px 10px rgba(233,69,96,.15); }',

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

    /* View switcher */
    '.view-switch {',
    '  display: flex; justify-content: center; padding: 8px 0 4px;',
    '}',
    '.orig-btn {',
    '  background: none; border: 1px solid #252540; color: #3a3a5c;',
    '  border-radius: 8px; padding: 5px 14px; font-size: 0.72rem;',
    '  cursor: pointer; transition: color .2s, border-color .2s;',
    '  -webkit-tap-highlight-color: transparent;',
    '}',
    '.orig-btn:hover { color: #777; border-color: #444; }',
    '.orig-btn:disabled { opacity: .5; cursor: default; }',
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

    // Hit counter + Test Hit button (unchanged)
    var hitRow = document.createElement('div');
    hitRow.className = 'hit-row';
    hitRow.innerHTML =
      '<div class="hit-info">' +
        '<div class="hit-lbl">Total Hits</div>' +
        '<div id="hit-count">–</div>' +
      '</div>';
    var testBtn = document.createElement('button');
    testBtn.className   = 'test-btn';
    testBtn.textContent = '⚡ Test Hit';
    testBtn.addEventListener('click', api.testHit);
    hitRow.appendChild(testBtn);
    inner.appendChild(hitRow);

    // Primary cards
    // Device identity first — it is the one thing that must be set on a new unit.
    inner.appendChild(makeCard('Device ID',
      [makeNote(DEVICE_ID_NOTE)].concat(sectionItems('setup'))));

    inner.appendChild(makeCard('Base Target Events', sectionItems('base')));
    // Team Color entities exist only on laser-tag protocol builds; the card
    // hides itself on other builds (see pruneMissing).
    inner.appendChild(makeCard('Team Color',         sectionItems('team')));
    inner.appendChild(makeCard('Aux Triggers',       sectionItems('aux')));

    // Collapsible cards
    inner.appendChild(makeCollapsible('LED Strip 2',   sectionItems('led2')));
    inner.appendChild(makeCollapsible('Audio Trigger', sectionItems('audio')));
    inner.appendChild(makeCollapsible('Servo',         sectionItems('servo')));
    inner.appendChild(makeCollapsible('Test',          sectionItems('test')));
    inner.appendChild(makeCollapsible('Debug',         sectionItems('debug')));
    inner.appendChild(makeCollapsible('Reset',         sectionItems('reset')));

    // View switcher — loads ESPHome default Lit UI; refresh to return.
    // The default UI (all entities + OTA firmware upload) ships from the ESPHome
    // CDN (js_url is disabled in YAML), so it only works when the PHONE viewing
    // this page has internet. In networked mode the phone stays on its normal
    // Wi-Fi (internet OK); in standalone mode the phone joins the target's own AP
    // (no internet) and this button cannot reach the CDN — hence the label.
    var viewSwitch = document.createElement('div');
    viewSwitch.className = 'view-switch';
    var origBtn = document.createElement('button');
    origBtn.className   = 'orig-btn';
    var BTN_LABEL = 'Switch to ESPHome UI (needs internet)';
    origBtn.textContent = BTN_LABEL;
    origBtn.addEventListener('click', function () {
      if (origBtn.disabled) return;
      origBtn.disabled    = true;
      origBtn.textContent = 'Loading ESPHome UI…';

      var s = document.createElement('script');
      s.src = 'https://oi.esphome.io/v2/www.js';

      // Guard so onload / onerror / timeout can only settle this once.
      var settled = false;

      // With no internet the request may neither load nor error — it just hangs
      // (or a captive portal stalls). Time out so the button never sticks on
      // "Loading…" forever.
      var timer = setTimeout(failSwitch, 8000);

      // Only tear down the custom UI once the default UI has actually loaded,
      // so a failed load never leaves a blank page. Removing the <style> node
      // matters: our dark background/reset rules would otherwise restyle the
      // default UI into invisibility.
      //
      // A fired onload does NOT prove the real script loaded: in AP/standalone
      // mode (no internet) or behind a captive portal/proxy, the request to
      // oi.esphome.io can be redirected to this device and return its own HTML
      // with a 200 — which fires onload but never defines <esp-app>. Tearing
      // down the custom UI then left a blank page. So verify the custom element
      // is actually registered before committing to the switch.
      s.onload = function () {
        if (settled) return;
        if (window.customElements && customElements.get('esp-app')) {
          settled = true;
          clearTimeout(timer);
          disconnect();
          style.remove();
          app.remove();
        } else {
          failSwitch();
        }
      };
      s.onerror = failSwitch;

      function failSwitch() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        s.remove();
        origBtn.disabled    = false;
        origBtn.textContent = BTN_LABEL;
        alert('Could not load the default ESPHome UI.\n\n' +
              'It is served from the internet (oi.esphome.io). You are joined to ' +
              'the target\'s Wi-Fi AP, which has no internet, so the request must ' +
              'go over cellular instead — but your phone routed it to the AP and ' +
              'it failed.\n\n' +
              'Fixes:\n' +
              '• iPhone: turn on Settings › Cellular › Wi-Fi Assist, ' +
              'then tap again.\n' +
              '• Or put the target on a Wi-Fi network that has internet and ' +
              'view this page from a phone on that same network.\n\n' +
              'The default UI has all entities plus firmware upload. The custom UI ' +
              'here works with no internet at all.');
      }
      document.head.appendChild(s);
    });
    viewSwitch.appendChild(origBtn);
    inner.appendChild(viewSwitch);

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
