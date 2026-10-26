export const DEFAULT_LAYOUT = [31, 22, 23.5, 23.5]
export const PANEL_MINIMUMS = [320, 240, 240, 240]
export function readLayout(value: string | null): number[] {
  try {
    const parsed: unknown = JSON.parse(value || 'null')
    if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
      const sum = parsed.reduce((a: number, b: number) => a + b, 0)
      if (sum > 90 && sum < 110) return parsed.map((n: number) => n * 100 / sum)
    }
  } catch { /* use initial proportions */ }
  return [...DEFAULT_LAYOUT]
}
export function clampTracks(weights: number[], pixels: number, minimums: number[]): number[] {
  const room = Math.max(pixels, minimums.reduce((a, b) => a + b, 0))
  const result = weights.map(() => 0)
  let available = room
  let remaining = weights.map((_, i) => i)
  while (remaining.length) {
    const total = remaining.reduce((sum, i) => sum + weights[i], 0)
    const small = remaining.filter((i) => weights[i] / total * available < minimums[i])
    if (!small.length) { remaining.forEach((i) => { result[i] = weights[i] / total * available }); break }
    small.forEach((i) => { result[i] = minimums[i]; available -= minimums[i] })
    remaining = remaining.filter((i) => !small.includes(i))
  }
  return result
}
export function resizePair(layout: number[], index: number, deltaPixels: number, available: number, compact: boolean): number[] {
  const start = compact ? (index < 2 ? 0 : 2) : 0
  const end = compact ? start + 2 : 4
  const weights = layout.slice(start, end)
  const sum = weights.reduce((a, b) => a + b, 0)
  const tracks = clampTracks(weights, available, PANEL_MINIMUMS.slice(start, end))
  const local = index - start
  const shift = Math.max(PANEL_MINIMUMS[index] - tracks[local], Math.min(tracks[local + 1] - PANEL_MINIMUMS[index + 1], deltaPixels))
  tracks[local] += shift; tracks[local + 1] -= shift
  const next = [...layout]
  tracks.forEach((width, i) => { next[start + i] = width / tracks.reduce((a, b) => a + b, 0) * sum })
  return next
}
