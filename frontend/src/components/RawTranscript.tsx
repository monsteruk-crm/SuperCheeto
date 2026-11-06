import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TranscriptSegment } from '../types'
import type { Snapshot, SourceSpan } from '../cockpit/types'

const RawRow = memo(({ segment }: { segment: TranscriptSegment }) => <p className="raw-segment" data-segment-key={segment.segmentKey} data-audio-epoch={segment.audioEpoch} data-revision={segment.revision} data-t0={segment.t0} data-t1={segment.t1} data-source-kind={segment.source_kind || 'system'} data-source-name={segment.source_name || ''}>{segment.text}</p>)

export function selectionSpans(root: HTMLElement, range: Range): SourceSpan[] {
  const spans: SourceSpan[] = []
  root.querySelectorAll<HTMLElement>('.raw-segment').forEach((row) => {
    if (!range.intersectsNode(row) || !row.dataset.segmentKey || !row.dataset.audioEpoch) return
    const content = row.textContent || ''
    const offset = (node: Node, count: number, end: boolean) => {
      if (!row.contains(node)) return end ? content.length : 0
      const prefix = document.createRange(); prefix.selectNodeContents(row); prefix.setEnd(node, count)
      return prefix.toString().length
    }
    const start = Array.from(content.slice(0, offset(range.startContainer, range.startOffset, false))).length
    const end = Array.from(content.slice(0, offset(range.endContainer, range.endOffset, true))).length
    if (start >= end) return
    spans.push({ segmentKey: row.dataset.segmentKey, audioEpoch: row.dataset.audioEpoch, revision: Number(row.dataset.revision || 0), start, end, t0: Number(row.dataset.t0), t1: Number(row.dataset.t1), sourceKind: row.dataset.sourceKind === 'mic' ? 'mic' : 'system', sourceName: row.dataset.sourceName || null })
  })
  return spans
}

export default function RawTranscript({ segments, liveText, onSelect, viewSource }: { segments: TranscriptSegment[]; liveText: string; onSelect: (text: string, spans: SourceSpan[]) => void; viewSource: Snapshot | null }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const previousCount = useRef(segments.length)
  const followingRef = useRef(true)
  const [following, setFollowing] = useState(true)
  const [incoming, setIncoming] = useState(0)
  const pause = useCallback(() => { followingRef.current = false; setFollowing(false) }, [])
  const resume = () => { followingRef.current = true; setFollowing(true); setIncoming(0); const root = rootRef.current; if (root) root.scrollTop = root.scrollHeight }
  const capture = useCallback(() => {
    const root = rootRef.current, selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return
    const spans = selectionSpans(root, selection.getRangeAt(0))
    if (spans.length) { pause(); onSelect(selection.toString(), spans) }
  }, [onSelect, pause])
  useEffect(() => { document.addEventListener('selectionchange', capture); return () => document.removeEventListener('selectionchange', capture) }, [capture])
  useLayoutEffect(() => {
    const delta = Math.max(0, segments.length - previousCount.current); previousCount.current = segments.length
    if (rootRef.current?.closest('[hidden]')) return
    if (followingRef.current) { const root = rootRef.current; if (root) root.scrollTop = root.scrollHeight; setIncoming(0) }
    else if (delta) setIncoming((count) => count + delta)
  }, [segments.length, liveText])
  useEffect(() => {
    if (!viewSource || !rootRef.current) return
    pause()
    const rows = [...rootRef.current.querySelectorAll<HTMLElement>('.raw-segment')]
    rows.forEach((row) => row.classList.toggle('raw-highlight', viewSource.sourceSpans.some((span) => span.segmentKey === row.dataset.segmentKey)))
    const first = rows.find((row) => row.dataset.segmentKey === viewSource.sourceSpans[0]?.segmentKey)
    if (first) rootRef.current.scrollTop += first.getBoundingClientRect().top - rootRef.current.getBoundingClientRect().top
    const ranges = viewSource.sourceSpans.flatMap((span) => {
      const row = rows.find((item) => item.dataset.segmentKey === span.segmentKey), node = row?.firstChild
      if (!node) return []
      const chars = Array.from(node.textContent || ''), range = document.createRange()
      range.setStart(node, chars.slice(0, span.start).join('').length); range.setEnd(node, chars.slice(0, span.end).join('').length)
      return [range]
    })
    const css = (window.CSS || {}) as typeof CSS & {highlights?: Map<string, unknown>}
    const HighlightClass = (window as unknown as {Highlight?: new (...ranges: Range[]) => unknown}).Highlight
    if (css.highlights && HighlightClass) css.highlights.set('raw-source', new HighlightClass(...ranges))
    return () => { css.highlights?.delete('raw-source'); rows.forEach((row) => row.classList.remove('raw-highlight')) }
  }, [viewSource, pause])
  return <>
    <div ref={rootRef} className="cockpit-scroll raw-scroll" role="region" aria-label="Raw transcript" tabIndex={0} onMouseUp={capture} onKeyUp={capture} onScroll={(event) => { const e = event.currentTarget; if (e.scrollHeight - e.scrollTop - e.clientHeight > 24) pause() }}>
      {segments.map((segment) => <RawRow key={segment.segmentKey || `${segment.source_kind}-${segment.id}-${segment.t0}`} segment={segment} />)}
      <p className="raw-live">{liveText ? `LIVE · ${liveText}` : 'Waiting for finalized speech…'}</p>
    </div>
    <div className="transcript-follow-controls">
      <button className="ghost" onClick={following ? pause : resume}>{following ? 'Pause following' : `Resume live${incoming ? ` · ${incoming} new` : ''}`}</button>
      {!following ? <button className="ghost" onClick={resume}>Jump latest{incoming ? ` · ${incoming} new` : ''}</button> : null}
    </div>
  </>
}
