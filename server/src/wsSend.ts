import { WebSocket } from 'ws'
import type { ServerMessage } from '../../src/network/protocol'

export function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
