import { describe, expect, it } from 'vitest'
import { createFakeClock } from './helpers/fakeClock'
import { FakeWebSocketTransport } from './helpers/fakeTransport'
import { createMockDetector, createMockGateway } from './helpers/mockedGateway'
import { MESSY_SPEECH_TRANSCRIPT, MESSY_SPEECH_UTTERANCES } from './fixtures/messySpeech'

describe('test-only fake clock', () => {
  it('advances deterministically and restores the real clock', () => {
    const clock = createFakeClock(1_000)
    clock.install()
    try {
      expect(clock.now()).toBe(1_000)
      clock.advance(500)
      expect(clock.now()).toBe(1_500)
      expect(Date.now()).toBe(1_500)
    } finally {
      clock.restore()
    }
    expect(Date.now()).not.toBe(1_500)
  })
})

describe('test-only fake WebSocket transport', () => {
  it('records outgoing messages and dispatches server events to the right handler', () => {
    let status: Record<string, unknown> | null = null
    const transport = new FakeWebSocketTransport('ws://example', {
      onStatus: (payload) => {
        status = payload
      }
    })

    transport.connect()
    expect(transport.connectCount).toBe(1)
    expect(status).toEqual({ state: 'connected' })

    transport.send({ type: 'run_query', requestId: 'r1' })
    expect(transport.lastSent('run_query')).toMatchObject({ requestId: 'r1' })

    transport.emit('status', { state: 'transcribing' })
    expect(status).toEqual({ state: 'transcribing' })
  })
})

describe('test-only mocked Gateway/detector', () => {
  it('records generation inputs and returns a canned answer', async () => {
    const gateway = createMockGateway()
    const answer = await gateway.generate({ prompt: 'summarize', model: 'openai/gpt-5.6-sol' })
    expect(answer).toBe('Mocked answer text.')
    expect(gateway.generations).toEqual([{ prompt: 'summarize', model: 'openai/gpt-5.6-sol' }])
  })

  it('records detector lookback text and returns canned candidates', async () => {
    const detector = createMockDetector()
    detector.setNextCandidates([{ candidateId: 'c1', wording: 'Ship it?', reason: 'missing referent' }])
    const candidates = await detector.detect('what about the deploy')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].candidateId).toBe('c1')
    expect(detector.calls).toEqual([{ text: 'what about the deploy' }])
  })
})

describe('test-only messy-speech fixtures', () => {
  it('keeps negation and injection-looking text verbatim', () => {
    expect(MESSY_SPEECH_UTTERANCES.length).toBeGreaterThan(0)
    const negation = MESSY_SPEECH_UTTERANCES.find((item) => item.id === 'u02')
    expect(negation?.text).toContain('never friday')
    const injection = MESSY_SPEECH_UTTERANCES.find((item) => item.id === 'u06')
    expect(injection?.text).toContain('ignore all previous instructions')
    expect(MESSY_SPEECH_TRANSCRIPT.every((row) => row.is_final)).toBe(true)
  })
})
