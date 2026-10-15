import en from './locales/en.json'
import it from './locales/it.json'
import { useStore } from './store'

/** English and Italian, as in phone-island: the browser's language unless the host names one. */
export type Lang = 'en' | 'it'
const dicts: Record<Lang, Record<string, Record<string, string>>> = { en, it }

export const toLang = (l?: string): Lang => ((l || navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en')

/** "Section.Text" in the current language, English when missing; {{name}} filled from vars. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dot = key.indexOf('.')
  const [section, text] = [key.slice(0, dot), key.slice(dot + 1)]
  const s = dicts[useStore.getState().lang][section]?.[text] ?? dicts.en[section]?.[text] ?? text
  return vars ? s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : s
}
