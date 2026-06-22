# Catan: The Duel

A two-player digital adaptation of the Catan card game, playable online via WebRTC peer-to-peer in any modern browser.

## Language

### Players & Session

**Session**: A single playthrough of the game between two players, from lobby creation to victory. The two browsers connect by joining a shared Room ID via Trystero (WebRTC over public BitTorrent-tracker signaling).
_Avoid_: Game, match, room

**Host**: The player who created the Session and runs the authoritative rules engine locally in their browser. Owns the canonical Game State.
_Avoid_: Server, player 1, creator

**Guest**: The player who joined the Session via an Invite Link. Receives a Projected State from the Host and sends Actions to the Host for validation.
_Avoid_: Client, player 2, joiner

**Invite Link**: A URL containing the Room ID in the URL hash (`#join=<roomId>`). Shared out-of-band (e.g. WhatsApp, text). Opening it auto-joins the Guest to the Session; no game state passes through a server.
_Avoid_: Game link, share link, join link

**Room ID**: The randomly generated identifier both peers use to find each other through Trystero's BitTorrent trackers. Embedded in the Invite Link and also accepted as a manually pasted code in the lobby.
_Avoid_: Offer code, answer code, room code, lobby id

**Projected State**: The full Game State with the Host's Hand redacted (replaced by a count), sent to the Guest after each state change. The Guest's Hand is always visible to the Host.
_Avoid_: Client state, guest state, masked state

### Board Structure

**Principality**: One player's complete board — their Central Axis, all placed Regions, and all placed Expansion Cards. Each player has their own Principality.
_Avoid_: Board, field, territory

**Central Axis**: The horizontal sequence of alternating Roads and Settlement/City slots that forms the spine of a Principality.
_Avoid_: Main row, road track

**Settlement**: A Central Axis card worth 1 VP that grants 2 Expansion Slots and 2 adjacent Region slots.
_Avoid_: Village, town

**City**: A Central Axis card that upgrades a Settlement, worth 2 VP total and granting 4 Expansion Slots and 2 adjacent Region slots.
_Avoid_: Town, upgrade

**Road**: A Central Axis card that connects Settlements and is required before a new Settlement can be built at that position.
_Avoid_: Path, connection

**Region**: A terrain card placed diagonally adjacent to a Settlement or City. Produces 1 Resource when its Production Number is rolled. Tracks stored resources internally (0–3 capacity).
_Avoid_: Terrain, land, tile

**Production Number**: The number (1–6) printed on a Region card that determines which die result triggers its production.
_Avoid_: Region number, die number

**Expansion Slot**: An open space above or below a Settlement or City where a Green or Red Expansion Card can be placed. Settlements have 2; Cities have 4.
_Avoid_: Building slot, card slot

### Cards

**Hand**: The set of cards currently held by a player, kept secret from the opponent. Subject to the Hand Limit.
_Avoid_: Cards, deck hand

**Hand Limit**: The maximum number of cards a player may hold at end of turn. Defaults to 3, increased by 1 per Progress Point owned.
_Avoid_: Card limit, hand size

**Action Card**: A yellow card played from Hand during the Action Phase that triggers an immediate effect and is then discarded.
_Avoid_: Yellow card, event card, instant card

**Green Expansion**: A permanent card placed in an Expansion Slot of a Settlement or City.
_Avoid_: Settlement expansion, green card

**Red Expansion**: A permanent card placed in an Expansion Slot of a City only.
_Avoid_: City expansion, red card

**Brown Expansion**: A permanent card placed above or below a Region card.
_Avoid_: Region expansion, brown card

**Event Card**: A card drawn from the Event Deck when the "?" symbol is rolled on the Event Die.
_Avoid_: Mystery card, random card

### Resources & Economy

**Resource**: One of six commodities — Wood, Wool, Gold, Brick, Ore, Grain — stored on Region cards or spent to build and buy.
_Avoid_: Material, commodity, goods

**Standard Trade**: Paying 3 identical Resources to receive 1 Resource of choice from the bank.
_Avoid_: 3:1 trade, basic trade

**Improved Trade**: Paying 2 identical Resources to receive 1 Resource of choice, enabled by owning the corresponding Trade Ship.
_Avoid_: 2:1 trade, ship trade

**Overflow**: A Resource gained when a Region is at full capacity (3) is permanently lost.
_Avoid_: Discard, waste, cap

### Points & Advantages

**Victory Points (VP)**: The win condition currency. Target is configurable per Session (default 12).
_Avoid_: Points, score

**Strength Points**: Points from the Axe symbol on Expansion Cards, determining eligibility for the Hero Token.
_Avoid_: Combat points, attack points, axes

**Commerce Points**: Points from the Scales symbol on Expansion Cards, determining eligibility for the Trade Token.
_Avoid_: Trade points, merchant points

**Progress Points**: Points from the Book symbol on Expansion Cards, each increasing the Hand Limit by 1.
_Avoid_: Science points, book points

**Tournament Points**: The Tournament value carried by Knight cards (separate from their Strength value). At the Tournament (Harp) event, the player with the strictly higher total Tournament Points chooses 1 free resource. Distinct from Strength Points and Progress Points.
_Avoid_: Skill points, festival points

**Hero Token**: The Strength Advantage marker. Grants 1 VP to the player with ≥3 Strength Points and strictly more Strength Points than the opponent.
_Avoid_: Strength token, strength advantage, knight token

**Trade Token**: The Commerce Advantage marker. Grants 1 VP to the player with ≥3 Commerce Points and strictly more Commerce Points than the opponent.
_Avoid_: Commerce token, merchant token, commerce advantage

### Turn Structure

**Action Phase**: The open-ended middle phase of a turn where the active player may play Action Cards, build structures, and trade in any order and any number of times.
_Avoid_: Main phase, play phase

**Production Roll**: The result of the number die (1–6), triggering Resource production on all matching Regions for both players. Processed after the Event Roll unless the Bandit was rolled.
_Avoid_: Number roll, die roll

**Event Roll**: The result of the symbol die (Bandit, Trade, Tournament, Harvest, or Event). Processed before the Production Roll; if Bandit is rolled, it replaces the Production Roll.
_Avoid_: Symbol roll, special die

**Swap**: The optional end-of-turn action allowing a player to exchange 1 card from their Hand. Free Swap places a card under a deck and draws the top of any deck. Paid Swap costs 2 Resources and allows searching a deck for a specific card.
_Avoid_: Exchange, trade cards, card swap

### Card Effects

**Declarative Effect**: A card effect expressed as structured data (e.g. grant points, grant resources, modify hand limit). Interpreted by the rules engine without custom code.
_Avoid_: Data effect, static effect

**Custom Effect**: An escape-hatch code function attached to a card for effects too complex to express declaratively. Takes Game State and returns a new Game State.
_Avoid_: Imperative effect, code effect, programmatic effect
