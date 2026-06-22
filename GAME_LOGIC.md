# Catan - The Duel: Game Design Document & Rules Engine

## 1. Game State & Victory Conditions
**Players:** 2 (Player vs. Opponent).
**Turn-based System:** Players alternate turns.
**Victory Points (VP) Target:** Configurable per Session in the lobby (default 12). The available options correspond to the physical game's formats:
* Introductory Game: 7 VP.
* Theme Games: 12 VP.
* Duel of the Princes: 13 VP.

**VP Sources:** 
* Settlement: 1 VP.
* City: 2 VP (Replaces Settlement VP).
* Hero Token (Strength Advantage): 1 VP.
* Trade Token (Commerce Advantage): 1 VP.
* Specific City Expansions: 1 VP per symbol.

---

## 2. Core Entities & Data Models

### Resource Types
Wood, Wool, Gold, Brick, Ore, Grain. 

### The Game Grid (The Principality)
The board consists of interconnected slots for each player.
**Central Axis:** A horizontal line alternating between Settlements/Cities and Roads.
**Regions:** Placed diagonally adjacent to Settlements/Cities.
**Expansion Slots:** 
* 2 slots per Settlement (1 above, 1 below). 
* 4 slots per City (2 above, 2 below).

### Region Cards (Resource Trackers)
Regions do not use external tokens. The card itself acts as an integer counter (Capacity: 0 to 3).
* Earning 1 resource rotates the card 90 degrees counter-clockwise.
* Spending 1 resource rotates the card 90 degrees clockwise.
* Overflow rule: Any resource gained when the region is at maximum capacity (3) is permanently lost.

### Card Types
| Category | Subtype | Cost | Function/Rules |
| :--- | :--- | :--- | :--- |
| **Central** | Road | 1 Wood, 2 Brick | Required to build new Settlements. |
| **Central** | Settlement | 1 Wood, 1 Brick, 1 Grain, 1 Wool | Grants 1 VP, 2 Expansion slots, and 2 adjacent Region cards. (Setup exception: each of the 2 starting Settlements is dealt 3 Region cards.) |
| **Central** | City | 2 Grain, 3 Ore | Upgrades a Settlement. Grants 2 VP total, 4 Expansion slots total. |
| **Action** | Yellow | N/A | Played from hand, triggers an immediate effect, and is discarded to the discard pile. |
| **Expansion** | Green | Varies | Settlement/City Expansions. Permanent buildings or units. |
| **Expansion** | Red | Varies | City Expansions. Must be placed on City slots exclusively. |
| **Expansion** | Brown | Varies | Region Expansions. Placed above or below Region cards. |

---

## 3. The Game Loop (Turn Sequence)
Every player turn executes the following strict sequential phases:

**Phase 1: Roll Dice**
Roll both the Event Die (Symbol) and Production Die (Number 1-6).

**Phase 2: Action Phase**
The active player may perform the following actions infinitely and in any order: play cards, build, and trade. Demolishing own buildings or units is free and sends the respective cards to the discard pile.

**Phase 3: Check Hand Limit**
* Default hand limit is 3 cards.
* Limit increases by 1 for every Progress Point (Book symbol) owned.
* If the hand is below the limit, the player draws cards to match the limit. If the hand is above the limit, the player must discard cards under a draw deck to match the limit.

**Phase 4: Swap Card**
The player may optionally swap exactly 1 card.
* Free Swap: Place 1 card under a deck, then draw the top card of any deck.
* Paid Swap: Pay 2 identical resources (2 of a single resource type), place 1 card under a deck, then search any deck for a specific card.

---

## 4. Dice & Events Logic

### Event Die (Symbolwürfel) Evaluation
Evaluated strictly based on the rolled symbol.
* **Bandit (Red Club):** Triggers BEFORE the Production Die. Any player with strictly more than 7 total resources loses all Gold and Wool.
* **Trade (Scales):** The player possessing the Trade Token takes 1 resource of their choice from the opponent.
* **Tournament (Harp):** Each Knight carries a Tournament value in addition to its Strength value. The player with the strictly higher total Tournament Points (summed across their Knights) receives 1 free resource of their choice. (Tie handling is still to be specified — see `errors.txt`.) Note: not yet implemented — the engine currently treats this face as a generic "both receive gold" event keyed off Progress Points; see `errors.txt`.
* **Harvest (Sun):** Both players receive 1 free resource of their choice.
* **Event (?):** The active player draws and resolves the top card of the Event Deck.

### Production Die (Ertragswürfel) Evaluation
Number 1 through 6. Both players receive 1 resource on all regions matching the rolled number. This is handled AFTER the Event Die, unless the Bandit was rolled.

---

## 5. Economy & Trade Rates
* **Standard Trade:** Pay 3 identical resources to receive 1 resource of choice from the bank.
* **Improved Trade:** Pay 2 identical resources to receive 1 resource of choice. Requires owning a Trade Ship corresponding to the paid resource type.

---

## 6. Advantage State Machine
Advantage tokens dynamically shift between players based on points displayed on built expansion cards.

**Strength Advantage (Hero Token)**
* Condition: A player must have >= 3 Strength Points (Axe symbol) AND strictly greater Strength Points than the opponent.
* Reward: Grants 1 VP. 
* Loss Condition: Drops below 3 points or the opponent ties/exceeds the score.

**Commerce Advantage (Trade Token)**
* Condition: A player must have >= 3 Commerce Points (Scales symbol) AND strictly greater Commerce Points than the opponent.
* Reward: Grants 1 VP. 
* Loss Condition: Drops below 3 points or the opponent ties/exceeds the score.

---

## 7. Knight Stats

Each Knight (a Green Expansion) carries **two independent values** that must not be conflated:
* **Strength Points (Axe):** Count toward the Strength Advantage / Hero Token (§6).
* **Tournament Points:** Count **only** for the Tournament (Harp) event resolution (§4). These are distinct from Progress Points (Book), which increase the Hand Limit (§3) and have nothing to do with tournaments.

(Status: the Tournament value and the Tournament event are not yet implemented — see `errors.txt`. The per-Knight Tournament values still need to be supplied.)