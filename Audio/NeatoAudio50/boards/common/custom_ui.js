/**
 * NeatoFx Audio 50 — Custom Web Interface
 *
 * Replaces the default ESPHome web UI with an audio-specific dashboard.
 * Communicates via ESPHome REST API and Server-Sent Events (/events).
 * Self-contained — no external dependencies, works in AP standalone mode.
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
  // `auto: true` rows start hidden and appear when the entity reports a state —
  // used for the RF section, which only exists in rftx_outputs builds.
  const ENTITIES = {
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

    // ── Outputs (collapsible) ──
    relay1:       { type: SW,  name: 'Relay 1', label: 'Relay 1', section: 'out' },
    relay2:       { type: SW,  name: 'Relay 2', label: 'Relay 2', section: 'out' },
    spot1_bright: { type: NUM, name: 'SpotLight 1 Trigger Brightness', label: 'SpotLight 1 Brightness',
                    min: 0, max: 100, step: 5, unit: '%', section: 'out' },
    spot2_bright: { type: NUM, name: 'SpotLight 2 Trigger Brightness', label: 'SpotLight 2 Brightness',
                    min: 0, max: 100, step: 5, unit: '%', section: 'out' },

    // ── RF Receiver (collapsible, only in rftx_outputs builds — auto-shown) ──
    rf_power: { type: SW,  name: 'RF TX Power',    label: 'RF TX Power', auto: true, section: 'rf' },
    rf_tx_a:  { type: SW,  name: 'RF TX A',        label: 'RF TX A (pulse)', auto: true, section: 'rf' },
    rf_a_mp3: { type: NUM, name: 'RF A MP3',       label: 'RF A MP3 #', min: 0, max: 255, step: 1, box: true, auto: true, section: 'rf' },
    rf_a_seq: { type: SW,  name: 'RF A Sequential', label: 'RF A Sequential', auto: true, section: 'rf' },
    rf_a_out: { type: SEL, name: 'RF A Output',    label: 'RF A Output', options: OUTPUTS, auto: true, section: 'rf' },
    rf_tx_b:  { type: SW,  name: 'RF TX B',        label: 'RF TX B (pulse)', auto: true, section: 'rf' },
    rf_b_mp3: { type: NUM, name: 'RF B MP3',       label: 'RF B MP3 #', min: 0, max: 255, step: 1, box: true, auto: true, section: 'rf' },
    rf_b_seq: { type: SW,  name: 'RF B Sequential', label: 'RF B Sequential', auto: true, section: 'rf' },
    rf_b_out: { type: SEL, name: 'RF B Output',    label: 'RF B Output', options: OUTPUTS, auto: true, section: 'rf' },
    rf_tx_c:  { type: SW,  name: 'RF TX C',        label: 'RF TX C (pulse)', auto: true, section: 'rf' },
    rf_c_mp3: { type: NUM, name: 'RF C MP3',       label: 'RF C MP3 #', min: 0, max: 255, step: 1, box: true, auto: true, section: 'rf' },
    rf_c_seq: { type: SW,  name: 'RF C Sequential', label: 'RF C Sequential', auto: true, section: 'rf' },
    rf_c_out: { type: SEL, name: 'RF C Output',    label: 'RF C Output', options: OUTPUTS, auto: true, section: 'rf' },
    rf_tx_d:  { type: SW,  name: 'RF TX D',        label: 'RF TX D (pulse)', auto: true, section: 'rf' },
    rf_d_mp3: { type: NUM, name: 'RF D MP3',       label: 'RF D MP3 #', min: 0, max: 255, step: 1, box: true, auto: true, section: 'rf' },
    rf_d_seq: { type: SW,  name: 'RF D Sequential', label: 'RF D Sequential', auto: true, section: 'rf' },
    rf_d_out: { type: SEL, name: 'RF D Output',    label: 'RF D Output', options: OUTPUTS, auto: true, section: 'rf' },

    // ── Testing (collapsible) ──
    test_in1:   { type: BTN, name: 'Test Input 1',     label: 'Test Input 1',     btnText: 'Trigger', section: 'test' },
    test_in2:   { type: BTN, name: 'Test Input 2',     label: 'Test Input 2',     btnText: 'Trigger', section: 'test' },
    test_spot1: { type: SW,  name: 'Test SpotLight 1', label: 'Test SpotLight 1', section: 'test' },
    test_spot2: { type: SW,  name: 'Test SpotLight 2', label: 'Test SpotLight 2', section: 'test' },

    // ── Diagnostics (collapsible) — all read-only ──
    in1_state:   { type: BIN,  name: 'Input 1',              label: 'Input 1',       section: 'debug' },
    in2_state:   { type: BIN,  name: 'Input 2',              label: 'Input 2',       section: 'debug' },
    push_button: { type: BIN,  name: 'Push Button',          label: 'Push Button',   section: 'debug' },
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

  // Stop SSE permanently (used when handing the page over to the default UI,
  // so each phone holds only one /events socket)
  function disconnect() {
    clearTimeout(retryTimer);
    if (es) {
      es.onerror = null;
      es.close();
      es = null;
    }
  }

  // Sections that start hidden and appear when one of their entities reports a
  // state (RF controls only exist in rftx_outputs builds). Filled by build().
  var autoCards = {};

  function reveal(card, cfg) {
    if (card.classList.contains('auto-hide')) card.classList.remove('auto-hide');
    var sec = autoCards[cfg && cfg.section];
    if (sec && sec.classList.contains('auto-hide')) sec.classList.remove('auto-hide');
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

    // Header readout (not a real card)
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
      dot.style.background  = on ? '#4ade80' : '#ef4444';
      dot.style.boxShadow   = on ? '0 0 8px #4ade80' : 'none';
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
    '#vol-val { font-size: 3rem; font-weight: 800; color: #e94560; line-height: 1; min-width: 56px; }',
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

    /* Auto-hidden rows/sections (RF — only present in rftx_outputs builds) */
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
    inner.appendChild(makeCard('Audio Control',   sectionItems('audio')));
    inner.appendChild(makeCard('Background Loop', sectionItems('bg')));

    // Collapsible cards
    inner.appendChild(makeCollapsible('Input 1',     sectionItems('in1')));
    inner.appendChild(makeCollapsible('Input 2',     sectionItems('in2')));
    inner.appendChild(makeCollapsible('Outputs',     sectionItems('out')));
    var rfCard = makeCollapsible('RF Receiver', sectionItems('rf'));
    rfCard.classList.add('auto-hide');   // shown when an RF entity reports state
    autoCards.rf = rfCard;
    inner.appendChild(rfCard);
    inner.appendChild(makeCollapsible('Testing',     sectionItems('test')));
    inner.appendChild(makeCollapsible('Diagnostics', sectionItems('debug')));
    inner.appendChild(makeCollapsible('Reset',       sectionItems('reset')));

    // View switcher — loads ESPHome default Lit UI; refresh to return.
    // The default UI (all entities + OTA firmware upload) ships from the ESPHome
    // CDN (js_url is disabled in YAML), so it only works when the PHONE viewing
    // this page has internet. In networked mode the phone stays on its normal
    // Wi-Fi (internet OK); in standalone mode the phone joins the device's own AP
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
              'the device\'s Wi-Fi AP, which has no internet, so the request must ' +
              'go over cellular instead — but your phone routed it to the AP and ' +
              'it failed.\n\n' +
              'Fixes:\n' +
              '• iPhone: turn on Settings › Cellular › Wi-Fi Assist, ' +
              'then tap again.\n' +
              '• Or put the device on a Wi-Fi network that has internet and ' +
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
