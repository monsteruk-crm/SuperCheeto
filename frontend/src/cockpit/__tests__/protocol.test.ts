import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  contractContext,
  parseAutoStateEvent,
  parseCandidateStateEvent,
  parseDetectionStateEvent,
  parseAnswerAcceptedEvent,
  parseAnswerEvent,
  parseAnswerStateEvent,
  parseAnswerTimingEvent,
  parseCommand,
  parseModelSettings
} from '../protocol'

type FixtureEntry = {
  file: string
  name: string
  kind?: 'command' | 'answer_finished' | 'answer_accepted' | 'answer_timing' | 'answer_state' | 'question_event' | 'auto_state'
  expectedCode: string | null
}
type Fixture = { name: string; expectedCode: string | null; payload: Record<string, unknown> }

// Shared fixtures live outside the frontend package so the backend and frontend
// harnesses parse exactly the same files. Each contract directory keeps the
// rules for its own version; a v2 payload is never reinterpreted as v3.
const CONTRACTS_ROOT = path.resolve(__dirname, '../../../../contracts')
const CONTRACT_DIRS = ['v2', 'v3', 'v4', 'v5', 'v6']

const loadIndex = (dir: string) =>
  JSON.parse(fs.readFileSync(path.join(CONTRACTS_ROOT, dir, 'index.json'), 'utf8')) as {
    context: Parameters<typeof contractContext>[0]
    fixtures: FixtureEntry[]
  }

const loadFixture = (dir: string, file: string): Fixture =>
  JSON.parse(fs.readFileSync(path.join(CONTRACTS_ROOT, dir, file), 'utf8')) as Fixture

const cases = CONTRACT_DIRS.flatMap((dir) => {
  const index = loadIndex(dir)
  const context = contractContext(index.context)
  return index.fixtures.map((entry) => ({ dir, entry, context }))
})

function parseFor(entry: FixtureEntry, payload: Record<string, unknown>, context: ReturnType<typeof contractContext>) {
  const kind = entry.kind ?? (payload.type === 'answer_finished' ? 'answer_finished' : 'command')
  if(kind==='auto_state')return parseAutoStateEvent(payload)
  if (kind === 'question_event') return payload.type==='candidate_state'?parseCandidateStateEvent(payload):parseDetectionStateEvent(payload)
  if (kind === 'command') return parseCommand(payload, context)
  if (kind === 'answer_state') return parseAnswerStateEvent(payload, context)
  if (kind === 'answer_finished') return parseAnswerEvent(payload, context)
  if (kind === 'answer_accepted') return parseAnswerAcceptedEvent(payload, context)
  if (kind === 'answer_timing') return parseAnswerTimingEvent(payload, context)
  throw new Error(`unknown fixture kind: ${kind}`)
}

describe('protocol contract fixtures (shared with backend)', () => {
  it('checks both contract directories', () => {
    expect(new Set(cases.map((item) => item.dir))).toEqual(new Set(['v2', 'v3', 'v4', 'v5', 'v6']))
    expect(cases.length).toBeGreaterThan(20)
  })

  it.each(cases.map((item) => [`${item.dir}/${item.entry.name}`, item] as const))(
    '%s matches its expected outcome',
    (_label, item) => {
      const fixture = loadFixture(item.dir, item.entry.file)
      const result = parseFor(item.entry, fixture.payload, item.context)
      if (item.entry.expectedCode === null) {
        expect(result.ok).toBe(true)
      } else {
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.code).toBe(item.entry.expectedCode)
        }
      }
    }
  )

  it('accepts a valid v2 command and returns the payload', () => {
    const context = contractContext(loadIndex('v2').context)
    const fixture = loadFixture('v2', 'valid_run_context_query.json')
    const result = parseCommand(fixture.payload, context)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.type).toBe('run_context_query')
      expect(result.value.commandId).toBe(fixture.payload.commandId)
    }
  })

  it('rejects invalid offsets with invalid_span', () => {
    const context = contractContext(loadIndex('v2').context)
    const fixture = loadFixture('v2', 'invalid_offsets.json')
    const result = parseCommand(fixture.payload, context)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('invalid_span')
    }
  })

  it('rejects a stale revision with stale_revision', () => {
    const context = contractContext(loadIndex('v2').context)
    const fixture = loadFixture('v2', 'stale_revision.json')
    const result = parseCommand(fixture.payload, context)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('stale_revision')
    }
  })

  it('reads v3 model settings and timing from an answer_finished payload', () => {
    const context = contractContext(loadIndex('v3').context)
    const fixture = loadFixture('v3', 'valid_answer_finished_v3.json')
    const result = parseAnswerEvent(fixture.payload, context)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.modelSettings?.model).toBe('google/gemini-3.8-flash')
      expect(result.value.modelSettings?.reasoning?.applied).toBe(true)
      expect(result.value.timing?.backend.completedMs).toBe(1210.9)
      expect(result.value.timing?.backend.generation?.firstDeltaMs).toBe(380.4)
      expect(result.value.timing?.backend.unavailable).toEqual([])
    }
  })

  it('keeps a v2 answer free of v3 metadata', () => {
    const context = contractContext(loadIndex('v2').context)
    const fixture = loadFixture('v2', 'valid_answer_finished.json')
    const result = parseAnswerEvent(fixture.payload, context)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.modelSettings).toBeNull()
      expect(result.value.timing).toBeNull()
    }
  })

  it('ignores absent measurements instead of inventing values', () => {
    const result = parseModelSettings({
      role: 'answer',
      model: 'openai/gpt-5.6-sol',
      requestedModel: 'openai/gpt-5.6-sol',
      selectionSource: 'client',
      substitutedFrom: null,
      notice: 'Capabilities are unverified.',
      reasoning: null,
      capabilities: {
        textInput: true,
        textOutput: true,
        imageInput: false,
        structuredOutput: false,
        reasoningEfforts: [],
        certainty: 'unknown'
      }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.reasoning).toBeNull()
      expect(result.value.capabilities.certainty).toBe('unknown')
      expect(result.value.capabilities.imageInput).toBe(false)
    }
  })
})
