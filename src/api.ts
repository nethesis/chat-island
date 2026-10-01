// Names and avatars come from the CTI, through the middleware, with the same JWT.
import { contactsFromOperators } from './contacts'
import type { Contact } from './types'

async function get<T>(host: string, token: string, path: string): Promise<T> {
  const r = await fetch(`https://${host}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

export async function fetchContacts(host: string, token: string, me: string, onMe?: (name: string) => void): Promise<Contact[]> {
  type User = { username: string; name?: string; mainPresence?: string }
  const users = await get<Record<string, User>>(host, token, '/user/endpoints/all')
  let avatars: Record<string, string> = {}
  try {
    avatars = await get<Record<string, string>>(host, token, '/user/all_avatars')
  } catch {
    /* avatars are optional */
  }
  // My own name: replies quote it for clients that only see the text.
  const mine = Object.values(users).find((u) => u.username === me)?.name
  if (mine) onMe?.(mine)
  return contactsFromOperators(users, avatars, me).sort((a, b) => a.name.localeCompare(b.name))
}

/** Colleagues with the mobile app registered for push: a message reaches their phone even when they are not in the chat. */
export async function fetchMobile(host: string, token: string): Promise<string[]> {
  const r = await fetch(`https://${host}/chat-gw/push/mobile`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`push/mobile: HTTP ${r.status}`)
  return ((await r.json()) as { users: string[] }).users
}

/** Forget a conversation on the server: my archive with that colleague or group is purged. */
export async function deleteHistory(host: string, token: string, peer: string): Promise<void> {
  const r = await fetch(`https://${host}/chat-gw/conversations/${encodeURIComponent(peer)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`delete: HTTP ${r.status}`)
}
