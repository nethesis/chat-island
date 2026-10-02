import { create } from 'zustand'
import type { Contact, Conversation, Message, Reaction, Status } from './types'

interface State {
  me: string
  myName: string
  mucHost: string
  status: Status
  error?: string
  contacts: Record<string, Contact>
  online: Record<string, boolean>   // operators connected to the chat, from XMPP presence
  mobile: Record<string, boolean>   // operators reachable through the mobile app
  inactive: Record<string, string>  // operators gone from the CTI: username -> last name
  conversations: Record<string, Conversation>
  order: string[]          // peers with a head in the dock, bottom first; a head keeps its place
  open: string | null      // the conversation whose window is open
  picker: boolean          // the "new chat" panel
  push: 'unavailable' | 'ask' | 'enabled' | 'denied'
  enablePush: () => void
  maxHeads: number
  newChatButton: boolean

  setStatus(s: Status, err?: string): void
  reset(): void // a new account in the same page: forget everything of the previous one
  setContacts(list: Contact[]): void
  setOnline(peer: string, online: boolean): void
  setMobile(users: string[]): void
  setInactive(users: Record<string, string>): void
  ensure(peer: string): Conversation
  setGroup(peer: string, name: string, members: string[], avatar?: string, owner?: boolean): void
  removeConversation(peer: string): void
  seed(msgs: Message[], me: string): void
  addMessage(peer: string, m: Message, opts?: { live?: boolean }): void
  prependHistory(peer: string, msgs: Message[], complete: boolean, oldest?: string): void
  setTyping(peer: string, typing: boolean): void
  applyReactions(list: Reaction[]): void
  openChat(peer: string): void
  closeChat(peer?: string): void
  removeHead(peer: string): void
  markRead(peer: string): void
  setPicker(v: boolean): void
  totalUnread(): number
}

export const peerOf = (m: Message) => m.room ?? (m.mine ? m.to : m.from)

const empty = (peer: string, mucHost: string): Conversation => ({
  peer,
  kind: mucHost && peer.endsWith('@' + mucHost) ? 'group' : 'chat',
  messages: [],
  unread: 0,
  typing: false,
  loaded: false,
  complete: false,
})

/** Heads keep their place: a new one goes at the bottom, past the limit the topmost not-open one leaves. */
// Beyond max a head waits behind the +N bubble; one coming back takes the bottom, never pushing the open chat out.
const withHead = (order: string[], peer: string, max: number, open: string | null): string[] => {
  const i = order.indexOf(peer)
  if (i >= 0 && i < max) return order
  const next = [peer, ...order.filter((p) => p !== peer)].slice(0, 100)
  if (!open || next.indexOf(open) < max) return next
  const rest = next.filter((p) => p !== open)
  return [...rest.slice(0, max - 1), open, ...rest.slice(max - 1)]
}

/** One message, whether it carries the archive id or the sender's own (oid). */
const same = (a: Message, b: Message) => a.id === b.id || (!!a.oid && a.oid === b.oid)

export const useStore = create<State>((set, get) => ({
  me: '',
  myName: '',
  mucHost: '',
  status: 'connecting',
  contacts: {},
  online: {},
  mobile: {},
  inactive: {},
  conversations: {},
  order: [],
  open: null,
  picker: false,
  push: 'unavailable',
  enablePush: () => {},
  maxHeads: 5,
  newChatButton: true,

  setStatus: (status, error) => set({ status, error }),
  reset: () => set({ status: 'connecting', error: undefined, contacts: {}, online: {}, mobile: {}, inactive: {}, conversations: {}, order: [], open: null, picker: false }),
  // The host may send partial entries: a name is always there, the username at worst.
  setContacts: (list) => set({ contacts: Object.fromEntries(list.filter((c) => c?.username).map((c) => [c.username, { ...c, name: c.name || c.username }])) }),
  setMobile: (users) => set({ mobile: Object.fromEntries(users.map((u) => [u, true])) }),
  setInactive: (inactive) => set({ inactive }),
  setOnline: (peer, online) => set((s) => (s.online[peer] === online ? {} : { online: { ...s.online, [peer]: online } })),

  ensure: (peer) => {
    const c = get().conversations[peer]
    if (c) return c
    const fresh = empty(peer, get().mucHost)
    set((s) => ({ conversations: { ...s.conversations, [peer]: fresh } }))
    return fresh
  },

  setGroup: (peer, name, members, avatar, owner) =>
    set((s) => {
      const c = s.conversations[peer] ?? empty(peer, s.mucHost)
      return { conversations: { ...s.conversations, [peer]: { ...c, kind: 'group', name, members, avatar: avatar ?? c.avatar, owner: owner ?? c.owner } } }
    }),

  // Last message per conversation from the archive; after a reconnect it also merges
  // what arrived into conversations already loaded.
  seed: (msgs, me) =>
    set((s) => {
      const conversations = { ...s.conversations }
      for (const m of msgs) {
        const peer = peerOf(m)
        if (!peer || peer === me) continue
        const c = conversations[peer] ?? empty(peer, s.mucHost)
        if (c.messages.some((x) => same(x, m))) continue
        if (c.loaded) {
          conversations[peer] = { ...c, messages: [...c.messages, m].sort((a, b) => a.ts - b.ts) }
          continue
        }
        const last = c.messages[c.messages.length - 1]
        conversations[peer] = { ...c, messages: !last || last.ts <= m.ts ? [m] : c.messages }
      }
      return { conversations }
    }),

  addMessage: (peer, m, opts) =>
    set((s) => {
      const c = s.conversations[peer] ?? empty(peer, s.mucHost)
      // Replace the pending copy of my own message with the archived one, dedupe by id.
      const messages = c.messages.filter((x) => !same(x, m) && !(x.pending && m.mine && x.body === m.body && x.oob === m.oob))
      // Nearly always the newest: insert in place instead of sorting the whole history.
      let at = messages.length
      while (at > 0 && messages[at - 1].ts > m.ts) at--
      messages.splice(at, 0, m)
      const isOpen = s.open === peer
      const unread = opts?.live && !m.mine && !isOpen ? c.unread + 1 : c.unread
      const order = withHead(s.order, peer, s.maxHeads, s.open)
      return { conversations: { ...s.conversations, [peer]: { ...c, messages, unread, typing: m.mine ? c.typing : false } }, order }
    }),

  prependHistory: (peer, msgs, complete, oldest) =>
    set((s) => {
      const c = s.conversations[peer] ?? empty(peer, s.mucHost)
      // The archive copy of a message sent while the history loads has another id, the same oid.
      const messages = [...msgs.filter((m) => !c.messages.some((x) => same(x, m))), ...c.messages].sort((a, b) => a.ts - b.ts)
      return { conversations: { ...s.conversations, [peer]: { ...c, messages, loaded: true, complete, oldest: oldest ?? c.oldest } } }
    }),

  // In order: each one replaces that person's earlier set for the same message.
  applyReactions: (list) =>
    set((s) => {
      if (!list.length) return {}
      const conversations = { ...s.conversations }
      for (const r of list) {
        const c = conversations[r.peer] ?? empty(r.peer, s.mucHost)
        const all = { ...(c.reactions ?? {}) }
        const forMsg = { ...(all[r.target] ?? {}) }
        if (r.emojis.length) forMsg[r.user] = r.emojis
        else delete forMsg[r.user]
        all[r.target] = forMsg
        conversations[r.peer] = { ...c, reactions: all }
      }
      return { conversations }
    }),

  setTyping: (peer, typing) =>
    set((s) => (s.conversations[peer] ? { conversations: { ...s.conversations, [peer]: { ...s.conversations[peer], typing } } } : {})),

  openChat: (peer) =>
    set((s) => {
      const conversations = s.conversations[peer] ? s.conversations : { ...s.conversations, [peer]: empty(peer, s.mucHost) }
      const order = withHead(s.order, peer, s.maxHeads, s.open)
      return { conversations, order, open: peer, picker: false }
    }),

  closeChat: () => set({ open: null }),
  removeConversation: (peer) =>
    set((s) => {
      const conversations = { ...s.conversations }
      delete conversations[peer]
      return { conversations, order: s.order.filter((p) => p !== peer), open: s.open === peer ? null : s.open }
    }),
  removeHead: (peer) => set((s) => ({ order: s.order.filter((p) => p !== peer), open: s.open === peer ? null : s.open })),
  markRead: (peer) =>
    set((s) => (s.conversations[peer] && s.conversations[peer].unread ? { conversations: { ...s.conversations, [peer]: { ...s.conversations[peer], unread: 0 } } } : {})),
  setPicker: (picker) => set({ picker }),
  totalUnread: () => Object.values(get().conversations).reduce((n, c) => n + c.unread, 0),
}))
