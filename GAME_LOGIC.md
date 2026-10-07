# Catan Card Game: Rules Engine Specification

This is the **rulebook** for the app: the single source of truth for how the game behaves.

**Upstream source:** the German rulebook *Die Siedler von Catan – Das Kartenspiel* (Kosmos, Regelstand
Herbst 2005), kept locally as `rules_german_original.pdf` in the repo root (untracked: copyrighted; a scan
without a text layer). It matches the project owner's physical copy and is **authoritative**. References to
it are written `DE p.N`. The English rulebook *Catan Card Game* (Mayfair Games, 2005, local `rules.pdf`) is
a translation aid only; the older references `p.N` point into it. Where the two disagree, the German one
wins. Cards in the German text that belong to theme sets (Cannon, University, Metropolis) do not exist here.
Everything here follows the rulebook unless it is listed in **§12 Deviations & Additions**. Rules or cards
the engine does not support yet are listed in **§13 Not Yet Implemented**.

---

## 1. Victory

* **Players:** 2, alternating turns.
* **Target:** 12 VP (p.5, p.18). The target stays configurable per Session in the lobby (default 12;
  options 7 / 12 / 13), as the PDF suggests lower totals for new players (p.18 tip). See §12.
* **Win condition:** the game ends as soon as the **active player** has reached the target **during their
  own turn** (p.18). Victory is only checked for the active player; a player who reaches the target during
  the opponent's turn (e.g. a token changing hands) wins if they still have it during their own turn.

**VP sources:**
* Settlement: 1 VP. City: 2 VP (replaces the Settlement's VP).
* Knight Token: 1 VP. Windmill Token: 1 VP (§7).
* City Expansions with the VP shield: Aqueduct, Bath House, Church, Library, Town Hall 1 VP each;
  The Colossus of Catan 2 VP.

---

## 2. Components

### Resources & Regions (p.6)
| Region | Resource |
| :--- | :--- |
| Forest | Lumber |
| Pasture | Wool |
| Hills | Brick |
| Mountains | Ore |
| Fields | Grain |
| Gold Field | Gold |

A **Region** card is its own resource counter: it stores **0–3** resources (rotated to show the count).
Gaining rotates up, spending rotates down. A resource that would exceed 3 is **lost** (Overflow); it can
never be moved to another region of the same type (p.10–11). Resources spent or gained may come from /
go to any region(s) of the matching type.

Each Region carries a **production number** (1–6). The two starting sets differ (read from the picture on
DE p.2): Player A (white-red crest, the host) Fields 1, Mountains 2, Pasture 3, Forest 4, Hills 5, Gold
Field 6; Player B (black-red crest, the guest) Fields 2, Mountains 3, Pasture 4, Forest 5, Hills 6, Gold
Field 1. The PDF does not list the Region stack's numbers; the app uses the set in §12.

### Card supply (p.2–3)
* **Starting set** (one per player, 9 cards): 1 Road, 2 Settlements, 6 Regions (one of each resource).
* **Development stacks** (shared, open supply): **7 Roads, 5 Settlements, 7 Cities**, and the
  **Region stack** of **11 Regions** (2 each of Forest, Pasture, Hills, Mountains, Fields; 1 Gold Field),
  shuffled face-down. When a supply stack is empty, that thing can no longer be built.
* **Event deck:** 10 Event Cards (blue text fields), shuffled face-down. Not drawn into hands.
* **Expansion Cards:** 62 cards (yellow Action Cards, green Region Expansions, red City Expansions),
  shuffled together and split into **5 face-down expansion stacks** of roughly equal size. Draws are
  type-blind.
* **Discard pile:** played Action Cards and demolished/destroyed expansions go here, out of play.

---

## 3. Setup (p.3–5)

1. Each player gets their starting set. The Road sits in the middle with a Settlement at each end; the 6
   starting Regions are arranged **in any order the player chooses** on the six corner spaces (3 above,
   3 below the axis). Every starting Region holds **1** resource (so each player starts with 1 of each).
2. Determine the first player (PDF: highest Production Die roll; app: random, see §12).
3. The **first player** chooses one expansion stack, looks through it **without changing its order**, and
   takes **3** cards of their choice into hand. Then the **second player** does the same with a
   **different** stack. Stacks are returned without shuffling.
4. Starting score: 2 VP each (two Settlements).

---

## 4. The Principality (p.7, p.11–14)

* **Central axis:** alternating Settlements/Cities and Roads, extended to the **left or right**.
* **Roads** cost 2 Brick + 1 Lumber. A Road is placed directly left or right of one of your Settlements or
  Cities; **two Roads may never be adjacent**.
* **Settlements** cost 1 each of Wool, Lumber, Brick, Grain. A Settlement must be placed at the open end of
  a Road (never next to another Settlement/City).
  * Every Settlement has a Region at each of its 4 diagonal corners. Neighbouring Settlements share the
    two Regions above and below the Road between them. A new Settlement therefore needs **2 new Regions**
    (on its outer side): take the **top 2 cards of the Region stack**; new Regions start at **0**.
    *Scout* (§9) lets you choose them instead.
* **Cities** cost 3 Ore + 2 Grain and are placed on top of an existing Settlement (the Settlement no longer
  counts for anything). City = 2 VP total.
* **Building sites:** a Settlement has **2** (1 above, 1 below); a City has **4** (2 above, 2 below).
  Green Region Expansions go on any building site of a Settlement or City; red City Expansions go only on a
  City's building sites.
* **Neighbouring regions of a building site:** a site above the axis borders the Settlement/City's two
  **upper** Regions; a site below borders its two **lower** Regions. In a City both upper sites (and both
  lower sites) are equivalent.
* **Demolish:** during your turn you may discard any of your own Region/City Expansions to the discard pile.
  No resources are refunded.

---

## 5. Turn Sequence (p.8, p.32)

1. **Roll both dice.** Resolve the **Event Die first**, then:
2. **Production:** every Region (both players) whose number matches the Production Die gains 1 resource.
   Production happens after **every** event, including the Brigand Attack.
3. **Actions**, any number, any order: build, trade, play Action Cards.
4. **Draw / hand limit** (§8).
5. **Pass the dice.**

---

## 6. Event Die (p.9–10)

Six faces; the Event Card face (`?`) appears **twice** (see §12). All events affect both players.

* **Brigand Attack (club):** each player counts the resources on all their Regions, **not counting Regions
  next to one of their Garrisons**. A player with **more than 7** counted resources loses **all Ore and
  all Wool** — from every region, protected ones included. **No Brigand Attacks in the first two turns of
  each player**: the result is ignored (no re-roll) until the first player's third turn.
* **Trade Advantage / Commerce (windmill):** the Windmill Token holder takes any 1 resource of their choice
  from the opponent. No holder → nothing happens.
* **Tournament (knight's head):** the player with the strictly higher total **Tournament Points** (red
  number on their Knights) receives 1 resource of their choice. Tie (incl. 0–0) → nobody.
* **Year of Plenty (sun):** each player receives 1 resource of their choice.
* **Event Card (?):** reveal the top Event Card, resolve it for both players (§10), then put it face-down at
  the **bottom** of the event deck.

---

## 7. Special Victory Points (p.8–9, p.15)

Tokens are recomputed whenever the board changes; they move freely between players. On a tie the token goes
back to the middle (nobody holds it).

* **Knight Token (1 VP):** held by the player with strictly more **Strength Points** (black number by the
  iron fist on their Knights, plus Smithy bonus). No minimum.
* **Windmill Token (1 VP):** held by the player with strictly more **Commerce Points** (windmill icons)
  **who also has at least one City**. If the player with more Commerce Points has no City, nobody holds it.

---

## 8. Hand Limit & Drawing (p.9, p.17–18)

* **Hand limit** = 3, +1 per **Abbey**, +1 per **Library** in your principality.
* At step 4 of your turn:
  * **Hand above the limit:** put the excess cards face-down under expansion stack(s) of your choice.
  * **Hand below the limit:** draw until you reach it. **Each** card is drawn one of two ways:
    1. **Random draw:** top card of any expansion stack, free.
    2. **Search:** pay **any 2 resources** (any mix; **1** with a Town Hall), choose one stack, look through
       it without changing its order, take any 1 card.
  * **Exchange:** only if your hand was **at or above** the limit when step 4 began (so you did not draw):
    after discarding down to the limit you may put 1 more card under a stack and take a new card **from that
    same stack**, either the top card (free) or by searching it (paid as above).
* Cards gained during the turn are not played until a later turn (the turn ends after step 4).
* **Outside your turn:** if an effect raises your hand above your limit, immediately put the excess under
  stack(s) of your choice (DE p.11), e.g. a Knight returned by the opponent's Black Knight. Losing an
  Abbey/Library likewise forces an immediate discard down. The active player instead checks the limit
  at step 4 of their turn as usual.
* **Civil War** (DE p.6): after it resolves, **both** players — the roller too — immediately put any cards
  above their limit under stack(s) of their choice (roller first).
* If every expansion stack is empty, drawing stops.

---

## 9. Trading & Action Cards (p.16–17)

* **Bank trade:** pay 3 of one resource for 1 of your choice. **Trade Fleet:** 2:1 for its resource (a
  second copy adds nothing). **Mint:** Gold 1:1. Paid resources may come from several regions.
* **Trade with the opponent:** any terms both agree on. Only the active player offers trades, at any time
  during their turn (DE p.10).
* **Action Cards** (yellow) cost nothing to play and go to the discard pile afterwards.
  * They can only be played once the **combined VP of both players is at least 7**.
    *Exception:* Scout may always be played when building a Settlement.
  * Unless the card says otherwise, they are played after the dice have been resolved.
  * An Action Card may only be played if its action can be carried out (DE p.11).
  * Counter cards (Bishop, Herb Woman) are played in reaction during the opponent's turn.
* **Attack duel** (Black Knight, Arsonist, Brigands): after the attack card is played, the defender is
  **always** asked whether to play the counter card (so the pause reveals nothing about their hand). Then
  the attacker rolls one die (1–6) and wins on 1–5, or only on 1–2 if the counter card was played (DE
  p.12–13). The loser pays what the card says: a Knight or Building chosen by the winner goes back to
  hand (exactly one eligible card → it returns without a choice), or the winner steals 2 resources.
  Until the attack is resolved the attacker can do nothing else.

---

## 10. Card Almanac (p.19–30)

Costs: L = Lumber, W = Wool, B = Brick, O = Ore, G = Grain, Au = Gold. Costs were read from the card
icons and confirmed by the project owner against the physical cards. The counts (#) were checked against
DE p.2, p.12–16. "Impl." = implemented in the engine.

### Action Cards (yellow, no cost, 20)
| Card | # | Effect | Impl. |
| :--- | :-: | :--- | :-: |
| Alchemist | 2 | Play **before** your roll: choose the Production Die result; then roll the Event Die normally (event still resolves first). | ✔ |
| Arsonist | 2 | Playable only if the opponent has a Building. Roll (§9): 1–5 the opponent returns a Building of your choice to hand; 6 you return a Building of their choice (none → nothing happens). A Building is any placed expansion except Knights and Fleets; a Church does not protect. The defender discards over-limit cards immediately (§8), e.g. after losing an Abbey/Library. Counter: Bishop (DE p.12). | ✔ |
| Bishop | 2 | Counter vs. Arsonist/Brigands, played when attacked, before the roll: the attacker now loses on 3–6. Cannot be played otherwise (DE p.12). | ✔ |
| Black Knight | 3 | Playable only if the opponent has a Knight. Roll (§9): 1–5 the opponent returns a Knight of your choice to hand; 6 you return a Knight of their choice (none → nothing happens). Any Knight can be chosen (a Church does not protect). The defender discards over-limit cards immediately (§8) (DE p.13). | ✔ |
| Brigands | 1 | Playable only if the opponent has a resource you have room for. Roll (§9): 1–5 you steal 2 resources of your choice from the opponent; 6 they steal 2 from you. The winner picks one at a time (the same type twice is allowed), only types the loser holds and the winner has room for; fewer available → take what's possible. Counter: Bishop (DE p.13). | ✔ |
| Caravan | 1 | Trade in up to 2 of your resources for the same number of other resources of your choice. | ✔ |
| Herb Woman | 2 | Counter vs. Black Knight, played when attacked, before the roll: the attacker now loses on 3–6. Cannot be played otherwise (DE p.12). | ✔ |
| Merchant | 2 | Take up to 2 resources of your choice from the opponent, then give them 1 resource of your choice (may be one just taken). Both players need room on their Regions for what they receive (DE p.12). | ✔ |
| Scout | 2 | Play when building a Settlement: choose its 2 Regions from the Region stack, then reshuffle the stack. Playable below 7 combined VP. | ✔ |
| Spy | 3 | The opponent shows you their whole hand; take 1 Unit (Knight/Fleet) or Action card of your choice into your hand. You may build or play it in the same action phase (paying as usual) or keep it. Always playable (the hand is hidden); with no Unit or Action card in it the Spy is used up without effect. No counter card, no roll (DE p.13). | ✔ |

### Event Cards (blue, 10)
| Card | # | Effect | Impl. |
| :--- | :-: | :--- | :-: |
| Civil War | 1 | Each player returns 1 Knight or Fleet to hand; **the opponent chooses which** (roller chooses first). Units in a City with a Church cannot be chosen. No eligible unit → unaffected; exactly 1 → it returns without a choice. Then both players discard down to their hand limit immediately (§8). The returned card is an ordinary hand card and may be rebuilt (DE p.6, p.13). | ✔ |
| Conflict | 1 | The Knight Token holder looks at the opponent's hand, picks 2 cards (fewer if they hold fewer) and puts both under one stack of their choice. No Token holder → no effect. The victim refills only at the end of their own turn (§8) (DE p.14). | ✔ |
| Master Builder | 1 | The roller, then the opponent, must look through one non-empty stack (free, order unchanged; the opponent's must differ from the roller's). Each may take 1 card from it and then put 1 hand card (possibly the one just taken) face down under any stack, or take nothing. The hand size never changes. No eligible stack → that player is skipped (DE p.13). | ✔ |
| Plague | 2 | Every Region bordering a City loses 1 resource (once, even if it borders 2 Cities). Counter: Bath House, Aqueduct. | ✔ |
| Productive Year | 2 | Every Region bordering a Garrison gains 1 resource per bordering Garrison (cap 3). | ✔ |
| Progress | 2 | Each player gains 1 resource of their choice per Abbey and Library they own (roller chooses first). | ✔ |
| Year End | 1 | Reshuffle the whole event deck (including Year End). | ✔ |

### Region Expansions (green, Settlement or City, 26)
| Card | # | Cost | Points | Effect |
| :--- | :-: | :--- | :--- | :--- |
| Abbey | 2 | L O B | – | Hand limit +1. |
| Garrison | 3 | L B | 1 Commerce | Its 2 neighbouring Regions are not counted for the Brigand Attack. |
| Smithy | 1 | 2O L | – | +1 Strength for each of your Knights. |
| Brick Factory | 1 | B O | – | Neighbouring Hills produce 2 instead of 1 on their number (cap 3). |
| Foundry | 1 | B O | – | Same for neighbouring Mountains. |
| Grain Mill | 1 | G B | – | Same for neighbouring Fields. |
| Sawmill | 1 | 2L | – | Same for neighbouring Forests. |
| Woolen Mill | 1 | B W | – | Same for neighbouring Pastures. |
| Brick / Gold / Grain / Lumber / Ore / Wool Fleet | 1 each | W L | 1 Commerce | 2:1 trade for its resource. |

**Knights** (Units, 1 each): Strength (black, iron fist) / Tournament (red, helmet).
| Knight | Cost | Strength | Tournament |
| :--- | :--- | :-: | :-: |
| Conrad the Swift | G O | 2 | 1 |
| Falk the Fair | 2G 2O W | 1 | 5 |
| Gotz Ironfist | 2G 2O 2W | 5 | 2 |
| Hagen the Sinister | G O | 1 | 2 |
| Karl the Strong | 2G 2O 3W | 7 | 1 |
| Otto the Berserker | G 2O W | 3 | 2 |
| Pippin the Short | G O W | 1 | 3 |
| Siegfried Lackland | O | 1 | 1 |
| Walter the Recreant | G O W | 3 | 1 |

Buildings vs Units: Knights and Fleets are **Units**; everything else is a **Building**.

### City Expansions (red, City only, 16)
| Card | # | Cost | Points | Effect |
| :--- | :-: | :--- | :--- | :--- |
| Aqueduct | 2 | 2L 2O 2B | 1 VP | All your Regions are immune to Plague. |
| Bath House | 2 | 2B O W | 1 VP | The 4 Regions bordering its City are immune to Plague (also a Region shared with a neighbouring City). |
| Church | 2 | 2O 2G B | 1 VP | Knights/Fleets on its City's building sites cannot be chosen for Civil War (DE p.15). |
| The Colossus of Catan | 1 | 3O 3B 3G | 2 VP | – |
| Counting House | 1 | 2W G B | 3 Commerce | – |
| Harbor | 1 | O W B | 1 Commerce | Each of your Trade Fleets gives +1 Commerce. |
| Library | 2 | 2L 2O B | 1 VP | Hand limit +1. |
| Marketplace | 1 | G W | 2 Commerce | – |
| Merchant Guild | 1 | 3W 2B G | 4 Commerce | – |
| Mint | 1 | 2L 2O 2B | 1 Commerce | Trade Gold 1:1. |
| Town Hall | 2 | 2W 2O B | 1 VP | A search costs 1 resource instead of 2 (more Town Halls: no further reduction). |

**Production doubling detail (p.26):** a doubled Region that already holds 2 gains only 1; nothing exceeds 3.

---

## 11. Engine Notes

* Event Cards are resolved by the engine for both players; resource choices are queued as pending choices,
  the roller's first.
* Hidden information: each viewer receives a projection with the opponent's hand as a count, every stack
  as a count, and the Region stack as its sorted composition; a stack being searched is revealed to the
  searcher only, and the opponent's hand to the player picking from it (Spy, Conflict).
* Region adjacency is explicit: each Settlement/City lists its 4 corner Regions as
  `[topLeft, bottomLeft, topRight, bottomRight]`; neighbours share the corners between them.

---

## 12. Deviations & Additions (not from the PDF)

* **VP target** configurable in the lobby (7 / 12 / 13, default 12).
* **First player** is chosen at random instead of by a die roll.
* **Event die:** the `?` face appears twice (the PDF lists five events but not the face distribution).
* **Region stack production numbers** (the PDF does not list them; the starting sets are in §2):
  Fields 3 & 5, Mountains 4 & 6, Pasture 1 & 5, Forest 2 & 6, Hills 3 & 4, Gold Field 2.
* **Harbor:** follows the card text (Harbor 1 Commerce + 1 per Fleet); the almanac example (3 Fleets +
  Harbor = 6) omits the Harbor's own point.
* **Garrison** gives 1 Commerce Point (windmill icon on the card; not mentioned in the almanac text).
* **New Regions without a Scout:** the first card drawn goes above, the second below (the PDF lets the
  player choose the side after drawing the first).
* **Practice mode** (local, no server) is a hot-seat game: the screen always shows the seat that has to act.

---

## 13. Not Yet Implemented

* The player cannot yet choose which Region receives or gives up resources that do not come from the
  Production Die; the engine uses the first matching Region.