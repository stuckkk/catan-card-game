# Hosted Node server as the rules-engine authority (replacing WebRTC P2P)

The game now runs as a Node server that a player runs on their own machine, serving the built frontend and handling all multiplayer traffic over a single WebSocket connection per client. The server itself — not either browser — runs the rules engine (`applyAction`, `createInitialState`, per-viewer state projection) and is the sole source of truth for Game State, held in memory. Both Host and Guest browsers are symmetric clients: they send Actions and render whatever state the server projects for them; neither runs the engine. Host and Guest remain distinct only at the lobby level (Host picks the VP target and gets the invite link/Room ID to share; Guest joins via it) — see CONTEXT.md.

This supersedes ADR-0001 (WebRTC/Trystero, no server) and ADR-0002 (Host-authoritative state): once a player is willing to run a server at all, the trade-offs that motivated peer-to-peer no longer apply, and the two prior decisions collapse into one — a server that's the whole point of running removes the need for both "no server" and "the Host's browser holds authority." It also removes the public BitTorrent-tracker signaling dependency ADR-0001 flagged as an accepted-but-unintended third party.

Persistence stays in-memory only (a `Map<roomId, Session>`), matching the project's existing "no game data stored" ethos — a server restart loses in-progress games. Reconnection uses a per-player opaque token issued at session creation/join (replacing WebRTC's peer-id-based reconnect), presented by the client after a page reload or transient network blip. A session with nobody connected is dropped after a 30-minute idle timeout to bound memory growth on a long-running host process; a connected player is never booted regardless of how long they take on their turn.

Practice (solo hot-seat) mode is unaffected by any of this — it keeps running the engine directly in the browser with no server involved at all, so it still works with the server not running.

## Consequences

- `trystero`/`@trystero-p2p/torrent` are removed; WebSocket (`ws`) replaces WebRTC as the transport.
- The static GitHub Pages deploy is dropped — the self-hosted server is now the only way to run the game, including Practice mode.
- `ProjectedState` generalizes from "Host's hand redacted, sent to the Guest" to a per-viewer projection (whichever player isn't the viewer has their hand redacted) — see `projectStateFor` in `src/engine/engine.ts`.
