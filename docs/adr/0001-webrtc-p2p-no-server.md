# WebRTC peer-to-peer with no persistent server

The game is played entirely in the browser with no game server. The Host's browser runs the rules engine; the Guest connects directly via WebRTC. A public STUN server (no account required) handles NAT traversal. Signaling is done out-of-band: the Host shares an Invite Link containing the Offer Code; the Guest shares back an Answer Code via any channel (text, chat). This was chosen over managed backends (Firebase, Supabase, PartyKit) because the user has no server and wants zero sign-ups or third-party data storage.

## Considered Options

- **Firebase Realtime Database** — rejected: requires a Google account and stores game state on Google's infrastructure.
- **Supabase** — rejected: same concern, requires an account.
- **Self-hosted signaling server** — rejected: user has no server to host it on.

## Consequences

The Host's browser always holds the full Game State, including the Guest's Hand. This is an inherent property of the architecture and is accepted for a trust-based, friends-only game.
