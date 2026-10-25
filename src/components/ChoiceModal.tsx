import { computePlayerStats } from '../engine/engine'
import type { GameAction, PendingChoice, PlayerId, ProjectedState } from '../engine/types'
import ResourceChoiceModal from './ResourceChoiceModal'
import PlacedCardChoiceModal from './PlacedCardChoiceModal'
import AttackModal from './AttackModal'
import HandCardChoiceModal from './HandCardChoiceModal'
import MasterBuilderModal from './MasterBuilderModal'
import DiscardPanel from './DiscardPanel'
import Modal from './Modal'

interface Props {
  /** The head prompt, which this viewer has to answer. */
  choice: PendingChoice
  view: ProjectedState
  myId: PlayerId
  hand: string[]
  onAction: (a: GameAction) => void
}

/** The dialog for a mandatory pick. Region picks happen on the board instead (RegionChoiceBar).
 *  Keyed by the log length, so a new prompt of the same kind starts with a fresh selection. */
export default function ChoiceModal({ choice, view, myId, hand, onAction }: Props) {
  const key = view.eventLog.length
  switch (choice.kind) {
    case 'resource':
      return <ResourceChoiceModal choice={choice} onAction={onAction} />
    case 'placedCard':
      return <PlacedCardChoiceModal key={key} choice={choice} ownerPrincipality={view.players[choice.owner].principality} onAction={onAction} />
    case 'counter':
    case 'attackRoll':
      return <AttackModal choice={choice} hand={hand} onAction={onAction} />
    case 'handCard':
      return view.revealedHand && <HandCardChoiceModal key={key} choice={choice} hand={view.revealedHand} onAction={onAction} />
    case 'masterBuilder': {
      const searching = view.search?.player === myId && view.search.purpose === 'masterBuilder'
      return (
        <MasterBuilderModal
          key={key}
          choice={choice}
          deckSizes={view.deckSizes}
          contents={searching ? view.searchContents : null}
          hand={hand}
          onAction={onAction}
        />
      )
    }
    case 'discard':
      return (
        <Modal>
          <DiscardPanel key={key} hand={hand} handLimit={computePlayerStats(view.players[myId]).handLimit} onAction={onAction} />
        </Modal>
      )
    case 'region':
      return null
  }
}
