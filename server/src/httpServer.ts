import { createServer, type Server } from 'node:http'
import path from 'node:path'
import sirv from 'sirv'

/**
 * Serves the built frontend (dist/) with SPA fallback, plus a health check.
 * Resolved relative to process.cwd() rather than this module's own location:
 * both documented ways to run the server (`npm start` from a checkout, and the
 * Docker image's `WORKDIR /app`) guarantee cwd is the repo root.
 */
export function createHttpServer(staticDir: string = path.resolve(process.cwd(), 'dist')): Server {
  const serveStatic = sirv(staticDir, { single: true })

  return createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }
    serveStatic(req, res)
  })
}
