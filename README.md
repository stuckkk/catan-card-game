# Catan: The Duel

A two-player digital adaptation of the Catan card game. Run the server on a machine you control; other devices connect to it over the network to create a lobby and play.

## Running the server

### Plain Node

```sh
npm ci
npm run build
npm start
```

The server listens on port 8080 by default (override with `PORT`) and serves both the game itself and the WebSocket multiplayer traffic on that one port. Point a browser at `http://<host>:8080`.

### Docker

```sh
docker build -t catan-card-game .
docker run -p 8080:8080 catan-card-game
```

## Environment variables

- `PORT` — port to listen on (default `8080`).
- `SESSION_IDLE_TIMEOUT_MS` — how long an in-memory session survives with nobody connected before it's dropped (default 30 minutes).

Sessions are held in memory only — restarting the server ends any in-progress games.

## Local development

Two terminals:

```sh
npm run dev          # Vite dev server with HMR, on :5173
npm run dev:server    # the real server, on :8080
```

Vite proxies `/ws` to the server (see `vite.config.ts`), so the app in the browser talks to one origin either way.

## Practice mode

The lobby's "Practice locally" option runs the game engine directly in the browser with no server involved — it works even if the server isn't running.

## Tests

```sh
npm test
```
