import type { Contact } from './types'

/** CTI operators (the middleware's /user/endpoints/all, all_avatars) as island contacts, without me. */
export function contactsFromOperators(operators: Record<string, any> | undefined, avatars: Record<string, string> | undefined, me: string, extensions?: Record<string, any>): Contact[] {
  return Object.values(operators ?? {})
    .filter((op: any) => op?.username && op.username !== me)
    .map((op: any) => ({
      username: op.username,
      name: op.name || op.username,
      avatar: avatars?.[op.username],
      presence: op.mainPresence,
      number: op.endpoints?.mainextension?.[0]?.id,
      devices: extensions ? (op.endpoints?.extension ?? []).filter((e: any) => extensions[e.id]?.status && extensions[e.id].status !== 'offline').map((e: any) => e.type) : undefined,
    }))
}
