import { createServer, type Server } from 'node:http'
import path from 'node:path'
import sirv from 'sirv'
import type { SessionManager } from './sessionManager'

/**
 * Serves the built frontend (dist/) with SPA fallback, a health check, and the Open Games list.
 * Resolved relative to process.cwd() rather than this module's own location:
 * both documented ways to run the server (`npm start` from a checkout, and the
 * Docker image's `WORKDIR /app`) guarantee cwd is the repo root.
 */
export function createHttpServer(
  sessionManager: SessionManager,
  staticDir: string = path.resolve(process.cwd(), 'dist'),
): Server {
  const serveStatic = sirv(staticDir, { single: true })

  return createServer((req, res) => {
    // The path without its query string (a monitoring probe may append one).
    const pathname = (req.url ?? '').split('?')[0]
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }
    if (pathname === '/api/games' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(sessionManager.listPublicGames()))
      return
    }
    serveStatic(req, res)
  })
}
