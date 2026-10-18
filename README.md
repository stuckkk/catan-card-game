# Catan Card Game

A two-player digital adaptation of the Catan Card Game (*Die Siedler von Catan – Das Kartenspiel*, Kosmos 2005; English edition by Mayfair Games). You run the server on a machine you control, and both players connect to it from a browser on their phone or computer. The UI is available in English and German.

**Play online:** a hosted instance runs at **<https://catan-card-game.onrender.com/>**. It is on Render's free tier, so the first visit after a quiet spell can take up to a minute while the server wakes up, and a game in progress is lost when the server goes to sleep or is redeployed. To run your own, see [Running the server](#running-the-server).

The rules the app implements are specified in [`GAME_LOGIC.md`](GAME_LOGIC.md).

> This is an unofficial fan project. It is not affiliated with or endorsed by Catan GmbH, Kosmos or Mayfair Games. CATAN is a trademark of Catan GmbH.

## Requirements

- Node.js 22 (the version the Docker image uses), or Docker

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

### Environment variables

- `PORT`: port to listen on (default `8080`).
- `SESSION_IDLE_TIMEOUT_MS`: how long an in-memory session survives with nobody connected before it's dropped (default 30 minutes).

Sessions are held in memory only, so restarting the server ends any in-progress games. `GET /healthz` returns `200 ok` and can be used for container or proxy health checks.

### Exposing the server

The server has no accounts or authentication: anyone who can reach the port can create or join a game. If you put it on the internet, run it behind a reverse proxy with TLS. The client switches to `wss://` automatically when the page is served over HTTPS; make sure the proxy forwards WebSocket upgrades on `/ws`.

### Deploying on Render

[Render](https://render.com) can run the server straight from this repository, with TLS and WebSockets included, so no proxy setup is needed.

1. Under **Account Settings → Git Deployment Credentials**, connect GitHub and install the Render GitHub App for the repository. Connecting the repo as a "Public Git Repository" URL works too, but then Render gets no webhook and **does not auto-deploy** on push.
2. Create a **Web Service** from the repository. Render detects the `Dockerfile` and builds the image from it. Leave `PORT` unset; Render provides it and the server reads it.
3. Under **Settings**:
   - set the branch to `main` and **Auto-Deploy** to "On Commit";
   - set **Health Check Path** to `/healthz`.
4. The game is then live at `https://<service-name>.onrender.com`. The invite links use that address.

On the free instance type the service goes to sleep after about 15 minutes without traffic, and the first request after that takes up to a minute to wake it. Since sessions are only held in memory, going to sleep or deploying again ends any game in progress.

## How to play

1. Open the server in a browser and choose **Create Game**. Pick a victory point target (7, 12 or 13; the rulebook uses 12).
2. Share the invite link with your opponent. Opening it joins the game automatically; alternatively they can paste the room code under **Join Game**.
3. If a player reloads the page or briefly loses connection, they rejoin the same seat.

**Practice locally** in the lobby runs the rules engine in the browser instead of on the server. It is a hot-seat game: one screen, always showing the seat that has to act.

## Local development

Two terminals:

```sh
npm run dev           # Vite dev server with HMR, on :5173
npm run dev:server    # the real server, on :8080
```

Vite proxies `/ws` to the server (see `vite.config.ts`), so the app in the browser talks to one origin either way.

Other scripts:

```sh
npm test              # run all tests once (Vitest)
npm run test:watch    # tests in watch mode
npm run lint          # ESLint
```

### Project layout

| Path | Contents |
|---|---|
| `src/engine/` | Rules engine: game state, actions, card catalog, regions |
| `src/components/`, `src/pages/` | React UI |
| `src/i18n/` | English and German translations |
| `src/network/` | Browser-side WebSocket session and reconnect handling |
| `server/` | Node server: HTTP static hosting, WebSocket protocol, session management |

### Documentation

- [`GAME_LOGIC.md`](GAME_LOGIC.md): the rules spec and the source of truth for how the game behaves, including deviations from the printed rulebook and what isn't implemented yet. Rule changes are recorded here before they are coded.
- [`CONTEXT.md`](CONTEXT.md): glossary of the domain terms used in code and docs.
- [`docs/adr/`](docs/adr/): architecture decision records.

The printed rulebooks `GAME_LOGIC.md` refers to (`rules_german_original.pdf`, `rules.pdf`) are copyrighted and not included in the repository. Contributors working on game rules need their own copy.

## License

The source code is released under the [MIT License](LICENSE). The license covers this project's code only, not the Catan name, game rules text or card artwork.
