import type { NetworkSession } from './wsSession'

let _session: NetworkSession | null = null

export const sessionStore = {
  set: (s: NetworkSession | null) => { _session = s },
  get: () => _session,
}
