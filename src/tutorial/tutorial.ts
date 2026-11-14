import { createInitialState, STANDARD_RULES } from '../engine/engine'
import { mulberry32 } from '../engine/board'
import type { GameState, Language, ProjectedState } from '../engine/types'

/** The tutorial is always the same game: the same deal and the same dice. */
const TUTORIAL_SEED = 2024

/** A game against the computer with the rulebook's settings, in which the player starts. */
export function createTutorialGame(language: Language): GameState {
  return createInitialState({ ...STANDARD_RULES, startingPlayer: 'host', language }, mulberry32(TUTORIAL_SEED))
}

export type TutorialStep = 'setup' | 'opponentSetup' | 'roll' | 'event' | 'action' | 'draw' | 'opponentTurn' | 'free'

/** What the coach explains now. It follows the game (the player's first turn, the computer's
 *  first turn), so it never gets ahead of or behind what is on the screen. The player is host. */
export function tutorialStep(view: Pick<ProjectedState, 'phase' | 'turn' | 'setup'>): TutorialStep {
  if (view.phase === 'setup') return view.setup.picked.host ? 'opponentSetup' : 'setup'
  if (view.turn === 2) return 'opponentTurn'
  if (view.turn > 2) return 'free'
  switch (view.phase) {
    case 'roll': return 'roll'
    case 'event-resolution':
    case 'production': return 'event'
    case 'action': return 'action'
    default: return 'draw'
  }
}
