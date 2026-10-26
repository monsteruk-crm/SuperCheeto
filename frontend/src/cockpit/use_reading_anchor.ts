import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RequestRecord } from './reducer'
/** Preserve the first visible card's offset when text above it grows. */
export function useReadingAnchor(records: RequestRecord[]) {
  const ref = useRef<HTMLDivElement>(null)
  const anchor = useRef<{id: string; offset: number} | null>(null)
  const ids = useRef<string[]>([])
  const [newCount, setNewCount] = useState(0)
  const capture = useCallback(() => {
    const root = ref.current
    if (!root || root.closest('[hidden]')) return
    const top = root.getBoundingClientRect().top
    const card = [...root.querySelectorAll<HTMLElement>('[data-answer-id]')].find((element) => element.getBoundingClientRect().bottom > top)
    if (card) anchor.current = { id: card.dataset.answerId!, offset: card.getBoundingClientRect().top - top }
  }, [])
  const revision = records.map((record) => `${record.answerId}:${record.text.length}:${record.status}`).join('|')
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || root.closest('[hidden]')) return
    const previous = ids.current
    const added = records.filter((record) => !previous.includes(record.answerId)).length
    if (previous.length && added) setNewCount((count) => count + added)
    ids.current = records.map((record) => record.answerId)
    if (anchor.current) {
      const current = [...root.querySelectorAll<HTMLElement>('[data-answer-id]')].find((element) => element.dataset.answerId === anchor.current!.id)
      if (current) root.scrollTop += current.getBoundingClientRect().top - root.getBoundingClientRect().top - anchor.current.offset
    }
    capture()
  }, [revision, capture])
  const showLatest = () => { const root = ref.current; if (root) root.scrollTop = root.scrollHeight; setNewCount(0); capture() }
  return { ref, capture, newCount, showLatest }
}
