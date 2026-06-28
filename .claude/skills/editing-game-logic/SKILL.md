---
name: editing-game-logic
description: Change a game rule or mechanic in this Catan card game — interview until the change is unambiguous, then record it in the rulebook before coding. Use when the user wants to add, change, or fix card effects, turn phases, costs, events, or win conditions.
---

# Editing Game Logic

`GAME_LOGIC.md` is the **rulebook**: the single source of truth for how the game behaves. A logic change is not "edit the engine" — it is "agree the rule, write it in the rulebook, then make code match." Rushing to code a half-understood mechanic is the recurring failure here (see `.claude/CLAUDE.md` §5).

Two steps, in order.

## 1. Pin down the change

Interview the user until you could hand the change to someone else and they would build it identically. Surface every fork with `AskUserQuestion` and your recommended option — never pick a mechanic silently. Use the `grilling` skill for the interview technique.

The change is only pinned down once you can state, and the user has confirmed, all of:

- **Effect** — exactly what happens, with numbers.
- **Timing** — which `TurnPhase` it fires in and at what point.
- **Edges** — resource caps (0–3 per region), empty decks, ties, hand limit, overflow, "opponent has nothing."
- **Interactions** — how it touches existing systems (production, events, advantage tokens, pending choices, stats computed from `playedCards`).
- **Representation** — how `GameState` carries it (a one-shot discard, a permanent `playedCards` entry, a new field, a pending choice).

Completion criterion: zero open mechanic questions remain. If any answer is still "probably," you are not done — ask.

## 2. Record it in the rulebook

Write the agreed mechanic into `GAME_LOGIC.md` first, as the spec the code will follow. Then update every other doc that the change touches or now contradicts:

- `docs/adr/` — architectural decisions (e.g. the card-effect model).
- `src/i18n/en.json` / `de.json` — card name/description text shown to players.
- `CONTEXT.md`, `.claude/CLAUDE.md` — only if the change alters something they state.

If the agreed mechanic conflicts with what the rulebook already says, resolve the conflict **in the rulebook** — never leave the docs describing the old rule while the code does the new one. Call out the deviation to the user explicitly.

Completion criterion: a reader could implement the change from the docs alone, and no doc contradicts the agreed mechanic.

---

Only now does implementation follow, and the code must match the rulebook. If implementation forces an unforeseen mechanic decision, return to step 1, then step 2 — do not encode it in the engine alone.
