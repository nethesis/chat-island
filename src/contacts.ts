import type { Contact } from './types'

/** CTI operators (the middleware's /user/endpoints/all, all_avatars) as island contacts; my entry tells the island my presence and stays out of the list. */
export function contactsFromOperators(operators: Record<string, any> | undefined, avatars: Record<string, string> | undefined, _me: string, extensions?: Record<string, any>): Contact[] {
  return Object.values(operators ?? {})
    .filter((op: any) => op?.username)
    .map((op: any) => ({
      username: op.username,
      name: op.name || op.username,
      avatar: avatars?.[op.username],
      presence: op.mainPresence,
      number: op.endpoints?.mainextension?.[0]?.id,
      devices: extensions ? (op.endpoints?.extension ?? []).filter((e: any) => extensions[e.id]?.status && extensions[e.id].status !== 'offline').map((e: any) => e.type) : undefined,
    }))
}
