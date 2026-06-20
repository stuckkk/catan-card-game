import type { HostSession, GuestSession } from './trysteroSession'

let _host: HostSession | null = null
let _guest: GuestSession | null = null

export const sessionStore = {
  setHost: (s: HostSession | null) => { _host = s },
  setGuest: (s: GuestSession | null) => { _guest = s },
  getHost: () => _host,
  getGuest: () => _guest,
}
