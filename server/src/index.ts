import { createHttpServer } from './httpServer'
import { DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_MAX_SESSIONS } from './session'
import { SessionManager } from './sessionManager'
import { attachWebSocketServer } from './wsServer'

const PORT = Number(process.env.PORT) || 8080
const IDLE_TIMEOUT_MS = Number(process.env.SESSION_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS) || DEFAULT_MAX_SESSIONS

const sessionManager = new SessionManager(IDLE_TIMEOUT_MS, MAX_SESSIONS)
const httpServer = createHttpServer(sessionManager)
attachWebSocketServer(httpServer, sessionManager)

httpServer.listen(PORT, () => {
  console.log(`catan-card-game server listening on port ${PORT}`)
})

// As PID 1 in a container Node ignores SIGTERM unless handled. Sessions live only in memory,
// so there is nothing to flush: exit right away.
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => process.exit(0))
