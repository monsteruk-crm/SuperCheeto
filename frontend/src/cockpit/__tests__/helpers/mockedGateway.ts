// Test-only mocked Gateway/detector dependencies.
//
// These stand in for the cloud language model and the bounded question detector
// so M00 harness tests never perform a paid call. They are intentionally dumb:
// they return canned shapes and record the inputs they were given.
export type MockGenerationRequest = {
  prompt: string
  model?: string | null
  instruction?: string | null
}

export type MockCandidate = {
  candidateId: string
  wording: string
  reason: string
}

export const createMockGateway = () => {
  const generations: MockGenerationRequest[] = []
  let nextResponse = 'Mocked answer text.'

  return {
    generations,
    setNextResponse: (value: string) => {
      nextResponse = value
    },
    async generate(request: MockGenerationRequest): Promise<string> {
      generations.push({ ...request })
      return nextResponse
    }
  }
}

export const createMockDetector = () => {
  const calls: Array<{ text: string }> = []
  let nextCandidates: MockCandidate[] = []

  return {
    calls,
    setNextCandidates: (value: MockCandidate[]) => {
      nextCandidates = value
    },
    async detect(text: string): Promise<MockCandidate[]> {
      calls.push({ text })
      return nextCandidates.map((candidate) => ({ ...candidate }))
    }
  }
}
