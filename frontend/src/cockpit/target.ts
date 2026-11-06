import type { Snapshot } from './types'
export type TargetDraft = { targetId: string; snapshot: Snapshot; wording: string; originalText: string; candidateId?: string; candidateRevision?: number; savedWording?: string; wordingOrigin?: string; correctsAnswerId?: string }
export type SnapshotPurpose = 'pin' | 'draft' | 'answer'
