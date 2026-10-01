# Catan Card Game

A two-player digital adaptation of the Catan Card Game (Mayfair, 2005; rulebook in local `rules.pdf`, spec in `GAME_LOGIC.md`), playable online by connecting to a server hosted on someone's own machine.

## Language

### Players & Session

**Session**: A single playthrough of the game between two players, from lobby creation to victory. Both browsers connect to the server over a WebSocket, identified by a shared Room ID; the server runs the authoritative rules engine and is the sole source of truth for the Session's Game State.
_Avoid_: Game, match, room

**Host**: The player who created the Session, choosing its Victory Point target and receiving the Invite Link to share. Symmetric with the Guest for all in-game actions — the server runs the rules engine, not the Host's browser.
_Avoid_: Server, player 1, creator

**Guest**: The player who joined the Session via an Invite Link or Room ID. Symmetric with the Host for all in-game actions — receives a Projected State from the server and sends Actions to the server for validation.
_Avoid_: Client, player 2, joiner

**Invite Link**: A URL containing the Room ID in the URL hash (`#join=<roomId>`), issued by the server at Session creation. Shared out-of-band (e.g. WhatsApp, text). Opening it auto-joins the Guest to the Session.
_Avoid_: Game link, share link, join link

**Room ID**: The short, server-generated identifier for a Session. Embedded in the Invite Link and also accepted as a manually pasted code in the lobby.
_Avoid_: Offer code, answer code, room code, lobby id

**Projected State**: The full Game State with the *other* player's Hand redacted (replaced by a count), sent by the server to each viewer after every state change. A player's own Hand is always visible to them.
_Avoid_: Client state, guest state, masked state

### Board Structure

**Principality**: One player's complete board — their Central Axis, all placed Regions, and all placed Expansion Cards. Each player has their own Principality.
_Avoid_: Board, field, territory

**Central Axis**: The horizontal sequence of alternating Roads and Settlement/City slots that forms the spine of a Principality.
_Avoid_: Main row, road track

**Settlement**: A Central Axis card worth 1 VP with 2 Building Sites and a Region at each of its 4 diagonal corners (shared with a neighbouring Settlement across a Road).
_Avoid_: Village, town

**City**: A Central Axis card placed on a Settlement, worth 2 VP total, with 4 Building Sites.
_Avoid_: Town, upgrade

**Road**: A Central Axis card placed beside a Settlement/City; required before a new Settlement can be built at its open end. Two Roads are never adjacent.
_Avoid_: Path, connection

**Region**: A terrain card (Forest, Pasture, Hills, Mountains, Fields, Gold Field) at a Settlement/City corner. Produces 1 Resource when its Production Number is rolled. Stores 0–3 resources itself.
_Avoid_: Terrain, land, tile, meadow, river, clay pit

**Production Number**: The number (1–6) printed on a Region card that determines which die result triggers its production.
_Avoid_: Region number, die number

**Building Site**: A space above or below a Settlement or City where a Region or City Expansion can be placed. Settlements have 2; Cities have 4. A site borders the two Regions on its side of the axis. (Code: `expansionSlots`.)
_Avoid_: Expansion slot, building slot, card slot

### Cards

**Hand**: The set of cards currently held by a player, kept secret from the opponent. Subject to the Hand Limit.
_Avoid_: Cards, deck hand

**Hand Limit**: The number of cards a player holds at end of turn. 3, +1 per Abbey and per Library.
_Avoid_: Card limit, hand size

**Expansion Card**: Any card of the 5 shuffled expansion stacks: Action Cards, Region Expansions and City Expansions.
_Avoid_: Hand card, draw card

**Action Card**: A yellow card played from Hand that triggers an immediate effect and is then discarded. Playable only once both players together have ≥7 VP (Scout excepted).
_Avoid_: Yellow card, event card, instant card

**Region Expansion**: A green permanent card placed on a Building Site of a Settlement or City. Either a Building or a Unit (Knight, Trade Fleet).
_Avoid_: Green expansion, settlement expansion, green card

**City Expansion**: A red permanent card placed on a Building Site of a City only. Always a Building.
_Avoid_: Red expansion, red card

**Building / Unit**: Expansion subtypes. Knights and Trade Fleets are Units; everything else is a Building.
_Avoid_: Structure, troop

**Counter Card**: An Expansion Card (shield symbol) that protects against an attack or event, e.g. Garrison, Bath House, Bishop.
_Avoid_: Defense card, blocker

**Development Cards**: The shared supply stacks of Roads (7), Settlements (5), Cities (7) and the Region stack (11).
_Avoid_: Building deck, bank cards

**Event Card**: A blue card from the Event Deck, revealed when "?" is rolled, resolved for both players, then put under the Event Deck.
_Avoid_: Mystery card, random card

### Resources & Economy

**Resource**: One of six commodities — Lumber, Wool, Brick, Ore, Grain, Gold — stored on Region cards or spent to build.
_Avoid_: Material, commodity, goods, wood

**Standard Trade**: Paying 3 identical Resources to receive 1 Resource of choice from the bank.
_Avoid_: 3:1 trade, basic trade

**Improved Trade**: Paying 2 identical Resources to receive 1 Resource of choice, enabled by owning the corresponding Trade Fleet (Mint: Gold 1:1).
_Avoid_: 2:1 trade, ship trade, trade ship

**Overflow**: A Resource gained when a Region is at full capacity (3) is permanently lost.
_Avoid_: Discard, waste, cap

### Points & Advantages

**Victory Points (VP)**: The win condition currency. Target is configurable per Session (default 12).
_Avoid_: Points, score

**Strength Points**: The black number by the iron fist on Knights (plus Smithy bonus), deciding the Knight Token.
_Avoid_: Combat points, attack points, axes

**Commerce Points**: Windmill icons on Expansion Cards (Fleets, Garrison, Marketplace, …), deciding the Windmill Token.
_Avoid_: Trade points, merchant points, scales

**Tournament Points**: The red number by the helmet on Knights (separate from Strength). At the Tournament event, the player with the strictly higher total chooses 1 free resource; a tie gives nobody anything.
_Avoid_: Skill points, festival points, harp event

**Knight Token**: 1 VP marker held by the player with strictly more Strength Points (tie: nobody).
_Avoid_: Hero token, strength token, strength advantage

**Windmill Token**: 1 VP marker held by the player with strictly more Commerce Points who also has at least one City (otherwise nobody).
_Avoid_: Trade token, commerce token, merchant token

### Turn Structure

**Action Phase**: The open-ended middle phase of a turn where the active player may play Action Cards, build structures, and trade in any order and any number of times.
_Avoid_: Main phase, play phase

**Setup Phase**: Before the first turn: both players may rearrange their 6 starting Regions, then the first player and then the second pick 3 starting cards from different expansion stacks.
_Avoid_: Pre-game, lobby phase

**Production Roll**: The result of the number die (1–6), triggering Resource production on all matching Regions for both players. Always processed after the Event Roll.
_Avoid_: Number roll, die roll

**Event Roll**: The result of the Event Die (Brigand Attack, Commerce, Tournament, Year of Plenty, or Event Card on two faces). Processed before the Production Roll.
_Avoid_: Symbol roll, special die

**Brigand Attack**: Event-die result: a player with more than 7 resources (not counting Regions next to their Garrisons) loses all Ore and Wool. Ignored in each player's first two turns.
_Avoid_: Bandit, robber

**Year of Plenty**: Event-die result: each player gains 1 resource of choice.
_Avoid_: Harvest, sun event

**Draw Phase**: Step 4 of a turn: discard down to the Hand Limit (under stacks) or draw up to it. Each draw is a Random Draw (free top card) or a Search.
_Avoid_: Hand check, refill

**Search**: Paying any 2 Resources (1 with a Town Hall) to look through one expansion stack in order and take any card from it.
_Avoid_: Paid swap, paid draw

**Exchange**: Optional, only when the hand was already at the limit: put 1 card under a stack and take a new one from that same stack (top card or Search).
_Avoid_: Swap, trade cards, card swap

### Card Effects

**Declarative Effect**: A card effect expressed as structured data (e.g. grant points, grant resources, modify hand limit). Interpreted by the rules engine without custom code.
_Avoid_: Data effect, static effect

**Custom Effect**: An escape-hatch code function attached to a card for effects too complex to express declaratively. Takes Game State and returns a new Game State.
_Avoid_: Imperative effect, code effect, programmatic effect
