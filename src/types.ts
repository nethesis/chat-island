// unauthorized: the server refused the token; nothing is retried until the host passes a new one.
export type Status = 'connecting' | 'online' | 'offline' | 'error' | 'unauthorized'

export interface Message {
  id: string        // stanza-id from the archive when known, else the origin id
  from: string      // bare username of the sender; for a group, the room address
  to: string        // bare username of the recipient
  body: string
  ts: number        // epoch ms
  mine: boolean
  oob?: string      // attachment URL (XEP-0066), when the message carries one
  pending?: boolean // sent, not yet echoed back by the server
  room?: string     // group address when the message belongs to a group
  nick?: string     // sender's username inside a group
  oid?: string      // the id its sender gave it: the same on every side, what reactions point to
  reply?: Reply     // the message this one answers (XEP-0461)
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
}

export interface Contact {
  username: string
  name: string
  avatar?: string     // data URL
  presence?: string   // CTI main presence, when the host provides it
  number?: string     // main extension, when the host provides it: shows the call button
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
  last?: { body: string; ts: number; mine: boolean; oob?: string; nick?: string }
}
