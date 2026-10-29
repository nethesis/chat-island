// unauthorized: the server refused the token; retried every few minutes, and at once when the tab is shown again.
export type Status = 'connecting' | 'online' | 'offline' | 'error' | 'unauthorized'

export interface Message {
  id: string        // stanza-id from the archive when known, else the origin id
  from: string      // bare username of the sender; for a group, the room address
  to: string        // bare username of the recipient
  body: string
  ts: number        // epoch ms
  mine: boolean
  oob?: string      // attachment URL (XEP-0066), when the message carries one
  files?: string[]  // every attachment, when the message carries more than one
  pending?: boolean // sent, not yet echoed back by the server
  room?: string     // group address when the message belongs to a group
  nick?: string     // sender's username inside a group
  oid?: string      // the id its sender gave it: the same on every side, what reactions point to
  sid?: string      // a group message's id in the room: what a retraction names it by
  reply?: Reply     // the message this one answers (XEP-0461)
  notice?: GroupNotice // a change to the group, told to its members, or a call placed from the chat
}

/** Who was added or removed, a new name or picture, or a call (users: who was called). Sent without a body: it notifies nobody and other clients skip it. */
export interface GroupNotice {
  event: 'add' | 'remove' | 'rename' | 'avatar' | 'call'
  users: string[]
  name?: string // the new name, for rename
}

/** A reply: the oid of the quoted message, its author, and the quote carried in the body for other clients. */
export interface Reply {
  id: string
  author: string   // username of the quoted message's author
  quote?: string   // the fallback text ("Name: …"), shown when the original is not loaded
}

/** Someone's reactions to one message (XEP-0444): the whole set, an empty one takes them back. */
export interface Reaction {
  peer: string     // the conversation
  target: string   // oid of the message
  user: string     // who reacted
  emojis: string[]
}

/** A message taken back by its author, for everyone (XEP-0424): ref is its oid, or its sid in a group. */
export interface Retraction {
  peer: string
  ref: string
  user: string // who took it back: only the author's own message goes
}

export interface Conversation {
  peer: string               // operator username, or the group address (room@conference.host)
  kind: 'chat' | 'group'
  name?: string              // group name
  avatar?: string            // group picture, data URL
  owner?: boolean            // I own the group
  members?: string[]         // group members, usernames
  messages: Message[]
  unread: number
  typing: boolean
  loaded: boolean    // first history page fetched
  complete: boolean  // no older messages left
  oldest?: string    // archive id of the oldest message shown, for paging
  reactions?: Record<string, Record<string, string[]>> // message oid -> user -> emojis
  delivered?: number // the peer has received my messages up to this time
  read?: number      // the peer has read my messages up to this time
  myRead?: number    // I told the peer I read up to this time (from any of my clients)
  marks?: Record<string, { delivered: number; read: number }> // group: how far each member got; delivered/read are then the slowest
}

export interface Contact {
  username: string
  name: string
  avatar?: string     // data URL
  presence?: string   // CTI main presence, when the host provides it
  number?: string     // main extension, when the host provides it: shows the call button
  devices?: string[]  // types of the registered extensions: webrtc, nethlink, mobile, physical
}

export interface Config {
  host: string      // CTI host, also the XMPP domain, e.g. cti1.example.com
  username: string
  token: string     // CTI JWT, used as the XMPP password
}

/** What the host app gets for its conversation list: one row per operator or group. */
export interface ConversationSummary {
  peer: string
  kind: 'chat' | 'group'
  name: string
  avatar?: string
  online: boolean
  mobile?: boolean
  inactive?: boolean // no longer in the CTI: read-only
  owner?: boolean // a group I created: deleting it removes it for everyone
  unread: number
  members?: string[]
  guests?: Record<string, string> // in a group with people outside the PBX: guest id -> their name there
  last?: { body: string; ts: number; mine: boolean; oob?: string; nick?: string }
  muted?: boolean // messages arrive without sound or notification
}

/** A room with a person outside the PBX, and that person's account. */
export const isExternal = (peer: string) => peer.startsWith('ext-')
export const isGuest = (user: string) => user.startsWith('g~')
/** A group nick no colleague has: colleagues take their username, guests never get one. */
export const isGuestNick = (nick?: string) => !!nick && !/^[a-z0-9][a-z0-9._-]*$/.test(nick)
