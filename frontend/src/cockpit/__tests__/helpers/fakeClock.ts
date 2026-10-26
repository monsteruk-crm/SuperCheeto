// Test-only deterministic clock. Keeps M00 harness tests free of real timers
// without touching application modules.
export type FakeClock = {
  now: () => number
  advance: (ms: number) => void
  install: () => void
  restore: () => void
}

export const createFakeClock = (startMs: number = 1_700_000_000_000): FakeClock => {
  let current = startMs
  let installed = false
  const originalDateNow = Date.now
  const originalPerformanceNow = performance.now.bind(performance)

  const definePerformanceNow = (value: () => number) => {
    try {
      Object.defineProperty(performance, 'now', { configurable: true, writable: true, value })
    } catch {
      // Some environments make `performance.now` non-configurable; ignore.
    }
  }

  return {
    now: () => current,
    advance: (ms: number) => {
      if (Number.isFinite(ms) && ms > 0) {
        current += ms
      }
    },
    install: () => {
      if (installed) {
        return
      }
      installed = true
      Date.now = () => current
      definePerformanceNow(() => current)
    },
    restore: () => {
      if (!installed) {
        return
      }
      installed = false
      Date.now = originalDateNow
      definePerformanceNow(originalPerformanceNow)
    }
  }
}
