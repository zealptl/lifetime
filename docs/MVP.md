# Lifetime — MVP Spec

Nov 22, 2026 · derived from the full game design spec (Nov 21, 2026)

## Goal

Build a playable prototype that tests the **core feel** of Lifetime: placing 8 events relative to one life, pinning ages, and the surprise of each reveal. The MVP does not try to prove the daily habit. It is a static, client-side web app that plays three hand-made puzzles.

## Scope

### In

- 3 static puzzles: Van Gogh, Einstein, the Soviet Union.
- A start screen where the player picks a puzzle.
- The full card loop: placing a card, the age pin, the reveal.
- A per-card timer.
- Scoring out of 100 and rank titles.
- A results screen with a timeline recap and a share text.
- Best score per puzzle, saved in the browser (`localStorage`).
- An in-progress puzzle that survives a page reload.
- A mobile-first, dark "dawn to dusk" visual design.

### Out (deferred)

| Item | Why it's out |
|---|---|
| Wikidata / content pipeline, editor tooling, scheduling | No live puzzle integration; the 3 examples are enough |
| Daily puzzle, puzzle numbers by date, midnight reset, countdown | Dev picker instead of date logic |
| Crowd stats: % correct per card, percentile, "hardest card today" | No backend |
| Accounts, streaks, personal stats, archive, reminders | Retention features come after the core is proven |
| Hard mode | Out of MVP scope per spec |
| Onboarding / how-to-play | Testers are briefed in person |
| Translations | English only |
| Light theme | Dark only for MVP (see Open items) |

## Tech

- **Plain HTML, CSS and JavaScript.** No build step and no framework.
- **Files:**
  ```
  index.html     – markup for all screens (shown/hidden by state)
  styles.css     – design tokens + components
  app.js         – state machine, input, timer, scoring, storage
  puzzles.js     – the 3 puzzles as a JS array (data below)
  ```
- **Fonts:** Fredoka (display), Nunito (body) and JetBrains Mono (years, hex, timer), loaded from Google Fonts with system fallbacks.
- **Storage:** `localStorage`, with every read and write wrapped in try/catch. The game must still work when storage is unavailable.
  - `lifetime.best.<puzzleId>`: the best score.
  - `lifetime.progress`: `{ puzzleId, cardIndex, answers[] }`.
- **Hosting:** any static host. Vercel or GitHub Pages is fine.

## Screens and flow

```
START ──pick puzzle──▶ PLAY (card 1..8) ──▶ [AGE PIN if DURING] ──▶ REVEAL ──▶ next card …
                                                                                   │
                                                              after card 8 ──▶ RESULTS ──▶ START
```

### 1. Start (dev picker)

```
╔══════════════════════════════╗
║     ★ L I F E T I M E ★      ║
║   sort 8 events into a life  ║
║                              ║
║ ╭──────────────────────────╮ ║
║ │🎨  Van Gogh      medium  │ ║
║ │    best: 70 ★            │ ║
║ ╰──────────────────────────╯ ║
║ ╭──────────────────────────╮ ║
║ │🧪  Einstein      hard    │ ║
║ │    not played            │ ║
║ ╰──────────────────────────╯ ║
║ ╭──────────────────────────╮ ║
║ │☭   Soviet Union  special │ ║
║ │    not played            │ ║
║ ╰──────────────────────────╯ ║
╚══════════════════════════════╝
```

- One big tappable card per puzzle. Each card shows the emoji avatar, the subject's name, the difficulty label, and the best score (or "not played").
- If a puzzle is in progress, its card says **Continue (card 4/8)**.

### 2. Play: place the card

```
╔══════════════════════════════╗
║ 🎨 VAN GOGH        3/8  ⏱ 12 ║
║ Dutch painter of The Starry  ║
║ Night · 1853–1890            ║
║                              ║
║   ╭──────────────────────╮   ║
║   │   Napoleon dies on   │   ║
║   │    Saint Helena      │   ║
║   ╰──────────────────────╯   ║
║    ← swipe   ↑   swipe →     ║
║                              ║
║ ╭──────╮╭──────────╮╭──────╮ ║
║ │BEFORE││  DURING  ││AFTER │ ║
║ ╰──────╯╰1853──1890╯╰──────╯ ║
╚══════════════════════════════╝
```

- **Header:** emoji avatar, name, one-line description, years, progress (`n/8`) and the timer.
- **Card:** shown in the centre. Text only, under 8 words.
- **Life bar:** runs along the bottom as three chunky tap zones, with birth and death years printed on the During zone.
- **Input:**
  - Tap a zone.
  - Swipe the card: left = Before, up = During, right = After. The card tilts and tints toward the zone while dragging, and a release past a threshold commits.
  - Keyboard (desktop testing): `←` / `1` = Before, `↑` / `2` = During, `→` / `3` = After.
- Placement is final. There is no undo.

### 3. Age pin (only after choosing DURING)

```
╔══════════════════════════════╗
║ 🎨 VAN GOGH        6/8  ⏱ 07 ║
║   ╭──────────────────────╮   ║
║   │ Coca-Cola is first   │   ║
║   │ sold       DURING ✓  │   ║
║   ╰──────────────────────╯   ║
║        How old was he?       ║
║            ▓ 33 ▓            ║
║            ≈ 1886            ║
║ 1853 ══════════════☀════ 1890║
║  0                        37 ║
║       [  LOCK IN  ➜  ]       ║
╚══════════════════════════════╝
```

- **Slider:** the During zone expands into a slider across the lifespan. The track uses the sunrise → sunset gradient, and the knob is a ☀ sun.
- **Range:** 0 to age at death (for the USSR, years since founding), in whole years. The knob starts in the middle.
- **Readout:** a big age number with the approximate year underneath (birth year + age).
- **LOCK IN** confirms the pin.
- The pronoun in "How old was he/she?" comes from the puzzle data. A non-person subject uses "How old was it?"

### 4. Reveal (card flip)

```
╔══════════════════════════════╗
║ 🎨 VAN GOGH        8/8       ║
║   ╭▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓╮   ║
║   ▓ ✓ RIGHT · DURING     ▓   ║
║   ▓ Sep 1889             ▓   ║
║   ▓ Van Gogh was 36      ▓   ║
║   ▓ You said 30 · ⚪ +0  ▓   ║
║   ▓ Nintendo started out ▓   ║
║   ▓ making hanafuda      ▓   ║
║   ▓ playing cards.       ▓   ║
║   ╰▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓╯   ║
║ ░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓☀░░░░░░░░ ║
║      tap to continue ➜       ║
╚══════════════════════════════╝
```

- **Flip:** the card flips in place.
- **Back colour:** where the event *really* sits on the bar. Before is the dawn rose, During is the day colour at that age, After is dusk violet.
- **Badge:** a ✓ RIGHT (mint) or ✗ WRONG (coral) badge with the correct zone.
- **Content:**
  - the date as month and year;
  - for real During cards, the real age (e.g. "Van Gogh was 36");
  - if the player pinned an age, their guess and the pin result (🎯 within 1 year, 🟡 within 3 years, ⚪ missed);
  - a one-line fact.
- **Bar marker:** a marker drops onto the life bar at the event's real date.
- **Timeout:** the card shows "⏱ Time's up" and plays the reveal as normal.
- **Next card:** tap anywhere, or press `Space` / `Enter`.

### 5. Results

```
╔══════════════════════════════╗
║        VAN GOGH · #1         ║
║        ▓▓▓  70  ▓▓▓          ║
║           / 100              ║
║       ★ OLD FRIEND ★         ║
║   sort 60/80 · pins 10/20    ║
║                              ║
║ 3   5   1  4  6 8   7    2   ║
║ ●░░░●░▓●▓▓●▓▓●●▓▓░░●░░░░●░░ ║
║ 1821  1853       1890   1912 ║
║   (coral ring = your miss)   ║
║                              ║
║  🟩🟩🟩🟥🟩🟩🟥🟩  6/8         ║
║  Pins 🎯⚪⚪🎯                ║
║                              ║
║ [ SHARE 📋 ]  [ Wikipedia ↗ ]║
║      [ play another ➜ ]      ║
╚══════════════════════════════╝
```

- **Score:** a big score out of 100, the rank title, and a breakdown (sort points and pin points).
- **Timeline recap:** the life bar is redrawn with a wider range (earliest event → latest event). All 8 events sit at their real dates, numbered by dealing order. Tapping a dot shows the card text and date. Misses have a coral ring.
- **Share:** a preview of the share squares. **SHARE** copies the share text to the clipboard. If the clipboard is blocked, the text is selected instead, and a toast says "Copied".
- **Wikipedia ↗** opens the subject's article in a new tab.
- **Play another** goes back to Start.
- The best score is updated if beaten.

### Share text

The percentile is dropped, and the puzzle number is the puzzle's id.

```
Lifetime #1 · Vincent van Gogh
🟩🟩🟩🟥🟩🟩🟥🟩  6/8
Pins 🎯⚪⚪🎯
70/100 · Old friend
<game URL>
```

- **Squares row:** 🟩 for the right zone and 🟥 for the wrong zone, in dealing order.
- **Pins row:** one symbol per real During card, in dealing order: 🎯 within 1 year, 🟡 within 3 years, ⚪ missed (including a wrong zone or a timeout).

## Rules

### Timer

- **15 seconds per card** to choose a zone. If time runs out, the card scores 0 and the reveal plays.
- Choosing **DURING** starts a **separate 10-second pin clock**. If the pin clock runs out, the zone still counts and the pin scores 0. The reveal shows the pin as missed.
- **Visual warning:** the timer pill turns coral for the last 5 seconds.
- **Paused:** the timer is paused during the reveal and on the results screen.
- **On reload:** the card that was showing restarts with a full timer. That's acceptable for a prototype.

### Scoring (out of 100)

**Sorting: 80 points**
- 10 points per card placed in the correct zone.

**Age pins: 20 points**
- The 20 points are split evenly across the puzzle's real During cards. All 3 MVP puzzles have 4 During cards, so each pin is worth 5.
- Within 1 year earns the full amount. Within 3 years earns half (2.5). Anything further earns 0.
- A pin on a card that isn't really During earns nothing.
- A real During card placed in the wrong zone, or timed out, earns no pin points either.

**Ages and totals**
- Age is completed years on the event date, calculated from the exact birth and event dates.
- For the USSR, "age" is years since founding (30 Dec 1922).
- The total is rounded to the nearest whole number.

### Ranks

| Score | Title |
|---|---|
| 95–100 | Time traveller |
| 80–94 | Biographer |
| 60–79 | Old friend |
| 40–59 | Acquaintance |
| 0–39 | Stranger |

## Visual design: "A life is one day"

The life is a day: dawn before birth, sunrise to sunset during the life, and dusk after death, all on a night sky. The style is playful and bold: chunky rounded cards, thick outlines and bouncy motion.

Live swatches with mock screens: https://claude.ai/artifact/So3K9HLD3D4Eca47nnLXHZ

### Colour tokens (dark theme)

| Token | Hex | Use |
|---|---|---|
| `--night` | `#14122B` | Page background (faint star speckles optional) |
| `--surface` | `#24214A` | Cards, pills, picker cards |
| `--border` | `#3A3670` | 3px outlines, dividers |
| `--ink` | `#FFF4E3` | Main text |
| `--muted` | `#A9A3D1` | Labels, years, hints |
| `--dawn-1` → `--dawn-2` | `#3B3F8F` → `#E88FB0` | Before zone gradient |
| `--day-1` → `--day-4` | `#FFB347` → `#FFD84D` → `#FF8A3D` → `#E8505B` | During zone gradient (sunrise → midday → afternoon → sunset), slider track |
| `--dusk-1` → `--dusk-2` | `#8A5CC2` → `#4A2F7A` | After zone gradient |
| `--right` | `#3EE6A8` | Correct badge, 🟩 |
| `--wrong` | `#FF5D6C` | Wrong badge, misses, timer warning |
| `--sun` | `#FFD84D` | Slider knob, score number, primary buttons |
| `--ink-on-light` | `#2A1A10` | Text on gold, peach and rose fills |

**Contrast pairs**
- Text on the night background and on surfaces is `--ink`.
- Text on day, gold or rose fills is `--ink-on-light`.
- Text on dusk fills is `--ink`.
- The During zone gets a soft inner gold glow so the "daylight" stands out.

### Type

| Role | Font | Notes |
|---|---|---|
| Display | Fredoka 600/700 | Card text, names, score, buttons |
| Body | Nunito 400/700 | Descriptions, facts |
| Data | JetBrains Mono 500 | Years, timer, counters (tabular figures) |

### Components and motion

- **Cards:** 22px radius, a 3px border and a soft drop shadow.
- **Zones and buttons:** 14–16px radius.
- **Card deal:** each new card drops in with a small bounce.
- **Swipe:** the card follows the finger with a tilt and tints toward the target zone.
- **Reveal:** a 3D flip (about 400ms), then the marker drops onto the bar.
- **Pin knob:** a gentle glow pulse.
- **Avatars:** an emoji on a radial colour blob. 🎨 Van Gogh, 🧪 Einstein, ☭ Soviet Union.
- **Reduced motion:** with `prefers-reduced-motion`, the flip becomes a cross-fade and bounces and pulses are disabled.
- **Layout:** mobile-first, single column, max width about 480px, centred on desktop, 16px minimum side gutter. Tap targets are at least 48px tall.

## Puzzle data

The data format is one object per puzzle:

```js
{
  id: 1,
  subject: "Vincent van Gogh",
  short: "Van Gogh",           // used in headers and "Van Gogh was 36"
  emoji: "🎨",
  pronoun: "he",               // he | she | it
  blurb: "Dutch painter of The Starry Night",
  difficulty: "medium",
  start: "1853-03-30",         // birth / founding (ISO)
  end:   "1890-07-29",         // death / dissolution (ISO)
  wiki: "https://en.wikipedia.org/wiki/Vincent_van_Gogh",
  cards: [ { text, date, zone, field, fact }, … ]   // in dealing order
}
```

The zone and age are derived from the dates at runtime. `zone` is stored as well, as a check: a startup assertion fails loudly if the stored zone disagrees with the dates.

### Puzzle 1: Vincent van Gogh (30 Mar 1853 – 29 Jul 1890), medium

| # | Card | Date | Zone | Age | Field | Fact |
|---|---|---|---|---|---|---|
| 1 | Abraham Lincoln is assassinated | 1865-04-14 | During | 12 | Politics | He was shot at Ford's Theatre in Washington, D.C. |
| 2 | The Titanic sinks | 1912-04-15 | After | | Disaster/transport | It sank on its maiden voyage from Southampton to New York. |
| 3 | Napoleon dies on Saint Helena | 1821-05-05 | Before | | Politics | He spent his last six years in exile on the remote Atlantic island. |
| 4 | Bell patents the telephone | 1876-03-07 | During | 22 | Science | Bell filed his application on the same day as a rival, Elisha Gray. |
| 5 | Moby-Dick is published | 1851-10-18 | Before | | Literature | It sold poorly in Melville's lifetime. |
| 6 | Coca-Cola is first sold | 1886-05-08 | During | 33 | Business | It was first sold at a pharmacy in Atlanta for 5 cents a glass. |
| 7 | The first modern Olympic Games | 1896-04-06 | After | | Sport | The first modern Games were held in Athens. |
| 8 | Nintendo is founded | 1889-09-23 | During | 36 | Business | Nintendo started out making hanafuda playing cards. |

### Puzzle 2: Albert Einstein (14 Mar 1879 – 18 Apr 1955), hard

| # | Card | Date | Zone | Age | Field | Fact |
|---|---|---|---|---|---|---|
| 1 | Abraham Lincoln is assassinated | 1865-04-14 | Before | | Politics | He was shot at Ford's Theatre in Washington, D.C. |
| 2 | The Wright brothers' first flight | 1903-12-17 | During | 24 | Science/transport | The first flight lasted 12 seconds. |
| 3 | Sputnik is launched | 1957-10-04 | After | | Space | The first satellite was about the size of a beach ball. |
| 4 | Fleming discovers penicillin | 1928-09-28 | During | 49 | Science | Fleming spotted mould killing bacteria in a dish left out while he was on holiday. |
| 5 | The Suez Canal opens | 1869-11-17 | Before | | Engineering | It linked the Mediterranean and the Red Sea. |
| 6 | Barbie goes on sale | 1959-03-09 | After | | Business | Barbie was launched at a toy fair in New York. |
| 7 | Everest is first climbed | 1953-05-29 | During | 74 | Exploration | Edmund Hillary and Tenzing Norgay reached the top together. |
| 8 | The Gunfight at the O.K. Corral | 1881-10-26 | During | 2 | Wild West | The famous gunfight lasted about 30 seconds. |

### Puzzle 3: The Soviet Union (30 Dec 1922 – 26 Dec 1991), special

"Age" here means years since founding. The pin prompt reads "How old was it?"

| # | Card | Date | Zone | Age | Field | Fact |
|---|---|---|---|---|---|---|
| 1 | The Titanic sinks | 1912-04-15 | Before | | Disaster/transport | It sank on its maiden voyage from Southampton to New York. |
| 2 | Mickey Mouse debuts in Steamboat Willie | 1928-11-18 | During | 5 | Film | It was one of the first cartoons with synchronised sound. |
| 3 | The October Revolution in Russia | 1917-11-07 | Before | | Politics | It's called "October" because Russia still used the old Julian calendar. |
| 4 | Tetris is created | 1984-06-06 | During | 61 | Games | Alexey Pajitnov created it at a computer centre in Moscow. |
| 5 | Nelson Mandela becomes South Africa's president | 1994-05-10 | After | | Politics | He had spent 27 years in prison before becoming president. |
| 6 | Nintendo's Game Boy launches | 1989-04-21 | During | 66 | Games | In North America it came bundled with Tetris. |
| 7 | The first Harry Potter book is published | 1997-06-26 | After | | Literature | In the UK it was titled Harry Potter and the Philosopher's Stone. |
| 8 | McDonald's opens in Moscow | 1990-01-31 | During | 67 | Business | About 30,000 people were served on opening day. |

Dates and facts come from general reference and should get one second-source check before playtesting.

## Acceptance criteria

1. On a phone-sized screen (about 375px), each of the 3 puzzles can be completed from Start to Results by tap alone, and also by swipe alone.
2. The scores below come out exactly. Add them as a small self-test in `app.js` that runs with `?test`.
   - All correct with exact pins → 100.
   - All zones correct with no pin points → 80.
   - The spec's example (misses on cards 4 and 7 of Van Gogh, 2 exact pins) → 70, "Old friend".
3. The timer:
   - A zone timeout scores 0 for that card.
   - A pin timeout keeps the zone points and scores 0 for the pin.
4. The reveal shows the correct date, the real age for During cards, and the fact.
5. The results recap places all 8 events in date order, with misses marked.
6. Share text:
   - It matches the format above.
   - Copying works, and falls back to selecting the text when the clipboard is blocked.
7. Reloading mid-puzzle resumes at the same card. The best score persists across reloads.
8. Nothing breaks when `localStorage` is unavailable.
9. Motion is reduced when `prefers-reduced-motion` is set.

## Open items

- [ ] **Sound and haptics:** swipe "whoosh", reveal chime, a vibration on a wrong answer? Default: none in MVP.
- [ ] **Light theme:** dark is the default. Should a light "daytime" theme follow the phone's setting later?
- [ ] **Background shift:** keep the background fixed? Or lighten it subtly from night toward dawn across the 8 cards?
- [ ] **Name:** the trademark check on "Lifetime" (from the main spec) is still open.
