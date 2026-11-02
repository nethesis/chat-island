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

/** Operators with the mobile app registered for push: a message reaches their phone even when they are not in the chat. */
export async function fetchMobile(host: string, token: string): Promise<string[]> {
  const r = await fetch(`https://${host}/chat-gw/push/mobile`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`push/mobile: HTTP ${r.status}`)
  return ((await r.json()) as { users: string[] }).users
}

/** Operators no longer in the CTI, with their last name: their chats stay, read-only. */
export async function fetchInactive(host: string, token: string): Promise<Record<string, string>> {
  const r = await fetch(`https://${host}/chat-gw/users/inactive`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`users/inactive: HTTP ${r.status}`)
  const { users } = (await r.json()) as { users: { username: string; name: string }[] }
  return Object.fromEntries(users.map((u) => [u.username, u.name || u.username]))
}

/** Everyone I have a chat with, operators and groups, the latest first. */
export async function fetchConversations(host: string, token: string): Promise<string[]> {
  const r = await fetch(`https://${host}/chat-gw/conversations`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`conversations: HTTP ${r.status}`)
  return ((await r.json()) as { peers: string[] }).peers
}

/** Forget a conversation on the server: my archive with that operator or group is purged. */
export async function deleteHistory(host: string, token: string, peer: string): Promise<void> {
  const r = await fetch(`https://${host}/chat-gw/conversations/${encodeURIComponent(peer)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`delete: HTTP ${r.status}`)
}

/** An archived message that contains the searched text. */
export interface SearchHit { peer: string; id: string; oid?: string; ts: number; body: string; nick?: string }

/** My archived messages containing `q`, newest first: with one operator or group, or with everyone. */
export async function searchMessages(host: string, token: string, q: string, peer?: string): Promise<SearchHit[]> {
  const u = new URL(`https://${host}/chat-gw/search`)
  u.searchParams.set('q', q)
  if (peer) u.searchParams.set('peer', peer)
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`search: HTTP ${r.status}`)
  return ((await r.json()) as { results: SearchHit[] }).results
}

/** Where my chat windows live while NethLink runs: NethLink (default) or the CTI. */
export async function chatHost(host: string, token: string, set?: 'cti' | 'nethlink'): Promise<'cti' | 'nethlink'> {
  const r = await fetch(`https://${host}/chat-gw/prefs/host`, {
    method: set ? 'PUT' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(set ? { 'Content-Type': 'application/json' } : {}) },
    body: set ? JSON.stringify({ host: set }) : undefined,
  })
  if (!r.ok) throw new Error(`prefs/host: HTTP ${r.status}`)
  return ((await r.json()) as { host: 'cti' | 'nethlink' }).host
}

/** A room with people outside the PBX: its invite link (only right after it is made: the server keeps
 * its hash), whether it still lets people in, who joined; owner: I made it. */
export interface GuestInfo {
  room: string
  title: string
  link: string
  expires: number
  revoked: boolean
  owner: boolean
  guests: { id: string; name: string; nick: string; joined: number }[]
}

async function guestCall(host: string, token: string, method: string, path: string, body?: unknown): Promise<GuestInfo> {
  const r = await fetch(`https://${host}/chat-gw/guests${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`guests: HTTP ${r.status}`)
  return (await r.json()) as GuestInfo
}

const roomPath = (room: string) => '/' + encodeURIComponent(room)
/** A new room named name, mine, and its invite link: whoever opens it gives a name and joins. */
export const inviteGuest = (host: string, token: string, name: string) => guestCall(host, token, 'POST', '', { name })
/** One of my groups opened to people outside: its members stay, a link lets others in. */
export const shareGroup = (host: string, token: string, name: string, room: string) => guestCall(host, token, 'POST', '', { name, room })
/** Rooms with people outside, by room name. */
export const listShared = async (host: string, token: string): Promise<string[]> => {
  const r = await fetch(`https://${host}/chat-gw/guests`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`guests: HTTP ${r.status}`)
  return ((await r.json()) as { rooms: string[] }).rooms
}
/** The link's state and the guests of a room I am in. */
export const getGuest = (host: string, token: string, room: string) => guestCall(host, token, 'GET', roomPath(room))
/** Who made the room makes a new link, open for 30 days; the old one stops working. */
export const newGuestLink = (host: string, token: string, room: string) => guestCall(host, token, 'POST', roomPath(room) + '/link')
/** The link lets nobody new in; who joined stays. */
export const revokeGuest = (host: string, token: string, room: string) => guestCall(host, token, 'DELETE', roomPath(room))
/** That guest leaves the room. */
export const removeGuest = (host: string, token: string, room: string, guest: string) => guestCall(host, token, 'DELETE', roomPath(room) + '/' + encodeURIComponent(guest))
