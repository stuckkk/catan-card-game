# WebRTC peer-to-peer via Trystero (no game server)

The game is played entirely in the browser with no game server of our own. The Host's browser runs the rules engine; the two browsers connect directly over a WebRTC data channel for all gameplay traffic. Connection setup (signaling) and NAT traversal are handled by [Trystero](https://github.com/dmotz/trystero) using its BitTorrent-tracker strategy (`@trystero-p2p/torrent`): both peers join a shared, randomly generated Room ID and are introduced to each other through public BitTorrent trackers. The Host shares an Invite Link containing the Room ID in the URL hash (`#join=<roomId>`); the Guest opens the link (or pastes the Room ID) and is connected automatically — there is no manual Offer/Answer code exchange.

This was chosen over managed backends (Firebase, Supabase, PartyKit) because the user has no server to run and wants no sign-ups and no game data stored on our own infrastructure.

## Considered Options

- **Manual WebRTC signaling** (Host pastes an Offer Code, Guest pastes back an Answer Code, public STUN for NAT traversal) — rejected: clunky two-way copy/paste UX. This was an earlier design and is no longer how the game connects.
- **Firebase Realtime Database** — rejected: requires a Google account and stores game state on Google's infrastructure.
- **Supabase** — rejected: same concern, requires an account.
- **Self-hosted signaling server** — rejected: user has no server to host it on.

## Consequences

- Gameplay data flows directly peer-to-peer over the WebRTC data channel and never passes through a third-party server.
- Connection *signaling* does rely on public BitTorrent trackers (a third party) to introduce the two peers. No game state passes through them, but this is a third-party dependency with privacy and availability implications that the original "zero third parties" framing did not anticipate. Accepted for a trust-based, friends-only game.
- The Host's browser always holds the full Game State, including the Guest's Hand. This is inherent to the host-authoritative architecture (see ADR-0002) and is accepted for a friends-only game.
