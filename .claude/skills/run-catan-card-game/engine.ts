// Headless driver: steer a game through the real rules engine, no browser.
//   npx tsx .claude/skills/run-catan-card-game/engine.ts <state.json> < commands.txt
// One command per line (blank lines and # comments are skipped):
//   <host|guest|auto> <GameAction JSON>   apply an action; 'auto' = whoever has to act now
//   roll <event> <1-6>                    resolve the roll with fixed dice (phase must be 'roll')
//   die <1-6>                             resolve a pending attack roll (Black Knight) with a fixed die
//   show                                  print the summary again
//   view <host|guest>                     print what that seat's browser receives (projected state)
//   save <file>                           write the current GameState as JSON (feed it to browser.mjs)
// Every line prints "ok" or "REJECTED" (the engine returns the state unchanged for an illegal
// action) plus a one-screen summary. Exit code 1 if any action was rejected.
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import {
  applyAction, applyRoll, resolveAttackRoll, availableResources, computePlayerStats, computeVP, projectStateFor, setupChooser,
} from '../../../src/engine/engine'
import type { DiceRoll, GameAction, GameState, PlayerId } from '../../../src/engine/types'

let state: GameState = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let rejected = 0

/** The seat that has to act next (same rule as practice mode's hot seat). */
function actor(s: GameState): PlayerId {
  if (s.search) return s.search.player
  if (s.phase === 'setup') return setupChooser(s) ?? s.setup.firstPlayer
  return s.pendingChoices[0]?.player ?? s.activePlayer
}

function summary(s: GameState): string {
  const lines = [
    `turn ${s.turn} · active ${s.activePlayer} · phase ${s.phase} · to act: ${actor(s)}${s.winner ? ` · WINNER ${s.winner}` : ''}`,
  ]
  if (s.pendingChoices.length) lines.push(`pending: ${s.pendingChoices.map(c => JSON.stringify(c)).join(' | ')}`)
  if (s.search) lines.push(`search: ${JSON.stringify(s.search)} contents(top last): ${s.decks[s.search.deck].join(',')}`)
  if (s.pendingTrade) lines.push(`trade offer: ${JSON.stringify(s.pendingTrade)}`)
  for (const p of ['host', 'guest'] as PlayerId[]) {
    const pl = s.players[p]
    const res = Object.entries(availableResources(pl)).map(([r, n]) => `${r}:${n}`).join(' ')
    const board = pl.principality
      .map((slot, i) => `${i}:${slot.kind}${slot.expansionSlots.some(Boolean) ? `[${slot.expansionSlots.map(c => c ?? '-').join(',')}]` : ''}`)
      .join(' ')
    lines.push(`${p}: ${computeVP(s, p)} VP · hand(${pl.hand.length}/${computePlayerStats(pl).handLimit}) ${pl.hand.join(',')} · ${res}`)
    lines.push(`  board ${board}`)
  }
  return lines.join('\n')
}

function logSince(before: GameState, after: GameState): string {
  const fresh = after.eventLog.filter(e => !before.eventLog.some(b => b.id === e.id))
  return fresh.map(e => `  log ${e.player} ${e.type} ${e.payload ? JSON.stringify(e.payload) : ''}`).join('\n')
}

function run(line: string): void {
  const [cmd, ...rest] = line.split(' ')
  const arg = rest.join(' ')
  const before = state
  if (cmd === 'show') return void console.log(summary(state))
  if (cmd === 'view') return void console.log(JSON.stringify(projectStateFor(state, arg as PlayerId), null, 2))
  if (cmd === 'save') { writeFileSync(arg, JSON.stringify(state)); return void console.log(`saved ${arg}`) }
  if (cmd === 'roll') {
    const [event, n] = rest
    state = applyRoll(state, { eventSymbol: event as DiceRoll['eventSymbol'], productionNumber: Number(n) as DiceRoll['productionNumber'] })
  } else if (cmd === 'die') {
    state = resolveAttackRoll(state, Number(arg))
  } else if (cmd === 'host' || cmd === 'guest' || cmd === 'auto') {
    const player = cmd === 'auto' ? actor(state) : cmd
    state = applyAction(state, player, JSON.parse(arg) as GameAction)
  } else {
    throw new Error(`unknown command: ${line}`)
  }
  if (state === before) rejected++
  console.log(`> ${line}\n${state === before ? 'REJECTED' : 'ok'}\n${logSince(before, state)}\n${summary(state)}\n`.replace(/\n\n+/g, '\n'))
}

console.log(summary(state) + '\n')
const rl = createInterface({ input: process.stdin })
for await (const raw of rl) {
  const line = raw.trim()
  if (line && !line.startsWith('#')) run(line)
}
process.exit(rejected ? 1 : 0)
