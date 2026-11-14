import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHttpServer } from './httpServer'
import { DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_MAX_SESSIONS } from './session'
import { SessionManager } from './sessionManager'
import { attachWebSocketServer } from './wsServer'

const PORT = Number(process.env.PORT) || 8080
const IDLE_TIMEOUT_MS = Number(process.env.SESSION_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS) || DEFAULT_MAX_SESSIONS

/** Optional: where the running games are written when the server stops, and read from when it starts. */
const SNAPSHOT_FILE = process.env.SESSION_SNAPSHOT_FILE

const sessionManager = new SessionManager(IDLE_TIMEOUT_MS, MAX_SESSIONS)
if (SNAPSHOT_FILE && existsSync(SNAPSHOT_FILE)) {
  try {
    sessionManager.restore(JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')))
    console.log(`restored ${sessionManager.snapshot().length} session(s) from ${SNAPSHOT_FILE}`)
  } catch (err) {
    console.error(`could not read ${SNAPSHOT_FILE}; starting without saved sessions`, err)
  }
  // Used up either way: a later crash must not bring back games from before this start.
  rmSync(SNAPSHOT_FILE, { force: true })
}
const httpServer = createHttpServer(sessionManager)
attachWebSocketServer(httpServer, sessionManager)

httpServer.listen(PORT, () => {
  console.log(`catan-card-game server listening on port ${PORT}`)
})

// As PID 1 in a container Node ignores SIGTERM unless handled. Sessions live in memory: with a
// snapshot file they are written out first, otherwise they end here. Then exit right away.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (SNAPSHOT_FILE) {
      try {
        writeFileSync(SNAPSHOT_FILE, JSON.stringify(sessionManager.snapshot()))
      } catch (err) {
        console.error(`could not write ${SNAPSHOT_FILE}`, err)
      }
    }
    process.exit(0)
  })
}
