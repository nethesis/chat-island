import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'chat-island-theme'

const stored = (): Theme | undefined => {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' || t === 'system' ? t : undefined
  } catch {
    return undefined
  }
}

/** Dark or not: the chosen theme, else the host's `dark` class on <html>, like phone-island. */
export function useDark(prop?: Theme): boolean {
  const [theme, setTheme] = useState<Theme | undefined>(() => prop ?? stored())
  const [dark, setDark] = useState(false)

  useEffect(() => setTheme(prop ?? stored()), [prop])

  // chat-island-theme-change {theme}: switch and remember
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<{ theme?: Theme }>).detail?.theme
      if (t !== 'light' && t !== 'dark' && t !== 'system') return
      try {
        localStorage.setItem(KEY, t)
      } catch {
        /* not remembered */
      }
      setTheme(t)
    }
    window.addEventListener('chat-island-theme-change', on)
    return () => window.removeEventListener('chat-island-theme-change', on)
  }, [])

  useEffect(() => {
    if (theme === 'light' || theme === 'dark') {
      setDark(theme === 'dark')
      return
    }
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const update = () => setDark(mq.matches)
      update()
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    const html = document.documentElement
    const update = () => setDark(html.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [theme])

  return dark
}
