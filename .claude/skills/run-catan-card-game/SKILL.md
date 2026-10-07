---
name: run-catan-card-game
description: Run, start, drive, simulate or screenshot the Catan card game. Build a game state (e.g. mid-game, an event card just revealed), steer it through the real rules engine headlessly, or load it into practice mode in headless Chromium and click through the UI. Use to verify a rule or UI change in the running app, not just in unit tests.
---

Two-player Catan card game: a pure rules engine (`src/engine`) plus a React app. Drive it with
the three scripts in this directory — **`scenario.ts`** builds a `GameState`, **`engine.ts`**
steers it through the engine with no browser, **`browser.mjs`** loads it into practice mode in
headless Chromium and taps through the UI. Paths are relative to the repo root.

## Setup

```bash
npm install
npx playwright install chromium   # Playwright is a devDependency; this fetches its browser
```

## 1. Build a state — `scenario.ts`

```bash
npx tsx .claude/skills/run-catan-card-game/scenario.ts civil-war > /tmp/catan-cw.json
```

Scenarios: `setup`, `turn-1`, `mid-game` (roll phase, a City each, 2 of every resource, Action
Cards unlocked), `mid-game-action`, `civil-war` (Civil War just revealed, both picks + both
discards pending). Optional 2nd arg = RNG seed. Unknown name → prints the list.
To test a new mechanic, add a scenario to `SCENARIOS` using the helpers in the file (`midGame`,
`update`, `place`, `city`, `hand`, `stock`, `eventOnTop`, `roll` with fixed dice).

## 2. Steer it without a browser — `engine.ts`

Feeds actions to the real `applyAction` and prints a summary after each (phase, who acts,
pending prompts, hands, VP, resources, board, new log entries). This is the fast path for
checking rules.

```bash
npx tsx .claude/skills/run-catan-card-game/engine.ts /tmp/catan-cw.json <<'EOF'
auto {"type":"CHOOSE_PLACED_CARD","slotIndex":2,"expansionSlotIndex":0}
auto {"type":"CHOOSE_PLACED_CARD","slotIndex":0,"expansionSlotIndex":0}
auto {"type":"DISCARD_TO_LIMIT","discards":[{"cardId":"knight-conrad","toDeck":"stack-3"}]}
auto {"type":"DISCARD_TO_LIMIT","discards":[{"cardId":"library","toDeck":"stack-3"}]}
save /tmp/catan-after-cw.json
EOF
```

| command | what it does |
|---|---|
| `<host\|guest\|auto> <GameAction JSON>` | apply an action (`auto` = whoever must act now); prints `ok` or `REJECTED` |
| `roll <event> <1-6>` | resolve the roll with fixed dice (`brigand`, `commerce`, `tournament`, `yearOfPlenty`, `event`) |
| `show` | print the summary again |
| `view <host\|guest>` | the projected state that seat's browser receives (hidden info check) |
| `save <file>` | write the state; load it in the browser next |

Exit code 1 if any action was REJECTED. Action shapes: `GameAction` in `src/engine/types.ts`.

## 3. Drive the UI — `browser.mjs` (dev server + headless Chromium)

```bash
lsof -ti:5199 -sTCP:LISTEN | xargs -r kill
(npx vite --port 5199 --strictPort > /tmp/catan-vite.log 2>&1 &)
timeout 30 bash -c 'until curl -sf http://localhost:5199 >/dev/null; do sleep 1; done'

node .claude/skills/run-catan-card-game/browser.mjs <<'EOF'
load /tmp/catan-cw.json
dialog
shot cw-1-host-picks
card 1
button send back
card 0
button send back
card 0
button stack 3
button put cards under
card 3
button put cards under
shot cw-2-done
errors
EOF

lsof -ti:5199 -sTCP:LISTEN | xargs -r kill   # stop the dev server
```

Screenshots → `/tmp/catan-shots/<name>.png` (`CATAN_SHOTS`); dev server URL `CATAN_URL`
(default `http://localhost:5199`). **Open the screenshots and look at them.**
Default viewport is a phone (390×844) — the app is played on phones.

| command | what it does |
|---|---|
| `load <state.json>` | open practice mode on that state |
| `lobby` | open the lobby (then `button practice` = the human way into practice mode) |
| `card <n>` | tap the n-th card (0-based) of a card grid — in the open dialog if any |
| `button <regex>` | click a button by accessible name, dialog first (case-insensitive) |
| `click <selector>` | any Playwright selector |
| `dialog` / `text` | print the open dialog's / the page's visible text |
| `shot <name>` | screenshot |
| `errors` | console errors + page exceptions so far |
| `viewport <w> <h>` | set before `load`/`lobby` |
| `wait <ms>` | |

Exit code 1 if a command failed or the page logged an error.

## Run (human path)

`npm run dev` → http://localhost:5173 → "Practice locally" (hot-seat, no server). Online play
needs `npm run dev:server` too (see README).

## Test

```bash
npm test     # engine unit tests, 40 seeded random full games (src/engine/simulation.test.ts), server tests
npm run lint
npm run build
```

## Gotchas

- **Practice mode is hot-seat:** the screen always shows the seat that must act next (search
  owner → setup chooser → head of `pendingChoices` → active player). After each pick the
  same page switches player, so one script plays both sides.
- **Loading a state = router navigation state.** `LobbyPage` starts practice by navigating to
  `/game` with `{ role: 'practice', initialGameState }`; `load` pushes that history state and
  fires `popstate`. No app code change, no server. Online mode (host/guest over WebSocket) is
  **not** covered by this driver.
- **Mandatory picks are modal dialogs** (`[role=dialog]`); `card`/`button` look there first,
  because the turn panel can be collapsed on a phone.
- **Practice mode toasts the whole loaded log**: a state saved after events shows those log
  lines as toasts again on load. Not a bug in the change you're testing.
- **Dice are random in the UI.** Don't try to roll into an event; build the state with
  `roll(...)` in `scenario.ts` (or `roll` in `engine.ts`) and load it after the roll.
- **`playedCards` must match the board.** Stats, tokens and VP are computed from it; when
  editing a state by hand use `place`/`city`, which keep both in sync.

## Troubleshooting

- **`npx tsc` on these scripts complains about import extensions:** you used
  `--moduleResolution nodenext`. Use `--module esnext --moduleResolution bundler` (tsx runs them as-is).
- **`npx vitest run --root /` dies with an OOM:** it scans the whole filesystem. Don't run a
  one-off test from outside the repo — put it under `src/` temporarily or use `engine.ts`.
