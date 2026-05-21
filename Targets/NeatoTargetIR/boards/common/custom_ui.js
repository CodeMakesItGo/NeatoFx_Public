/**
 * NEATO Smart Target — Custom Web Interface
 *
 * Replaces the default ESPHome web UI with a target-specific dashboard.
 * Communicates via ESPHome REST API and Server-Sent Events (/events).
 * Self-contained — no external dependencies, works in AP standalone mode.
 */
(function () {
  'use strict';

  console.log('[NEATO-UI] script loaded');

  const DEVICE_NAME = document.title || 'NEATO Target';

  // Entity type tags
  const SW = 'switch', NUM = 'number', SEL = 'select', LT = 'light';

  // ── Entity registry ────────────────────────────────────────────────────────
  // Keys must be the sanitized object_id (derived from entity name, not YAML id:)
  // ESPHome REST API: /{domain}/{object_id}/{action}
  // ESPHome SSE:      {"id": "{domain}-{object_id}", ...}
  const ENTITIES = {
    // ── Settings card ──
    hit_points: {         // name: "Hit Points"
      type: NUM, label: 'Hit Points',
      min: 10, max: 100, step: 10, unit: 'pts', section: 'settings',
    },
    relay_timer: {        // name: "Relay Timer"
      type: NUM, label: 'Relay Timer',
      min: 100, max: 10000, step: 100, unit: 'ms', section: 'settings',
    },
    cooldown_timer: {     // name: "Cooldown Timer"
      type: NUM, label: 'Cooldown',
      min: 0, max: 10000, step: 100, unit: 'ms', section: 'settings',
    },

    // ── Triggers & Effects card ──
    gpio25_hit_trigger: { // name: "GPIO25 Hit Trigger"
      type: SW, label: 'GPIO25 Trigger', section: 'triggers',
    },
    target_leds_hit_effect: { // name: "Target LEDs Hit Effect"
      type: SEL, label: 'Hit Effect', section: 'triggers',
      options: ['Rainbow Effect', 'Color Wipe Effect', 'Scanner Effect', 'Twinkle Effect', 'Solid Color'],
    },
    target_leds_solid_color: { // name: "Target LEDs Solid Color"
      type: SEL, label: 'Solid Color', section: 'triggers',
      options: ['White', 'Red', 'Green', 'Blue', 'Yellow', 'Purple', 'Cyan', 'Orange', 'Pink'],
    },

    // ── Outputs card ──
    target_leds: { type: LT, label: 'Target LEDs', section: 'outputs' }, // name: "Target LEDs"

    // ── Advanced card (hidden by default) ──
    servo_slider: {       // name: "Servo Slider"
      type: NUM, label: 'Servo',
      min: -85, max: 85, step: 1, unit: '°', section: 'advanced',
    },
    aux_pwr:    { type: SW, label: 'Aux Power',  section: 'advanced' }, // name: "Aux Pwr"
    gnd_switch: { type: SW, label: 'GND Switch', section: 'advanced' }, // name: "Gnd Switch"
    relay_1:    { type: SW, label: 'Relay',      section: 'advanced' }, // name: "Relay 1"
  };

  // ── API helpers ────────────────────────────────────────────────────────────
  const post = (url) => fetch(url, { method: 'POST' }).catch(() => {});

  const api = {
    switchOn:  (id)    => post('/switch/' + id + '/turn_on'),
    switchOff: (id)    => post('/switch/' + id + '/turn_off'),
    lightOn:   (id)    => post('/light/' + id + '/turn_on'),
    lightOff:  (id)    => post('/light/' + id + '/turn_off'),
    numSet:    (id, v) => post('/number/' + id + '/set?value=' + encodeURIComponent(v)),
    selSet:    (id, v) => post('/select/' + id + '/set?option=' + encodeURIComponent(v)),
    testHit:   ()      => post('/switch/test_target_hit/turn_on'),
  };

  // ── Value formatter ────────────────────────────────────────────────────────
  function fmt(unit, val) {
    var v = parseFloat(val);
    if (isNaN(v)) return '–';
    if (unit === 'ms' && v >= 1000) {
      var s = v / 1000;
      return (s === Math.floor(s) ? s.toFixed(0) : s.toFixed(1)) + 's';
    }
    return v + (unit ? ' ' + unit : '');
  }

  // ── SSE connection ─────────────────────────────────────────────────────────
  function connect() {
    var es = new EventSource('/events');
    var retry;

    es.addEventListener('state', function (ev) {
      try { applyState(JSON.parse(ev.data)); } catch (_) {}
    });

    es.onopen = function () {
      clearTimeout(retry);
      setLive(true);
    };

    es.onerror = function () {
      setLive(false);
      es.close();
      retry = setTimeout(connect, 3000);
    };
  }

  // Apply an incoming SSE state update to the DOM
  function applyState(data) {
    var dashIdx = data.id.indexOf('-');
    if (dashIdx === -1) return;
    var type  = data.id.slice(0, dashIdx);
    var objId = data.id.slice(dashIdx + 1);

    if (objId === 'hit_count') {
      var el = document.getElementById('hit-count');
      if (el) el.textContent = data.value != null ? Math.round(data.value) : data.state;
      return;
    }

    var card = document.querySelector('[data-eid="' + data.id + '"]');
    if (!card) return;

    if (type === 'switch' || type === 'light') {
      var on = data.value === true || data.state === 'ON';
      card.classList.toggle('on', on);
    }

    if (type === 'number') {
      var cfg   = ENTITIES[objId];
      var range = card.querySelector('input[type=range]');
      var disp  = card.querySelector('.val');
      if (range && document.activeElement !== range) range.value = data.value;
      if (disp) disp.textContent = fmt(cfg && cfg.unit, data.value);
    }

    if (type === 'select') {
      var sel = card.querySelector('select');
      if (sel && document.activeElement !== sel) sel.value = data.state;
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
    var eid = cfg.type + '-' + id;
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = eid;
    div.innerHTML   =
      '<span class="lbl">' + cfg.label + '</span>' +
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
    var eid = 'number-' + id;
    var div = document.createElement('div');
    div.className   = 'slider';
    div.dataset.eid = eid;
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

  function makeSelect(id, cfg) {
    var eid = 'select-' + id;
    var div = document.createElement('div');
    div.className   = 'row';
    div.dataset.eid = eid;
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

  // ── CSS ────────────────────────────────────────────────────────────────────
  var CSS = [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'html { background: #0d0d1a; }',

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
    '  display: flex; align-items: center; justify-content: space-between;',
    '  background: #1a1a2e; border: 1px solid #252540; border-radius: 14px;',
    '  padding: 12px 16px;',
    '}',
    '.hdr-name { font-size: 1.05rem; font-weight: 700; color: #fff; }',
    '.hdr-sub  { font-size: 0.7rem; color: #555; margin-top: 2px; }',
    '.live { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: #666; }',
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

    /* Toggle row */
    '.row {',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  padding: 14px 16px; border-top: 1px solid #1e1e38;',
    '}',
    '.card-ttl + .row, .card-ttl + .slider { border-top: none; }',
    '.lbl { font-size: 0.95rem; color: #ccc; }',
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

    'select {',
    '  background: #12122a; color: #e0e0e0; border: 1px solid #2a2a45;',
    '  border-radius: 8px; padding: 7px 10px; font-size: 0.88rem;',
    '  cursor: pointer; outline: none; max-width: 185px;',
    '}',

    /* Slider */
    '.slider { padding: 12px 16px 18px; border-top: 1px solid #1e1e38; }',
    '.slider-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }',
    '.val { font-size: 0.9rem; font-weight: 600; color: #e94560; }',
    'input[type=range] {',
    '  -webkit-appearance: none; appearance: none;',
    '  width: 100%; height: 4px; background: #2a2a45; border-radius: 2px;',
    '  outline: none; cursor: pointer;',
    '}',
    'input[type=range]::-webkit-slider-thumb {',
    '  -webkit-appearance: none;',
    '  width: 22px; height: 22px; background: #e94560; border-radius: 50%;',
    '  box-shadow: 0 0 0 3px rgba(233,69,96,.2);',
    '}',
    'input[type=range]::-moz-range-thumb {',
    '  width: 22px; height: 22px; background: #e94560;',
    '  border-radius: 50%; border: none;',
    '}',

    /* Advanced collapsible */
    '.adv-btn {',
    '  display: flex; align-items: center; justify-content: center; gap: 6px;',
    '  padding: 12px; cursor: pointer; color: #444; font-size: 0.8rem;',
    '  border-top: 1px solid #1e1e38; user-select: none; transition: color .2s;',
    '  -webkit-tap-highlight-color: transparent;',
    '}',
    '.adv-btn:hover { color: #777; }',
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

    // Header
    var hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.innerHTML =
      '<div>' +
        '<div class="hdr-name">' + DEVICE_NAME + '</div>' +
        '<div class="hdr-sub">Smart Target</div>' +
      '</div>' +
      '<div class="live">' +
        '<div id="live-dot"></div>' +
        '<span id="live-txt">Connecting…</span>' +
      '</div>';
    inner.appendChild(hdr);

    // Hit counter + Test Hit button
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

    // Game Settings
    inner.appendChild(makeCard('Game Settings',
      Object.keys(ENTITIES)
        .filter(function (k) { return ENTITIES[k].section === 'settings'; })
        .map(function (k) { return makeSlider(k, ENTITIES[k]); })));

    // Triggers & Effects
    inner.appendChild(makeCard('Triggers & Effects',
      Object.keys(ENTITIES)
        .filter(function (k) { return ENTITIES[k].section === 'triggers'; })
        .map(function (k) {
          return ENTITIES[k].type === SEL ? makeSelect(k, ENTITIES[k]) : makeToggle(k, ENTITIES[k]);
        })));

    // Outputs
    inner.appendChild(makeCard('Outputs',
      Object.keys(ENTITIES)
        .filter(function (k) { return ENTITIES[k].section === 'outputs'; })
        .map(function (k) { return makeToggle(k, ENTITIES[k]); })));

    // Advanced (collapsible)
    var advCard = document.createElement('div');
    advCard.className = 'card';

    var advBtn = document.createElement('div');
    advBtn.className = 'adv-btn';
    advBtn.innerHTML = '<span class="chev">▾</span> Advanced';

    var advBody = document.createElement('div');
    advBody.className = 'adv-body';
    advBody.appendChild(
      makeCard(null,
        Object.keys(ENTITIES)
          .filter(function (k) { return ENTITIES[k].section === 'advanced'; })
          .map(function (k) {
            return ENTITIES[k].type === NUM ? makeSlider(k, ENTITIES[k]) : makeToggle(k, ENTITIES[k]);
          })));

    advBtn.addEventListener('click', function () {
      var open = advBody.classList.toggle('open');
      advBtn.classList.toggle('adv-open', open);
    });
    advCard.appendChild(advBtn);
    advCard.appendChild(advBody);
    inner.appendChild(advCard);

    // View switcher — loads ESPHome default Lit UI; refresh to return
    var viewSwitch = document.createElement('div');
    viewSwitch.className = 'view-switch';
    var origBtn = document.createElement('button');
    origBtn.className   = 'orig-btn';
    origBtn.textContent = 'Switch to ESPHome UI';
    origBtn.addEventListener('click', function () {
      app.style.display = 'none';
      var s = document.createElement('script');
      s.src = 'https://oi.esphome.io/v2/www.js';
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
