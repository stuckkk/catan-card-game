import { createHttpServer } from './httpServer'
import { DEFAULT_IDLE_TIMEOUT_MS } from './session'
import { SessionManager } from './sessionManager'
import { attachWebSocketServer } from './wsServer'

const PORT = Number(process.env.PORT) || 8080
const IDLE_TIMEOUT_MS = Number(process.env.SESSION_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS

const sessionManager = new SessionManager(IDLE_TIMEOUT_MS)
const httpServer = createHttpServer()
attachWebSocketServer(httpServer, sessionManager)

httpServer.listen(PORT, () => {
  console.log(`catan-card-game server listening on port ${PORT}`)
})
