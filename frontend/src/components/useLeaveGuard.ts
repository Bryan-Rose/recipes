import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'

export const DISCARD_PROMPT = 'Discard unsaved changes?'

/**
 * Asks before any navigation, in-app or closing/reloading the tab, while `unsaved`.
 * Returns a function that lets the next in-app navigation through unasked, such as the one after a save.
 */
export function useLeaveGuard(unsaved: boolean) {
  // A ref, read when navigation starts: state set just before navigate() wouldn't have rendered yet.
  const allowed = useRef(false)
  const blocker = useBlocker(() => unsaved && !allowed.current)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (confirm(DISCARD_PROMPT)) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  useWarnOnUnload(unsaved)

  return () => {
    allowed.current = true
  }
}

/** Asks before closing or reloading the tab while `unsaved`. */
export function useWarnOnUnload(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
}
