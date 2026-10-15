import type { GroupNotice } from './types'
import { t } from './i18n'

/** A change to a group in words, with the reader's names for people: "Asca added Antonio, you". */
export function noticeText(n: GroupNotice, nameOf: (u: string) => string, me: string, by: string): string {
  const who = (u: string) => (u === me ? t('Notice.you') : nameOf(u))
  const mine = by === me
  const vars = { who: nameOf(by), users: n.users.map(who).join(', '), name: n.name ?? '' }
  if (n.event === 'add') return t(mine ? 'Notice.You added {{users}}' : 'Notice.{{who}} added {{users}}', vars)
  if (n.event === 'remove') return t(mine ? 'Notice.You removed {{users}}' : 'Notice.{{who}} removed {{users}}', vars)
  if (n.event === 'rename') return t(mine ? 'Notice.You renamed the group to "{{name}}"' : 'Notice.{{who}} renamed the group to "{{name}}"', vars)
  return t(mine ? 'Notice.You changed the group picture' : 'Notice.{{who}} changed the group picture', vars)
}
