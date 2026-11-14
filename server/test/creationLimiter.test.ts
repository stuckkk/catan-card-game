import { describe, it, expect } from 'vitest'
import { CreationLimiter } from '../src/creationLimiter'

describe('CreationLimiter', () => {
  it('allows up to the limit per address, each address on its own', () => {
    const limiter = new CreationLimiter(2, 1000)
    expect(limiter.allow('a', 0)).toBe(true)
    expect(limiter.allow('a', 1)).toBe(true)
    expect(limiter.allow('a', 2)).toBe(false)
    expect(limiter.allow('b', 2)).toBe(true)
  })

  it('forgets creations older than the window', () => {
    const limiter = new CreationLimiter(1, 1000)
    expect(limiter.allow('a', 0)).toBe(true)
    expect(limiter.allow('a', 999)).toBe(false)
    expect(limiter.allow('a', 1000)).toBe(true)
  })
})
