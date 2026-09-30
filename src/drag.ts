import { useCallback, useEffect, useRef, useState } from 'react'

/** Drag the island by its bottom-right anchor; the offset is kept per user, a tiny move is a click. */
export interface Anchor {
  right: number
  bottom: number
}

const MARGIN = 8

export function useDrag(rootRef: React.RefObject<HTMLElement | null>, storageKey: string) {
  const [anchor, setAnchor] = useState<Anchor | null>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? (JSON.parse(saved) as Anchor) : null
    } catch {
      return null
    }
  })
  const dragged = useRef(false)

  const clamp = useCallback((a: Anchor): Anchor => {
    const el = rootRef.current
    const w = el?.offsetWidth ?? 0
    const h = el?.offsetHeight ?? 0
    return {
      right: Math.min(Math.max(MARGIN, a.right), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      bottom: Math.min(Math.max(MARGIN, a.bottom), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
    }
  }, [rootRef])

  // Keep it on screen when the window is resized.
  useEffect(() => {
    const onResize = () => setAnchor((a) => (a ? clamp(a) : a))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const start = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const origin = { x: e.clientX, y: e.clientY, right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom }
      dragged.current = false
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - origin.x
        const dy = ev.clientY - origin.y
        if (!dragged.current && Math.hypot(dx, dy) < 5) return
        dragged.current = true
        setAnchor(clamp({ right: origin.right - dx, bottom: origin.bottom - dy }))
      }
      let last: Anchor | null = null
      const move2 = (ev: PointerEvent) => {
        move(ev)
        if (dragged.current) last = clamp({ right: origin.right - (ev.clientX - origin.x), bottom: origin.bottom - (ev.clientY - origin.y) })
      }
      const up = () => {
        window.removeEventListener('pointermove', move2)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (dragged.current && last) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(last))
          } catch {
            /* storage blocked: the position just is not remembered */
          }
        }
      }
      window.addEventListener('pointermove', move2)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [rootRef, clamp, storageKey],
  )

  // After a drag, the click that ends it must not open or close anything.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (dragged.current) {
      e.stopPropagation()
      e.preventDefault()
      dragged.current = false
    }
  }, [])

  return { anchor, start, onClickCapture }
}
