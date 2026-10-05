import type { GroupNotice } from './types'

/** A change to a group in words, with the reader's names for people: "added Asca, Antonio". */
export function noticeText(n: GroupNotice, nameOf: (u: string) => string, me: string): string {
  const who = (u: string) => (u === me ? 'you' : nameOf(u))
  if (n.event === 'add') return `added ${n.users.map(who).join(', ')}`
  if (n.event === 'remove') return `removed ${n.users.map(who).join(', ')}`
  if (n.event === 'rename') return `renamed the group to "${n.name ?? ''}"`
  return 'changed the group picture'
}
