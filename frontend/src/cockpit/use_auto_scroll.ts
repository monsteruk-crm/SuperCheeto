import { useLayoutEffect, useRef } from 'react'

/** Follow appended cards, streamed text and later content/layout resizing. */
export function useAutoScroll(revision: string, visible = true) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !visible) return
    const follow = () => {
      if (!root.closest('[hidden]')) root.scrollTop = root.scrollHeight
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(follow)
    const observeChildren = () => {
      resize?.disconnect()
      resize?.observe(root)
      for (const child of root.children) resize?.observe(child)
    }
    const mutations = new MutationObserver(() => { observeChildren(); follow() })
    mutations.observe(root, { childList: true, characterData: true, subtree: true })
    observeChildren()
    follow()
    return () => { mutations.disconnect(); resize?.disconnect() }
  }, [revision, visible])
  return ref
}
