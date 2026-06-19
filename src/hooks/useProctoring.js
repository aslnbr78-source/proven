import { useCallback, useEffect, useRef, useState } from 'react'

function readFullscreenActive() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement)
}

/**
 * Browser-level proctoring: blocks copy/paste/context menu, tracks tab switches and fullscreen exits.
 * Note: OS screenshots cannot be fully prevented in a web app.
 */
export function useProctoring({
  enabled,
  onFullscreenExit,
  onTabSwitch,
  onCopyAttempt,
}) {
  const countersRef = useRef({ fullscreenExits: 0, tabSwitches: 0, copyAttempts: 0 })
  const [isFullscreen, setIsFullscreen] = useState(readFullscreenActive)

  const requestFullscreen = useCallback(async () => {
    const element = document.documentElement
    if (element.requestFullscreen) {
      await element.requestFullscreen()
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen()
    }
    setIsFullscreen(readFullscreenActive())
  }, [])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const handleContextMenu = (event) => {
      event.preventDefault()
    }

    const handleCopy = (event) => {
      event.preventDefault()
      countersRef.current.copyAttempts += 1
      onCopyAttempt?.(countersRef.current.copyAttempts)
    }

    const handleCut = (event) => {
      event.preventDefault()
      countersRef.current.copyAttempts += 1
      onCopyAttempt?.(countersRef.current.copyAttempts)
    }

    const handlePaste = (event) => {
      event.preventDefault()
      countersRef.current.copyAttempts += 1
      onCopyAttempt?.(countersRef.current.copyAttempts)
    }

    const handleKeyDown = (event) => {
      const key = event.key?.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(key)) {
        event.preventDefault()
        countersRef.current.copyAttempts += 1
        onCopyAttempt?.(countersRef.current.copyAttempts)
      }
      if (key === 'printscreen') {
        event.preventDefault()
        countersRef.current.copyAttempts += 1
        onCopyAttempt?.(countersRef.current.copyAttempts)
      }
    }

    const handleVisibility = () => {
      if (document.hidden) {
        countersRef.current.tabSwitches += 1
        onTabSwitch?.(countersRef.current.tabSwitches)
      }
    }

    const handleFullscreenChange = () => {
      const active = readFullscreenActive()
      setIsFullscreen(active)
      if (!active) {
        countersRef.current.fullscreenExits += 1
        onFullscreenExit?.(countersRef.current.fullscreenExits)
      }
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCut)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibility)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [enabled, onCopyAttempt, onFullscreenExit, onTabSwitch])

  useEffect(() => {
    if (enabled) {
      setIsFullscreen(readFullscreenActive())
    }
  }, [enabled])

  const getCounters = useCallback(() => ({ ...countersRef.current }), [])

  const resetCounters = useCallback(() => {
    countersRef.current = { fullscreenExits: 0, tabSwitches: 0, copyAttempts: 0 }
  }, [])

  return { requestFullscreen, getCounters, resetCounters, isFullscreen }
}

export function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {})
  } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
    document.webkitExitFullscreen()
  }
}
