/* Lifetime MVP — state machine, input, timer, scoring, storage. */
(() => {
'use strict';

const PUZZLES = window.PUZZLES;

/* ═══════════════════════ Constants ═══════════════════════ */

const ZONE_SECONDS = 15;
const PIN_SECONDS = 10;
const WARN_SECONDS = 5;
const SORT_POINTS = 10;      // per correctly placed card
const PIN_TOTAL = 20;        // split across the puzzle's real During cards
const SWIPE_COMMIT = 80;     // px
const REVEAL_GUARD_MS = 400; // ignore "continue" right after a reveal starts

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ZONE_LABEL = { before: 'BEFORE', during: 'DURING', after: 'AFTER' };
const DAY_STOPS = ['#FFB347', '#FFD84D', '#FF8A3D', '#E8505B'];
const RANKS = [
  [95, 'Time traveller'],
  [80, 'Biographer'],
  [60, 'Old friend'],
  [40, 'Acquaintance'],
  [0, 'Stranger'],
];

/* ═══════════════════════ Dates, zones, ages ═══════════════════════ */

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, t: Date.UTC(y, m - 1, d) };
}

/** Completed years on `dateISO`, counted from `startISO`. */
function ageOn(startISO, dateISO) {
  const a = parseISO(startISO), b = parseISO(dateISO);
  let years = b.y - a.y;
  if (b.m < a.m || (b.m === a.m && b.d < a.d)) years--;
  return years;
}

function zoneOf(p, iso) {
  return iso < p.start ? 'before' : iso > p.end ? 'after' : 'during';
}

const maxAge = (p) => ageOn(p.start, p.end);
const duringCount = (p) => p.cards.filter((c) => zoneOf(p, c.date) === 'during').length;
const pinWorth = (p) => PIN_TOTAL / duringCount(p);
const byId = (id) => PUZZLES.find((p) => p.id === id);

/** Startup assertion: stored zones must agree with the dates. */
function assertPuzzles() {
  for (const p of PUZZLES) {
    if (p.cards.length !== 8) throw new Error(`Puzzle ${p.id}: expected 8 cards, got ${p.cards.length}`);
    for (const c of p.cards) {
      const z = zoneOf(p, c.date);
      if (z !== c.zone) {
        throw new Error(`Puzzle ${p.id} "${c.text}": stored zone "${c.zone}" disagrees with dates (${z})`);
      }
    }
  }
}

/* ═══════════════════════ Scoring ═══════════════════════ */

function pinGrade(diff) {
  return diff <= 1 ? 'exact' : diff <= 3 ? 'near' : 'miss';
}
const PIN_SYMBOL = { exact: '🎯', near: '🟡', miss: '⚪' };

/**
 * Score one answer. `ans` = { zone: 'before'|'during'|'after'|null, pin: int|null }
 * (zone null = timed out; pin null = no pin / pin timed out).
 */
function scoreCard(p, card, ans) {
  const real = zoneOf(p, card.date);
  const right = ans.zone === real;
  const out = { real, right, sortPts: right ? SORT_POINTS : 0, isDuring: real === 'during', grade: 'miss', pinPts: 0, age: null, diff: null };
  if (real === 'during') {
    out.age = ageOn(p.start, card.date);
    if (right && ans.pin != null) {
      out.diff = Math.abs(ans.pin - out.age);
      out.grade = pinGrade(out.diff);
      out.pinPts = out.grade === 'exact' ? pinWorth(p) : out.grade === 'near' ? pinWorth(p) / 2 : 0;
    }
  }
  return out;
}

function rankFor(total) {
  return RANKS.find(([min]) => total >= min)[1];
}

function scorePuzzle(p, answers) {
  const cards = p.cards.map((c, i) => scoreCard(p, c, answers[i] || { zone: null, pin: null }));
  const sort = cards.reduce((s, c) => s + c.sortPts, 0);
  const pins = cards.reduce((s, c) => s + c.pinPts, 0);
  const total = Math.round(sort + pins);
  return { cards, sort, pins, total, rank: rankFor(total), rightCount: cards.filter((c) => c.right).length };
}

/* ═══════════════════════ Storage (always try/catch) ═══════════════════════ */

const mem = {}; // fallback when localStorage is unavailable
const store = {
  get(key) {
    let v = null;
    try { v = localStorage.getItem(key); } catch (e) { /* unavailable */ }
    return v != null ? v : (key in mem ? mem[key] : null);
  },
  set(key, val) {
    mem[key] = val;
    try { localStorage.setItem(key, val); } catch (e) { /* unavailable */ }
  },
  remove(key) {
    delete mem[key];
    try { localStorage.removeItem(key); } catch (e) { /* unavailable */ }
  },
};

const bestKey = (id) => `lifetime.best.${id}`;
const PROGRESS_KEY = 'lifetime.progress';

function loadBest(id) {
  const raw = store.get(bestKey(id));
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function loadProgress() {
  try {
    const raw = store.get(PROGRESS_KEY);
    if (!raw) return null;
    const pr = JSON.parse(raw);
    const p = byId(pr.puzzleId);
    if (!p || !Number.isInteger(pr.cardIndex) || pr.cardIndex < 0 || pr.cardIndex > 7) return null;
    if (!Array.isArray(pr.answers) || pr.answers.length !== pr.cardIndex) return null;
    const okZone = (z) => z === null || z === 'before' || z === 'during' || z === 'after';
    const answers = pr.answers.map((a) => ({
      zone: a && okZone(a.zone) ? a.zone : null,
      pin: a && Number.isInteger(a.pin) ? a.pin : null,
    }));
    return { puzzleId: p.id, cardIndex: pr.cardIndex, answers };
  } catch (e) {
    return null;
  }
}

function saveProgress() {
  store.set(PROGRESS_KEY, JSON.stringify({
    puzzleId: game.p.id, cardIndex: game.idx, answers: game.answers.slice(0, game.idx),
  }));
}

/* ═══════════════════════ Small helpers ═══════════════════════ */

const $ = (id) => document.getElementById(id);
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const monthYear = (iso) => { const d = parseISO(iso); return `${MONTHS[d.m - 1]} ${d.y}`; };
const yearOf = (iso) => parseISO(iso).y;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const pronounObj = (p) => (p.pronoun === 'she' ? 'she' : p.pronoun === 'he' ? 'he' : 'it');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function lerpHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
/** Day colour at fraction f (0 = sunrise … 1 = sunset). */
function dayColour(f) {
  const x = clamp(f, 0, 1) * (DAY_STOPS.length - 1);
  const i = Math.min(Math.floor(x), DAY_STOPS.length - 2);
  return lerpHex(DAY_STOPS[i], DAY_STOPS[i + 1], x - i);
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ═══════════════════════ Timer ═══════════════════════ */

const timer = {
  id: null, deadline: 0, onExpire: null,
  start(seconds, onExpire) {
    this.stop();
    this.onExpire = onExpire;
    this.deadline = performance.now() + seconds * 1000;
    $('p-timer').classList.remove('off');
    this.tick();
    this.id = setInterval(() => this.tick(), 100);
  },
  tick() {
    const left = this.deadline - performance.now();
    if (left <= 0) {
      this.show(0);
      const cb = this.onExpire;
      this.stop();
      if (cb) cb();
      return;
    }
    this.show(Math.ceil(left / 1000));
  },
  show(s) {
    const t = $('p-timer');
    t.textContent = `⏱ ${String(s).padStart(2, '0')}`;
    t.classList.toggle('warn', s <= WARN_SECONDS);
  },
  stop() {
    if (this.id) clearInterval(this.id);
    this.id = null;
    this.onExpire = null;
  },
  hide() { this.stop(); $('p-timer').classList.add('off'); },
};

/* ═══════════════════════ Life bar ═══════════════════════ */

function rangeOf(p) {
  const ts = [p.start, p.end, ...p.cards.map((c) => c.date)].map((s) => parseISO(s).t);
  const min = Math.min(...ts), max = Math.max(...ts);
  const pad = (max - min) * 0.04;
  return { min: min - pad, max: max + pad };
}

/**
 * Build a life bar. `markers`: [{ iso, label, miss, tag: 'button'|'span', onClick, drop }].
 * Overlapping markers are stacked into lanes (only when `lanes` is true).
 */
function buildLifeBar(p, markers, { lanes = false, ticks = false } = {}) {
  const r = rangeOf(p);
  const pct = (iso) => ((parseISO(iso).t - r.min) / (r.max - r.min)) * 100;
  const s = pct(p.start), e = pct(p.end);

  const wrap = el('div', 'lifebar');
  const track = el('div', 'track');
  const seg = (cls, l, w) => { const d = el('div', `seg ${cls}`); d.style.left = `${l}%`; d.style.width = `${w}%`; return d; };
  track.append(seg('before', 0, s), seg('during', s, e - s), seg('after', e, 100 - e));
  wrap.append(track);

  // markers: centred on the track
  const layer = el('div', 'markers');
  const LANE_H = 30, GAP_PCT = 9;
  const laneEnds = [];
  let laneCount = 1;
  const placed = markers
    .map((m) => ({ ...m, x: pct(m.iso) }))
    .sort((a, b) => a.x - b.x)
    .map((m) => {
      let lane = 0;
      if (lanes) {
        while (laneEnds[lane] !== undefined && m.x - laneEnds[lane] < GAP_PCT) lane++;
        laneEnds[lane] = m.x;
        laneCount = Math.max(laneCount, lane + 1);
      }
      return { ...m, lane };
    });
  for (const m of placed) {
    const d = el(m.tag || 'span', 'marker', m.label);
    if (m.tag === 'button') d.type = 'button';
    if (m.miss) d.classList.add('miss');
    if (m.drop) d.classList.add('drop');
    if (m.title) d.setAttribute('aria-label', m.title);
    d.style.left = `${m.x}%`;
    d.style.bottom = `${3 + m.lane * LANE_H}px`;
    if (m.onClick) d.addEventListener('click', () => m.onClick(d));
    m.el = d;
    layer.append(d);
  }
  // reserve vertical space for stacked lanes above the track
  wrap.style.paddingTop = `${(laneCount - 1) * LANE_H + 4}px`;
  wrap.append(layer);

  const tickRow = el('div', 'ticks');
  const addTick = (iso, faint) => {
    const t = el('span', 'tick' + (faint ? ' faint' : ''), String(yearOf(iso)));
    t.style.left = `${pct(iso)}%`;
    tickRow.append(t);
  };
  addTick(p.start);
  addTick(p.end);
  if (ticks) {
    const sorted = p.cards.map((c) => c.date).sort();
    for (const iso of [sorted[0], sorted[sorted.length - 1]]) {
      const x = pct(iso);
      if (Math.abs(x - s) > 14 && Math.abs(x - e) > 14) addTick(iso, true);
    }
  }
  wrap.append(tickRow);
  return { wrap, markers: placed };
}

/* ═══════════════════════ Game state ═══════════════════════ */

let game = null; // { p, idx, answers[], phase: 'place'|'pin'|'reveal', revealAt }

function showScreen(name) {
  for (const id of ['start', 'play', 'results']) $(`screen-${id}`).hidden = id !== name;
  window.scrollTo(0, 0);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

/* ───────── Start ───────── */

function renderStart() {
  timer.stop();
  game = null;
  const progress = loadProgress();
  const list = $('puzzle-list');
  list.textContent = '';
  for (const p of PUZZLES) {
    const best = loadBest(p.id);
    const inProg = progress && progress.puzzleId === p.id;
    const b = el('button', 'puzzle-card' + (inProg ? ' in-progress' : ''));
    b.type = 'button';
    const av = el('div', 'avatar', p.emoji);
    const nm = el('div', 'pc-name', p.short);
    const df = el('div', 'pc-diff', p.difficulty);
    const st = el('div', 'pc-status');
    if (inProg) {
      st.append(el('b', '', `Continue (card ${progress.cardIndex + 1}/8)`));
      if (best != null) st.append(` · best: ${best} ★`);
    } else {
      st.textContent = best != null ? `best: ${best} ★` : 'not played';
    }
    b.append(av, nm, df, st);
    b.addEventListener('click', () => startPuzzle(p.id));
    list.append(b);
  }
  showScreen('start');
}

function startPuzzle(id) {
  const p = byId(id);
  const prog = loadProgress();
  game = prog && prog.puzzleId === id
    ? { p, idx: prog.cardIndex, answers: prog.answers.slice() }
    : { p, idx: 0, answers: [] };
  game.phase = 'place';
  game.revealAt = 0;

  $('p-avatar').textContent = p.emoji;
  $('p-avatar').className = 'avatar sm';
  $('p-name').textContent = p.short;
  $('p-blurb').textContent = `${p.blurb} · ${yearOf(p.start)}–${yearOf(p.end)}`;
  $('zone-years').textContent = `${yearOf(p.start)}──${yearOf(p.end)}`;
  showScreen('play');
  showCard();
}

/* ───────── Play: place ───────── */

function setPhase(phase) {
  game.phase = phase;
  $('screen-play').dataset.phase = phase;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

function showCard() {
  const { p, idx } = game;
  const card = p.cards[idx];
  saveProgress(); // the card now showing; a reload restarts it with a full timer

  const wrap = $('card-wrap'), inner = $('card-inner');
  inner.classList.add('no-anim');
  inner.classList.remove('flipped');
  wrap.classList.remove('dragging', 'snap', 'lean-before', 'lean-during', 'lean-after');
  wrap.style.transform = '';
  void inner.offsetWidth;
  inner.classList.remove('no-anim');

  $('card-text').textContent = card.text;
  $('placed-tag').hidden = true;
  $('p-progress').textContent = `${idx + 1}/8`;
  clearHot();
  setPhase('place');

  wrap.classList.remove('deal');
  void wrap.offsetWidth;
  wrap.classList.add('deal');

  timer.start(ZONE_SECONDS, () => finishCard({ zone: null, pin: null }));
}

function chooseZone(zone) {
  if (!game || game.phase !== 'place') return;
  timer.stop();
  if (zone === 'during') enterPin();
  else finishCard({ zone, pin: null });
}

/* ───────── Play: age pin ───────── */

function enterPin() {
  const { p } = game;
  const max = maxAge(p);
  const slider = $('pin-slider');
  slider.max = String(max);
  slider.value = String(Math.round(max / 2));
  $('pin-q').textContent = `How old was ${pronounObj(p)}?`;
  $('pin-y0').textContent = yearOf(p.start);
  $('pin-y1').textContent = yearOf(p.end);
  $('pin-max').textContent = max;
  $('placed-tag').hidden = false;
  updatePinReadout();
  clearHot();
  const wrap = $('card-wrap');
  wrap.classList.remove('lean-before', 'lean-during', 'lean-after');
  wrap.style.transform = '';
  setPhase('pin');
  slider.focus({ preventScroll: true });
  timer.start(PIN_SECONDS, () => lockPin(true));
}

function updatePinReadout() {
  const age = Number($('pin-slider').value);
  $('pin-age').textContent = age;
  $('pin-year').textContent = `≈ ${yearOf(game.p.start) + age}`;
}

function lockPin(timedOut) {
  if (!game || game.phase !== 'pin') return;
  const pin = timedOut ? null : Number($('pin-slider').value);
  timer.stop();
  finishCard({ zone: 'during', pin });
}

/* ───────── Play: reveal ───────── */

function finishCard(answer) {
  if (!game || game.phase === 'reveal') return;
  timer.hide();
  game.answers[game.idx] = answer;
  reveal(answer);
}

function reveal(answer) {
  const { p, idx } = game;
  const card = p.cards[idx];
  const r = scoreCard(p, card, answer);
  const back = $('card-back');

  // back colour = where the event really sits on the bar
  back.classList.toggle('z-after', r.real === 'after');
  if (r.real === 'before') back.style.background = 'linear-gradient(160deg, #F2A6C0, #E88FB0)';
  else if (r.real === 'after') back.style.background = 'linear-gradient(160deg, #8A5CC2, #4A2F7A)';
  else {
    const f = (parseISO(card.date).t - parseISO(p.start).t) / (parseISO(p.end).t - parseISO(p.start).t);
    back.style.background = `linear-gradient(160deg, ${dayColour(f - 0.08)}, ${dayColour(f + 0.08)})`;
  }

  const badge = $('rv-badge');
  const zl = ZONE_LABEL[r.real];
  if (answer.zone === null) { badge.className = 'badge timeout'; badge.textContent = `⏱ Time's up · ${zl}`; }
  else if (r.right) { badge.className = 'badge right'; badge.textContent = `✓ RIGHT · ${zl}`; }
  else { badge.className = 'badge wrong'; badge.textContent = `✗ WRONG · ${zl}`; }

  $('rv-pts').textContent = `+${fmt(r.sortPts + r.pinPts)}`;
  $('rv-date').textContent = monthYear(card.date);
  $('rv-fact').textContent = card.fact;

  $('rv-age').textContent = r.isDuring
    ? (p.pronoun === 'it' ? `${p.short} was ${r.age} years old` : `${p.short} was ${r.age}`)
    : '';

  // pin line: only if the player actually pinned (or timed out pinning)
  let pinText = '';
  if (answer.zone === 'during') {
    const grade = r.grade; // 'miss' for non-During / no pin
    const sym = PIN_SYMBOL[grade];
    const said = answer.pin != null ? `You said ${answer.pin}` : 'No pin';
    pinText = `${said} · ${sym} +${fmt(r.pinPts)}`;
  }
  $('rv-pin').textContent = pinText;

  // life bar with the marker dropping onto the real date
  const bar = $('rv-bar');
  bar.textContent = '';
  const { wrap } = buildLifeBar(p, [{ iso: card.date, label: String(idx + 1), drop: true }]);
  bar.append(wrap);

  setPhase('reveal');
  game.revealAt = performance.now();
  $('card-inner').classList.add('flipped');
}

function advance() {
  if (!game || game.phase !== 'reveal') return;
  if (performance.now() - game.revealAt < REVEAL_GUARD_MS) return;
  game.idx++;
  if (game.idx >= game.p.cards.length) showResults();
  else showCard();
}

/* ───────── Results ───────── */

function shareText(p, res) {
  const squares = res.cards.map((c) => (c.right ? '🟩' : '🟥')).join('');
  const pins = res.cards.filter((c) => c.isDuring).map((c) => PIN_SYMBOL[c.grade]).join('');
  const url = location.href.split(/[?#]/)[0];
  return [
    `Lifetime #${p.id} · ${p.subject}`,
    `${squares}  ${res.rightCount}/8`,
    `Pins ${pins}`,
    `${res.total}/100 · ${res.rank}`,
    url,
  ].join('\n');
}

function showResults() {
  const { p, answers } = game;
  const res = scorePuzzle(p, answers);
  timer.stop();
  store.remove(PROGRESS_KEY);
  const prev = loadBest(p.id);
  if (prev == null || res.total > prev) store.set(bestKey(p.id), String(res.total));
  game.results = res;

  $('res-title').textContent = `${p.short} · #${p.id}`;
  $('res-rank').textContent = `★ ${res.rank} ★`;
  $('res-break').textContent = `sort ${fmt(res.sort)}/${p.cards.length * SORT_POINTS} · pins ${fmt(res.pins)}/${PIN_TOTAL}`;
  $('btn-wiki').href = p.wiki;
  $('share-preview').textContent = shareText(p, res);

  // count-up
  const scoreEl = $('res-score');
  if (reduceMotion() || res.total === 0) scoreEl.textContent = String(res.total);
  else {
    const t0 = performance.now(), dur = 700;
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      scoreEl.textContent = String(Math.round(res.total * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // recap: all 8 events at their real dates, numbered by dealing order
  const detail = $('recap-detail');
  detail.textContent = 'Tap a dot to see the card. Coral ring = your miss.';
  const recap = $('recap');
  recap.textContent = '';
  const markers = p.cards.map((c, i) => ({
    iso: c.date, label: String(i + 1), tag: 'button', miss: !res.cards[i].right,
    title: `Card ${i + 1}: ${c.text}, ${monthYear(c.date)}`,
    onClick: (node) => {
      recap.querySelectorAll('.marker.sel').forEach((n) => n.classList.remove('sel'));
      node.classList.add('sel');
      detail.textContent = '';
      detail.append(el('b', '', `${i + 1} · ${c.text}`), ` — ${monthYear(c.date)}${res.cards[i].right ? '' : ' (you missed this one)'}`);
    },
  }));
  const { wrap } = buildLifeBar(p, markers, { lanes: true, ticks: true });
  recap.append(wrap);

  showScreen('results');
}

async function copyShare() {
  const text = $('share-preview').textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch (e) {
    // clipboard blocked: select the text instead
    const range = document.createRange();
    range.selectNodeContents($('share-preview'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    toast(ok ? 'Copied' : 'Selected — press Ctrl/⌘+C to copy');
  }
}

/* ═══════════════════════ Input ═══════════════════════ */

function clearHot() {
  document.querySelectorAll('.zone.hot').forEach((z) => z.classList.remove('hot'));
}

/** Direction of a drag; `commit` uses the release threshold, otherwise the lean threshold. */
function dragZone(dx, dy, commit) {
  const th = commit ? SWIPE_COMMIT : 30;
  if (-dy > th * 0.9 && -dy > Math.abs(dx) * 0.8) return 'during';
  if (dx > th) return 'after';
  if (dx < -th) return 'before';
  return null;
}

function setupInput() {
  // zone taps
  $('zones').addEventListener('click', (e) => {
    const b = e.target.closest('.zone');
    if (b) chooseZone(b.dataset.zone);
  });

  // swipe
  const wrap = $('card-wrap');
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => {
    if (!game || game.phase !== 'place') return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    wrap.classList.remove('snap', 'deal');
    wrap.classList.add('dragging');
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    wrap.style.transform = `translate(${drag.dx}px, ${Math.min(drag.dy, 0) * 0.6}px) rotate(${clamp(drag.dx / 14, -18, 18)}deg)`;
    const z = dragZone(drag.dx, drag.dy, false);
    for (const k of ['before', 'during', 'after']) wrap.classList.toggle(`lean-${k}`, z === k);
    clearHot();
    if (z) document.querySelector(`.zone[data-zone="${z}"]`).classList.add('hot');
  });
  const end = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const z = cancelled ? null : dragZone(drag.dx, drag.dy, true);
    drag = null;
    wrap.classList.remove('dragging', 'lean-before', 'lean-during', 'lean-after');
    wrap.classList.add('snap');
    wrap.style.transform = '';
    clearHot();
    if (z) chooseZone(z);
  };
  wrap.addEventListener('pointerup', (e) => end(e, false));
  wrap.addEventListener('pointercancel', (e) => end(e, true));

  // pin
  $('pin-slider').addEventListener('input', updatePinReadout);
  $('btn-lock').addEventListener('click', () => lockPin(false));

  // reveal: tap anywhere
  $('screen-play').addEventListener('click', () => advance());

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !game || $('screen-play').hidden) return;
    const k = e.key;
    if (game.phase === 'place') {
      const map = { ArrowLeft: 'before', '1': 'before', ArrowUp: 'during', '2': 'during', ArrowRight: 'after', '3': 'after' };
      if (map[k]) { e.preventDefault(); chooseZone(map[k]); }
    } else if (game.phase === 'pin') {
      if (k === 'Enter') { e.preventDefault(); lockPin(false); }
    } else if (game.phase === 'reveal') {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); advance(); }
    }
  });

  // navigation
  $('btn-back').addEventListener('click', (e) => { e.stopPropagation(); renderStart(); });
  $('btn-share').addEventListener('click', copyShare);
  $('btn-again').addEventListener('click', renderStart);
}

/* ═══════════════════════ Self-test (?test) ═══════════════════════ */

function runSelfTest() {
  const results = [];
  const check = (name, got, want) => results.push({ name, ok: got === want, got, want });

  const perfect = (p) => p.cards.map((c) => {
    const z = zoneOf(p, c.date);
    return { zone: z, pin: z === 'during' ? ageOn(p.start, c.date) : null };
  });
  const noPins = (p) => perfect(p).map((a) => ({ zone: a.zone, pin: null }));

  // spec acceptance #2
  for (const p of PUZZLES) {
    check(`#${p.id} all correct, exact pins → 100`, scorePuzzle(p, perfect(p)).total, 100);
    check(`#${p.id} all zones correct, no pins → 80`, scorePuzzle(p, noPins(p)).total, 80);
  }
  const vg = byId(1);
  const ex = perfect(vg);
  ex[3] = { zone: 'before', pin: null };                       // card 4 (During) misplaced
  ex[6] = { zone: 'during', pin: 10 };                         // card 7 (After) misplaced
  ex[7] = { zone: 'during', pin: ageOn(vg.start, vg.cards[7].date) + 10 }; // third pin missed
  const exRes = scorePuzzle(vg, ex);
  check('spec example → 70', exRes.total, 70);
  check('spec example → Old friend', exRes.rank, 'Old friend');

  // timers (acceptance #3)
  const to = perfect(vg); to[0] = { zone: null, pin: null };
  check('zone timeout scores 0 for that card', scorePuzzle(vg, to).cards[0].sortPts + scorePuzzle(vg, to).cards[0].pinPts, 0);
  const pt = perfect(vg); pt[0] = { zone: 'during', pin: null };
  const ptc = scorePuzzle(vg, pt).cards[0];
  check('pin timeout keeps zone points', ptc.sortPts, 10);
  check('pin timeout scores 0 for the pin', ptc.pinPts, 0);

  // pin bands & rounding
  const near = perfect(vg); near[0].pin += 3;
  check('within 3 years earns half (80+15+2.5 → 98)', scorePuzzle(vg, near).total, 98);
  const far = perfect(vg); far[0].pin += 4;
  check('4 years off earns 0 (95)', scorePuzzle(vg, far).total, 95);
  const one = perfect(vg); one[0].pin += 1;
  check('1 year off earns full (100)', scorePuzzle(vg, one).total, 100);

  // ranks
  for (const [score, rank] of [[100, 'Time traveller'], [95, 'Time traveller'], [94, 'Biographer'], [80, 'Biographer'], [79, 'Old friend'], [60, 'Old friend'], [59, 'Acquaintance'], [40, 'Acquaintance'], [39, 'Stranger'], [0, 'Stranger']]) {
    check(`rank for ${score}`, rankFor(score), rank);
  }

  // data: ages from the spec tables
  const AGES = {
    1: { 0: 12, 3: 22, 5: 33, 7: 36 },
    2: { 1: 24, 3: 49, 6: 74, 7: 2 },
    3: { 1: 5, 3: 61, 5: 66, 7: 67 },
  };
  for (const p of PUZZLES) {
    for (const [i, age] of Object.entries(AGES[p.id])) check(`#${p.id} card ${Number(i) + 1} age`, ageOn(p.start, p.cards[i].date), age);
    check(`#${p.id} has 4 During cards`, duringCount(p), 4);
  }
  check('Van Gogh age at death', maxAge(vg), 37);

  const failed = results.filter((r) => !r.ok);
  console.table(results);
  const banner = el('div', failed.length ? 'fail' : '');
  banner.id = 'test-banner';
  banner.className = failed.length ? 'fail' : '';
  banner.textContent = failed.length
    ? `SELF-TEST FAILED (${failed.length}/${results.length})\n` + failed.map((f) => `✗ ${f.name}: got ${f.got}, want ${f.want}`).join('\n')
    : `SELF-TEST OK — ${results.length} checks passed`;
  document.body.prepend(banner);
  window.__lifetimeTest = { results, failed };
}

/* ═══════════════════════ Boot ═══════════════════════ */

assertPuzzles();
setupInput();
renderStart();
if (/[?&]test(?:[=&]|$)/.test(location.search)) runSelfTest();

})();
