export type StreamKind = 'system' | 'mic'
export type AudioSample = {streamKind?: StreamKind; sourceName?: string | null; level: number; rms: number; peak?: number; t: number}
export type MeterSample = AudioSample & {receivedAt: number; clipUntil: number}
export type SignalState = 'disconnected' | 'unavailable' | 'stale' | 'clipping' | 'quiet' | 'active'
export const STALE_MS = 2000
export const CLIP_MS = 500

/** Only meter subscribers observe high-rate telemetry. App never subscribes. */
export class MeterStore {
  private samples: Partial<Record<StreamKind, MeterSample>> = {}
  private failures: Partial<Record<StreamKind, {message: string; source?: string | null}>> = {}
  private listeners = new Set<() => void>()
  private version = 0
  connected = false
  constructor(private now: () => number = () => performance.now()) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => {this.listeners.delete(listener)} }
  getSnapshot = () => this.version
  private emit() {this.version++; this.listeners.forEach((listener) => listener())}
  setConnected(connected: boolean) {
    if(this.connected === connected) return
    this.connected = connected
    this.samples = {}; this.failures = {}; this.emit()
  }
  fail(kind: StreamKind, message: string, source?: string | null) {this.failures[kind] = {message,source}; if(source == null || this.samples[kind]?.sourceName === source) delete this.samples[kind]; this.emit()}
  accept(sample: AudioSample) {
    if(![sample.level, sample.rms, sample.t].every(Number.isFinite) || (sample.peak != null && !Number.isFinite(sample.peak))) return
    const kind = sample.streamKind === 'mic' ? 'mic' : 'system'
    const previous = this.samples[kind], now = this.now()
    this.samples[kind] = {...sample, level: Math.max(0,Math.min(1,sample.level)), receivedAt: now,
      clipUntil: (sample.peak ?? 0) >= .98 ? now + CLIP_MS : previous && previous.sourceName === sample.sourceName ? previous.clipUntil : 0}
    delete this.failures[kind]; this.emit()
  }
  read(kind: StreamKind, source: string | null, now = this.now()): {state: SignalState; sample?: MeterSample; message?: string} {
    if(!this.connected) return {state:'disconnected'}
    if(!source) return {state:'unavailable',message:'No input device available'}
    const failure=this.failures[kind]
    if(failure && (failure.source == null || failure.source === source)) return {state:'unavailable',message:failure.message}
    const sample = this.samples[kind]
    if(!sample || sample.sourceName !== source || now - sample.receivedAt >= STALE_MS) return {state:'stale'}
    if(sample.clipUntil > now) return {state:'clipping',sample}
    if(sample.peak == null) return {state:'unavailable',sample,message:'Peak measurement unavailable'}
    return {state:sample.rms < .001 && sample.peak < .005 ? 'quiet' : 'active',sample}
  }
}
