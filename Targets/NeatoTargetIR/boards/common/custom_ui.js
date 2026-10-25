/**
 * NeatoFx Target IR — Custom Web Interface
 *
 * Replaces the default ESPHome web UI with a target-specific dashboard.
 * Communicates via ESPHome REST API and Server-Sent Events (/events).
 * Self-contained — no external dependencies, works in AP standalone mode.
 * Firmware updates are installed from this page too (Firmware Update card,
 * POST /update) — the default ESPHome UI is not needed for anything.
 */
(function () {
  'use strict';

  console.log('[NEATO-UI] script loaded');

  // Placeholder until the device reports its own name (the SSE "ping" event's
  // title = friendly_name: NeatoFx Target IR / IR LCD / IR Hit / IR Hologram,
  // per hardware main). See showDeviceName().
  const DEVICE_NAME = 'NeatoFx Target IR';
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
  const GPIO_MODES = ['Input', 'Hit Trigger Input', 'Hit Pulse Output'];
  const GPIO_MODE_NOTE =
    'Each pin: Input = reads only (state shows in Debug). Hit Trigger Input = connecting the pin to GND scores a hit, like an IR shot. ' +
    'Hit Pulse Output = on every hit the pin waits its Pulse Delay, then goes high (3.3 V) for its Pulse Width — to trigger an external controller or sound board. ' +
    'Pulse Delay / Width only apply in Hit Pulse Output mode; the Test switch only works in that mode too.';

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

    // ── Master enable ──
    // First control in the card: a disabled target is dark and ignores every
    // hit source, so nothing below it matters until this is on.
    target_enabled: { type: SW, name: 'Target Enabled', label: 'Target Enabled',
                      note: 'Off = LEDs dark, outputs released, all hits ignored (IR, triggers, Test Hit). On = normal operation. Persists across reboots.',
                      section: 'base' },

    // ── Target Behavior — what used to be a build choice, now a runtime one ──
    ir_protocol: { type: SEL, name: 'IR Protocol', label: 'IR Protocol',
                   options: ['Laser Tag', 'Neato Blaster (NEC)'],
                   note: 'Which IR signal scores a hit. Laser Tag reads the shooting team; Neato Blaster reads the player number set on the Blaster.',
                   section: 'mode' },
    hit_style:   { type: SEL, name: 'Hit Style', label: 'Hit Style',
                   options: ['Standard', 'Fuse + Explosion', 'Lightning Storm'],
                   note: 'Standard = hit effect, relay, GND and servo fire at the hit. Fuse = LED Strip 2 burns down first, then relay / GND / servo fire. Lightning = 12.8 s storm on both strips, relay and GND (ignores the hit effects and timers).',
                   section: 'mode' },
    relay_mode:  { type: SEL, name: 'Relay Mode', label: 'Relay Mode', options: ['Hold', 'Toggle'],
                   note: 'Hold = relay stays closed for the Relay Timer. Toggle = two short presses, one at the hit and one when the Relay Timer ends — for a push-on / push-off light button.',
                   section: 'mode' },
    gnd_effect:  { type: SEL, name: 'GND Effect', label: 'GND Effect', options: ['Ramp', 'Flicker', 'Throttle'],
                   note: 'What the GND switch does for the GND window. Ramp = turns on, ramping up over GND Ramp % (0 % = instantly). Flicker = like a failing fluorescent tube. Throttle = a motor revved up and down.',
                   section: 'mode' },
    servo_mode:  { type: SEL, name: 'Servo Mode', label: 'Servo Mode', options: ['Off', 'Hold', 'Cycle'],
                   note: 'Hold = moves to Servo Hit position at the hit, holds, then returns to Idle. Cycle = moves back and forth between Idle and Hit for the whole hit (a jaw or flapping arm). Off = servo not driven.',
                   section: 'mode' },

    // ── Hit Style Settings (collapsible) ──
    fuse_burn:   { type: NUM, name: 'Fuse Burn Time', label: 'Fuse Burn Time', min: 250, max: 20000, step: 50, unit: 'ms',
                   note: 'Only used when Hit Style = Fuse + Explosion. How long the fuse takes to burn from the first LED of LED Strip 2 to the last; the relay, GND and servo fire when it reaches the end.',
                   section: 'style' },
    relay_pulse: { type: NUM, name: 'Relay Pulse Width', label: 'Relay Pulse Width', min: 50, max: 2000, step: 50, unit: 'ms',
                   note: 'Only used when Relay Mode = Toggle. How long each of the two button presses holds the relay closed.',
                   section: 'style' },

    // ── GPIO (collapsible) — right-side connector pins ──
    gpio16_mode:  { type: SEL, name: 'GPIO16 Mode', label: 'GPIO16', options: GPIO_MODES, section: 'gpio' },
    gpio16_delay: { type: NUM, name: 'GPIO16 Pulse Delay', label: 'GPIO16 Pulse Delay', min: 0, max: 20000, step: 10, unit: 'ms', section: 'gpio' },
    gpio16_width: { type: NUM, name: 'GPIO16 Pulse Width', label: 'GPIO16 Pulse Width', min: 10, max: 10000, step: 10, unit: 'ms', section: 'gpio' },
    gpio16_out:   { type: SW,  name: 'GPIO16 Output', label: 'Test GPIO16 Output', section: 'gpio' },
    gpio17_mode:  { type: SEL, name: 'GPIO17 Mode', label: 'GPIO17', options: GPIO_MODES, section: 'gpio' },
    gpio17_delay: { type: NUM, name: 'GPIO17 Pulse Delay', label: 'GPIO17 Pulse Delay', min: 0, max: 20000, step: 10, unit: 'ms', section: 'gpio' },
    gpio17_width: { type: NUM, name: 'GPIO17 Pulse Width', label: 'GPIO17 Pulse Width', min: 10, max: 10000, step: 10, unit: 'ms', section: 'gpio' },
    gpio17_out:   { type: SW,  name: 'GPIO17 Output', label: 'Test GPIO17 Output', section: 'gpio' },
    gpio25_mode:  { type: SEL, name: 'GPIO25 Mode', label: 'GPIO25', options: GPIO_MODES, section: 'gpio' },
    gpio25_delay: { type: NUM, name: 'GPIO25 Pulse Delay', label: 'GPIO25 Pulse Delay', min: 0, max: 20000, step: 10, unit: 'ms', section: 'gpio' },
    gpio25_width: { type: NUM, name: 'GPIO25 Pulse Width', label: 'GPIO25 Pulse Width', min: 10, max: 10000, step: 10, unit: 'ms', section: 'gpio' },
    gpio25_out:   { type: SW,  name: 'GPIO25 Output', label: 'Test GPIO25 Output', section: 'gpio' },

    // ── Base Target Events ──
    hit_points:     { type: NUM, name: 'Hit Points',    label: 'Hit Points', min: 10, max: 100, step: 10, unit: 'pts', section: 'base' },
    cooldown_timer: { type: NUM, name: 'Cooldown Timer', label: 'Cooldown',  min: 0, max: 600000, step: 100, unit: 'ms', section: 'base' },
    relay_timer:    { type: NUM, name: 'Relay Timer',   label: 'Relay Timer', min: 100, max: 10000, step: 100, unit: 'ms', section: 'base' },
    gnd_timer:      { type: NUM, name: 'GND Timer',     label: 'GND Timer (0 = follow relay)', min: 0, max: 3000, step: 100, unit: 'ms', section: 'base' },
    idle_effect:    { type: SEL, name: 'Target LEDs Idle Effect', label: 'Idle LED Effect',  options: IDLE_EFFECTS, section: 'base' },
    hit_effect:     { type: SEL, name: 'Target LEDs Hit Effect',  label: 'Hit LED Effect',  options: HIT_EFFECTS, section: 'base' },
    solid_color:    { type: SEL, name: 'Target LEDs Solid Color', label: 'Solid Color',      options: COLORS,      section: 'base' },
    led_brightness: { type: NUM, name: 'Target LEDs Brightness', label: 'LED Brightness', min: 0, max: 100, step: 1, unit: '%', section: 'base' },

    // ── Team Color (hidden on IR-less builds such as the hit face) ──
    // Two independent modes, deliberately worded to say what each one keeps:
    // the flash is temporary, capture is permanent. With the Neato Blaster the
    // "team" is the shooting player's color (Blaster Player 1-5 below).
    team_color:   { type: SW, name: 'Team Color On Hit',   label: 'Flash Team Color On Hit',
                    note: 'Hit flashes in the shooter’s color (laser-tag team, or Blaster player color). Solid Color / Strobe Flash hit effects only — animated effects keep their own colors. Resting color is restored after the hit.',
                    section: 'team' },
    team_capture: { type: SW, name: 'Team Color Capture',  label: 'Capture Mode (keep team color)',
                    note: 'Target KEEPS the last team’s color as its resting color, for capture-the-flag scoring. Overwrites Solid Color below. Set Idle LED Effect to “Solid Color” to see it.',
                    section: 'team' },
    player_color_1: { type: SEL, name: 'Player 1 Color', label: 'Blaster Player 1', options: ['Yellow', 'Red', 'Blue', 'Green', 'Orange'], section: 'team' },
    player_color_2: { type: SEL, name: 'Player 2 Color', label: 'Blaster Player 2', options: ['Yellow', 'Red', 'Blue', 'Green', 'Orange'], section: 'team' },
    player_color_3: { type: SEL, name: 'Player 3 Color', label: 'Blaster Player 3', options: ['Yellow', 'Red', 'Blue', 'Green', 'Orange'], section: 'team' },
    player_color_4: { type: SEL, name: 'Player 4 Color', label: 'Blaster Player 4', options: ['Yellow', 'Red', 'Blue', 'Green', 'Orange'], section: 'team' },
    player_color_5: { type: SEL, name: 'Player 5 Color', label: 'Blaster Player 5', options: ['Yellow', 'Red', 'Blue', 'Green', 'Orange'], section: 'team' },

    // ── Aux Outputs ──
    gnd_ramp:       { type: NUM, name: 'GND Ramp', label: 'GND Ramp (% of GND window, 0 = instant)', min: 0, max: 100, step: 1, unit: '%',
                      note: 'Only used when GND Effect = Ramp.', section: 'aux' },
    aux_pwr_mode:   { type: SEL, name: 'Aux Power Mode', label: 'Aux Power', options: ['On', 'Off', 'Follow Relay'],
                      note: 'On = aux rail always powered. Off = never powered. Follow Relay = powered only while Relay 1 is on (the Relay Timer window on each hit). The servo, LED Strip 2 and the LCD face all run off this rail — leave it On if the target uses them.',
                      section: 'aux' },

    // ── LED Strip 2 ──
    led2:            { type: LT,  name: 'LED Strip 2',            label: 'LED Strip 2',     section: 'led2' },
    led2_count:      { type: NUM, name: 'LED Strip 2 LED Count', label: 'LED Count', min: 1, max: 300, step: 1, box: true,
                       note: 'How many LEDs are on LED Strip 2 (1–300). <b>Power:</b> the board’s 5 V supply is 3 A in total, shared with the ESP32 and relay, and each LED draws up to 60 mA at full white — so about <b>40 LEDs fully lit at once</b> is the limit. ' +
                             'Scanner and the Fuse light only a few LEDs and are fine on long strips. Solid Color, Strobe Flash, Rainbow, Color Wipe and Lightning light the whole strip: on a long strip lower the brightness, or power the strip from its own 5 V supply (tie its GND to the board).',
                       section: 'led2' },
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

    // ── FPP (collapsible) — integrations/target_fpp.yaml only; the card is
    // pruned on builds without it. With FPP Enabled off, only that switch shows.
    fpp_enabled:  { type: SW,    name: 'FPP Enabled', label: 'FPP Enabled',
                    note: 'On = every hit starts the playlist below on the Falcon Player (FPP) server. Off = hits do not touch FPP.',
                    section: 'fpp' },
    fpp_ip:       { type: TXTIN, name: 'FPP Server IP Address', label: 'FPP Server IP', maxlen: 15, placeholder: 'e.g. 192.168.8.150', section: 'fpp' },
    fpp_playlist: { type: TXTIN, name: 'FPP Playlist', label: 'Playlist', maxlen: 64, placeholder: 'name as shown in FPP', section: 'fpp' },
    fpp_start:    { type: BTN,   name: 'Start FPP Playlist', label: 'Test: start playlist now', btnText: 'Start', section: 'fpp' },
    fpp_status:   { type: TXT,   name: 'FPP Server Status', label: 'Last result', section: 'fpp' },

    // ── Servo ──
    servo_idle: { type: NUM, name: 'Servo Idle Position', label: 'Servo Idle', min: 0, max: 180, step: 1, unit: '°', section: 'servo' },
    servo_hit:  { type: NUM, name: 'Servo Hit Position',  label: 'Servo Hit',  min: 0, max: 180, step: 1, unit: '°', section: 'servo' },
    // Test Servo Hit runs one hit window in the current mode (3 s in Cycle).
    cycle_interval: { type: NUM, name: 'Servo Cycle Interval', label: 'Cycle Interval', min: 100, max: 2000, step: 50, unit: 'ms',
                      note: 'Only used when Servo Mode = Cycle. Time for each move between Idle and Hit position, so one full back-and-forth takes twice this. Too short and the servo shudders instead of reaching the position — a hobby servo needs about 250–400 ms per 90°.',
                      section: 'servo' },

    // ── Reset (collapsible, bottom) ──
    wifi_reset:    { type: BTN, name: 'WiFi Reset',    label: 'Reset WiFi',     btnText: 'Reset', danger: true,
                     confirm: 'Clear saved WiFi credentials and reboot into setup (AP) mode?', section: 'reset' },
    factory_reset: { type: BTN, name: 'Factory Reset', label: 'Factory Reset',  btnText: 'Erase', danger: true,
                     confirm: 'ERASE all settings and WiFi credentials? The device reboots to defaults.', section: 'reset' },

    // ── Test (collapsible) ──
    aux_pwr:     { type: SW, name: 'Aux Pwr',    label: 'Aux Power',   section: 'test' },
    // gnd_light is a monochromatic (PWM) light, not a plain switch, so that the
    // hit scripts can ramp or dim it. A bare turn_on would replay whatever
    // brightness it was left at — the lightning hit script, for one, parks it at
    // 15% — and the test toggle would then quietly bench-test the GND output at
    // partial duty. brightness=255 pins the test toggle to full on, hard-switch
    // behaviour, whatever ran before it.
    gnd_switch:  { type: LT, name: 'Gnd Switch', label: 'GND Switch',  section: 'test',
                   onQuery: 'brightness=255' },
    relay_1:     { type: SW, name: 'Relay 1',    label: 'Relay',       section: 'test' },
    target_leds: { type: LT, name: 'Target LEDs', label: 'Target LEDs', section: 'test' },
    test_servo_hit: { type: BTN, name: 'Test Servo Hit', label: 'Test Servo Hit', btnText: 'Run', section: 'test' },

    // ── Debug (collapsible) — read-only, except Log Level ──
    log_level:    { type: SEL,  name: 'Log Level', label: 'Log Level',
                    options: ['NONE', 'ERROR', 'WARN', 'INFO', 'CONFIG', 'DEBUG'],
                    note: 'How much the device logs right now. WARN is normal. Pick INFO or DEBUG to troubleshoot and watch Device Log below; it returns to WARN on the next restart. DEBUG is very busy and can slow this page.',
                    section: 'debug' },
    gpio16:       { type: BIN,  name: 'GPIO16 Digital State',       label: 'GPIO16',         section: 'debug' },
    gpio17:       { type: BIN,  name: 'GPIO17 Digital State',       label: 'GPIO17',         section: 'debug' },
    gpio25_in:    { type: BIN,  name: 'GPIO25 Digital State',       label: 'GPIO25',         section: 'debug' },
    gpio34_adc:   { type: SENS, name: 'GPIO34 Voltage',             label: 'GPIO34 (ADC)', unit: 'V', section: 'debug' },
    trigger_in:   { type: BIN,  name: 'Trigger Input',             label: 'Trigger Input',  section: 'debug' },
    detected_team:{ type: TXT,  name: 'Detected Team',             label: 'Detected Team',  section: 'debug' },
    hit_player:   { type: TXT,  name: 'Hit Player Color',          label: 'Blaster Player Color', section: 'debug' },
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
    // Sent once on connect with the device config; title is the friendly name.
    // Every log line the device prints at its current Log Level (web_server
    // forwards them over /events) — shown in Debug › Device Log.
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
      // FPP card collapses to just its enable switch while FPP is off.
      if (objId === 'fpp_enabled') {
        var fppCard = card.closest('.card');
        if (fppCard) fppCard.classList.toggle('fpp-off', !on);
      }
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
  // DOM is touched only while the Debug card is open, so a busy DEBUG stream
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
    // second), and catch up when the Debug card is opened.
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
    '.hdr-link { color: #66e73a; text-decoration: none; }',
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
    '#hit-count { font-size: 3rem; font-weight: 800; color: #66e73a; line-height: 1; min-width: 56px; }',
    '.test-btn {',
    '  flex: 1; background: linear-gradient(135deg, #66e73a 0%, #4bb52a 100%);',
    '  color: #111110; border: none; border-radius: 12px; padding: 20px 12px;',
    '  font-size: 1rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;',
    '  cursor: pointer; box-shadow: 0 4px 20px rgba(102,231,58,.3);',
    '  transition: transform .1s, box-shadow .1s; -webkit-tap-highlight-color: transparent;',
    '}',
    '.test-btn:active { transform: scale(.96); box-shadow: 0 2px 10px rgba(102,231,58,.15); }',

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
    '.row.on .tgl { background: #66e73a; }',
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
    '.val { font-size: 0.9rem; font-weight: 600; color: #66e73a; }',
    '.app input[type=range] {',
    '  -webkit-appearance: none; appearance: none;',
    '  width: 100%; height: 4px; background: #2a2a45; border-radius: 2px;',
    '  outline: none; cursor: pointer;',
    '}',
    '.app input[type=range]::-webkit-slider-thumb {',
    '  -webkit-appearance: none;',
    '  width: 22px; height: 22px; background: #66e73a; border-radius: 50%;',
    '  box-shadow: 0 0 0 3px rgba(102,231,58,.2);',
    '}',
    '.app input[type=range]::-moz-range-thumb {',
    '  width: 22px; height: 22px; background: #66e73a;',
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

    /* FPP card: only the enable switch while FPP is off */
    '.fpp-off > [data-eid]:not([data-eid="switch-fpp_enabled"]) { display: none; }',

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
        '<div class="hdr-name" id="hdr-name">' + DEVICE_NAME + '</div>' +
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

    inner.appendChild(makeCard('Target Behavior',    sectionItems('mode')));
    inner.appendChild(makeCard('Base Target Events', sectionItems('base')));
    // Team Color entities come with the IR package; the card hides itself on
    // IR-less builds such as the hit face (see pruneMissing).
    inner.appendChild(makeCard('Team Color',         sectionItems('team')));
    inner.appendChild(makeCard('Aux Outputs',        sectionItems('aux')));

    // Collapsible cards
    inner.appendChild(makeCollapsible('Hit Style Settings', sectionItems('style')));
    inner.appendChild(makeCollapsible('LED Strip 2',   sectionItems('led2')));
    // The mode explanation covers all three pins, so it heads the card.
    inner.appendChild(makeCollapsible('GPIO',
      [makeNote(GPIO_MODE_NOTE)].concat(sectionItems('gpio'))));
    inner.appendChild(makeCollapsible('Audio Trigger', sectionItems('audio')));
    inner.appendChild(makeCollapsible('FPP',           sectionItems('fpp')));
    inner.appendChild(makeCollapsible('Servo',         sectionItems('servo')));
    inner.appendChild(makeCollapsible('Test',          sectionItems('test')));
    inner.appendChild(makeCollapsible('Debug',         sectionItems('debug').concat([makeLogView()])));
    inner.appendChild(makeCollapsible('Reset',         sectionItems('reset')));

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
