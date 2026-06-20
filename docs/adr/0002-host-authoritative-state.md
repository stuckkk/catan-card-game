# Host-authoritative game state with projected state for the Guest

The Host's browser is the single source of truth for Game State. The Guest sends Action messages; the Host validates, applies, and broadcasts a Projected State (Host's Hand redacted) back. This was chosen over symmetric replication (both peers run the engine independently) because it avoids desync bugs and keeps the rules engine in one place. Trust-based broadcasting (no validation) was rejected because accidental divergence from bugs would be undetectable.
