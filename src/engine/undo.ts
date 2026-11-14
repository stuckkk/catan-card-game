import { nextActor } from './engine'
import type { GameState } from './types'

/** Whether a local game may step back from `after` to `before` (GAME_LOGIC.md §12): only when the
 *  action showed nothing new and left the move with the same seat. So never past a roll or a
 *  reshuffle (the game's random numbers moved on), a drawn, searched or buried card (a stack
 *  changed or was opened), newly drawn Regions, a revealed hand, or the end of the game. */
export function canUndo(before: GameState, after: GameState): boolean {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  return !after.winner
    && nextActor(before) === nextActor(after)
    && before.rngState === after.rngState
    && same(before.decks, after.decks)
    && same(before.regionStack, after.regionStack)
    && !before.search && !after.search
    && !after.pendingChoices.some(c => c.kind === 'handCard')
}
