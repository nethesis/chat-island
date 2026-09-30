// :+1: and friends, the Slack and GitHub way. Code (`inline` and ``` fenced) is left alone.
import table from './shortcodes-table'

const codes = table
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`?)/g
const SHORTCODE = /:([a-z0-9_+-]+):/g

const convert = (text: string) => text.replace(SHORTCODE, (whole, name: string) => codes[name] ?? whole)

/** Every known :code: outside code becomes its emoji; unknown ones stay as typed. */
export function emojify(text: string): string {
  if (!text.includes(':')) return text
  return text
    .split(CODE)
    .map((part, i) => (i % 2 ? part : convert(part)))
    .join('')
}
