import type { AnswerChunkEvent } from './types'
/** Frame batching with a bounded timer fallback; flush before terminal events. */
export class AnswerStreamBuffer {
  private queue: AnswerChunkEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private frame: number | null = null
  constructor(private readonly deliver: (events: AnswerChunkEvent[]) => void) {}
  push(event: AnswerChunkEvent) {
    this.queue.push(event)
    if (this.timer !== null) return
    this.timer = setTimeout(() => this.flush(), 40)
    if (typeof requestAnimationFrame === 'function') this.frame = requestAnimationFrame(() => this.flush())
  }
  flush() {
    if (this.timer !== null) clearTimeout(this.timer)
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.timer = null; this.frame = null
    const events = this.queue; this.queue = []
    if (events.length) this.deliver(events)
  }
  dispose() { this.flush() }
}
