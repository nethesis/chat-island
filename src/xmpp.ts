// Thin @xmpp/client wrapper (CTI JWT as password). Groups are MUC rooms used via MucSub:
// members are subscribed, so messages reach their archive and push without joining.
import { client, xml, type Client } from '@xmpp/client'
import type { Element } from '@xmpp/xml'
import type { Config, Message, Reaction, Reply } from './types'

/** The XMPP domain of every NethVoice chat: fixed, so addresses survive a change of the CTI host,
 *  which only reaches the server. No federation, so the same name in every tenant is fine. */
export const DOMAIN = 'chat.internal'

const NS = {
  carbons: 'urn:xmpp:carbons:2',
  forward: 'urn:xmpp:forward:0',
  mam: 'urn:xmpp:mam:2',
  rsm: 'http://jabber.org/protocol/rsm',
  sid: 'urn:xmpp:sid:0',
  hints: 'urn:xmpp:hints',
  chatstates: 'http://jabber.org/protocol/chatstates',
  oob: 'jabber:x:oob',
  upload: 'urn:xmpp:http:upload:0',
  delay: 'urn:xmpp:delay',
  disco: 'http://jabber.org/protocol/disco#items',
  discoInfo: 'http://jabber.org/protocol/disco#info',
  push: 'urn:xmpp:push:0',
  hello: 'urn:nethvoice:chat:presence',
  data: 'jabber:x:data',
  muc: 'http://jabber.org/protocol/muc',
  mucOwner: 'http://jabber.org/protocol/muc#owner',
  mucAdmin: 'http://jabber.org/protocol/muc#admin',
  mucsub: 'urn:xmpp:mucsub:0',
  pubsubEvent: 'http://jabber.org/protocol/pubsub#event',
  mucsubMessages: 'urn:xmpp:mucsub:nodes:messages',
  mucsubConfig: 'urn:xmpp:mucsub:nodes:config',
  mucUser: 'http://jabber.org/protocol/muc#user',
  conference: 'jabber:x:conference',
  vcard: 'vcard-temp',
  ping: 'urn:xmpp:ping',
  reactions: 'urn:xmpp:reactions:0',
  reply: 'urn:xmpp:reply:0',
  fallback: 'urn:xmpp:fallback:0',
  markers: 'urn:xmpp:chat-markers:0',
}

const PING_EVERY = 30000 // a socket half-open after sleep or a network change is found within a minute

/** XEP-0333 chat marker on a one-to-one message: the peer received or read it; mine = sent by another client of mine. */
export interface Marker {
  peer: string
  kind: 'received' | 'displayed'
  id: string // the marked message's origin-id
  ts: number
  mine: boolean
}

export interface HistoryPage {
  messages: Message[]
  reactions: Reaction[] // in archive order: a later one replaces an earlier one of the same person
  markers: Marker[]
  complete: boolean
  first?: string
}

export interface GroupInfo {
  peer: string
  name: string
  members: string[]
  avatar?: string // data URL, from the room's vCard
  owner?: boolean // I created it: leaving means deleting it for everyone
}

type Handlers = {
  message: (m: Message) => void
  reaction: (r: Reaction) => void
  marker: (m: Marker) => void
  presence: (peer: string, online: boolean) => void
  typing: (peer: string, composing: boolean) => void
  status: (s: 'connecting' | 'online' | 'offline' | 'error' | 'unauthorized', err?: string) => void
  groupInvite: (room: string) => void
  groupDestroyed: (room: string) => void
}

export class Chat {
  private xmpp: Client
  private me: string
  private domain: string
  readonly mucHost: string
  private uploadService?: string
  private mamQueries = new Map<string, Message[]>()
  private mamReactions = new Map<string, Reaction[]>()
  private mamMarkers = new Map<string, Marker[]>()
  private stopped = false
  private attempt = 0 // failed connections in a row, drives the retry delay
  private retryTimer?: number
  private pingTimer?: number
  private unauthorized = false // the token was refused: retrying would only hammer the server
  private connected = false
  private online = new Map<string, Set<string>>() // user -> resources seen available
  private cfg: Config
  private h: Handlers

  constructor(cfg: Config, h: Handlers) {
    this.cfg = cfg
    this.h = h
    this.domain = DOMAIN
    this.mucHost = `conference.${DOMAIN}`
    this.me = `${cfg.username}@${DOMAIN}`
    this.xmpp = client({
      service: `wss://${cfg.host}/xmpp-websocket`,
      domain: DOMAIN,
      username: cfg.username,
      password: cfg.token,
      resource: 'chat-island.' + Math.random().toString(36).slice(2, 8),
    })
    // The library's own reconnect retries every second forever; ours backs off.
    ;(this.xmpp as unknown as { reconnect?: { stop(): void } }).reconnect?.stop()
    this.xmpp.on('status', (s: string) => {
      if (this.stopped || this.unauthorized) return
      if (s === 'connecting' || s === 'opening' || s === 'connect') this.h.status('connecting')
      if (s === 'disconnect' || s === 'close') {
        this.connected = false
        window.clearInterval(this.pingTimer)
        this.forgetPresence()
        this.h.status('offline')
      }
      if (s === 'disconnect') this.scheduleRetry()
    })
    this.xmpp.on('error', (e: Error) => {
      if (this.stopped) return
      if (isAuthError(e)) {
        this.unauthorized = true
        window.clearTimeout(this.retryTimer)
        this.h.status('unauthorized', e.message)
        return
      }
      this.h.status('error', e.message)
    })
    this.xmpp.on('online', async () => {
      if (this.stopped) {
        await this.xmpp.stop().catch(() => {})
        return
      }
      this.attempt = 0
      this.connected = true
      try {
        await this.xmpp.send(xml('iq', { type: 'set', id: 'carbons' }, xml('enable', { xmlns: NS.carbons })))
        await this.xmpp.send(xml('presence'))
      } catch {
        return // the socket dropped again: the disconnect handler retries
      }
      window.clearInterval(this.pingTimer)
      this.pingTimer = window.setInterval(() => this.ping(), PING_EVERY)
      this.h.status('online')
    })
    this.xmpp.on('stanza', (st: Element) => this.onStanza(st))
  }

  start() {
    window.addEventListener('online', this.wake)
    document.addEventListener('visibilitychange', this.onVisible)
    this.h.status('connecting')
    // Open the socket on the next tick: a client stopped right after start (React
    // StrictMode mounts twice in development) then never opens a connection at all.
    setTimeout(() => this.connectNow(), 0)
  }

  stop() {
    this.stopped = true
    window.clearTimeout(this.retryTimer)
    window.clearInterval(this.pingTimer)
    window.removeEventListener('online', this.wake)
    document.removeEventListener('visibilitychange', this.onVisible)
    return this.xmpp.stop().catch(() => {})
  }

  /** The network is back, or the tab is looked at again: check now instead of waiting for the timer. */
  private wake = () => {
    if (this.stopped || this.unauthorized) return
    if (this.connected) {
      this.ping()
      return
    }
    window.clearTimeout(this.retryTimer)
    this.attempt = 0
    this.connectNow()
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') this.wake()
  }

  /** XEP-0199: a server that does not answer means a dead socket; drop it so the retry logic takes over. */
  private ping() {
    if (!this.connected) return
    this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: this.domain }, xml('ping', { xmlns: NS.ping })), 10000).catch((e: Error) => {
      if (this.stopped || !this.connected || e.name === 'StanzaError') return // an error reply is still an answer
      ;(this.xmpp as unknown as { disconnect(): Promise<void> }).disconnect().catch(() => {})
    })
  }

  /** Nobody is known to be online while I am not connected myself. */
  private forgetPresence() {
    for (const user of this.online.keys()) this.h.presence(user, false)
    this.online.clear()
  }

  /** Connect, or reconnect: a failure (network, or a token the server no longer accepts) schedules another try. */
  private connectNow() {
    if (this.stopped || this.unauthorized) return
    this.retryTimer = undefined
    const x = this.xmpp as unknown as { status: string; options: { service: string; domain: string }; connect(s: string): Promise<void>; open(o: { domain: string }): Promise<unknown> }
    const attempt = x.status === 'offline' ? this.xmpp.start() : x.connect(x.options.service).then(() => x.open({ domain: x.options.domain }))
    attempt.catch((e: Error) => {
      if (this.stopped) return
      if (isAuthError(e)) {
        this.unauthorized = true
        this.h.status('unauthorized', e.message)
        return
      }
      this.h.status('error', e.message)
      this.scheduleRetry()
    })
  }

  /** 1s, 2s, 4s… up to a minute, with jitter; one timer at a time. */
  private scheduleRetry() {
    if (this.stopped || this.unauthorized || this.retryTimer !== undefined) return
    const delay = Math.min(60000, 1000 * 2 ** this.attempt) * (0.7 + Math.random() * 0.6)
    this.attempt++
    this.retryTimer = window.setTimeout(() => this.connectNow(), delay)
  }

  isGroup(peer: string) {
    return peer.endsWith('@' + this.mucHost)
  }

  // ---- outgoing ----

  /** Send to an operator (username) or to a group (room address); a reply quotes its target in the body too, for other clients. */
  async send(peer: string, body: string, oob?: string, reply?: Reply): Promise<Message> {
    const id = crypto.randomUUID()
    const group = this.isGroup(peer)
    const fallback = reply ? `> ${reply.quote ?? ''}\n` : ''
    const children: Element[] = [xml('body', {}, fallback + body), xml('origin-id', { xmlns: NS.sid, id }), xml('store', { xmlns: NS.hints })]
    if (oob) children.push(xml('x', { xmlns: NS.oob }, xml('url', {}, oob)))
    if (reply) {
      children.push(xml('reply', { xmlns: NS.reply, id: reply.id, to: group ? `${peer}/${reply.author}` : `${reply.author}@${this.domain}` }))
      children.push(xml('fallback', { xmlns: NS.fallback, for: NS.reply }, xml('body', { start: '0', end: String([...fallback].length) })))
    }
    if (group) {
      await this.xmpp.send(xml('message', { to: peer, type: 'groupchat', id }, ...children))
      return { id, oid: id, from: peer, to: this.cfg.username, body, ts: Date.now(), mine: true, oob, room: peer, nick: this.cfg.username, reply }
    }
    children.push(xml('active', { xmlns: NS.chatstates }), xml('markable', { xmlns: NS.markers }))
    await this.xmpp.send(xml('message', { to: `${peer}@${this.domain}`, type: 'chat', id }, ...children))
    return { id, oid: id, from: this.cfg.username, to: peer, body, ts: Date.now(), mine: true, oob, reply }
  }

  /** XEP-0333: tell the peer I received or read up to this message. Archived, so the ticks survive a reload. */
  async marker(peer: string, kind: 'received' | 'displayed', id: string) {
    await this.xmpp.send(xml('message', { to: `${peer}@${this.domain}`, type: 'chat', id: crypto.randomUUID() }, xml(kind, { xmlns: NS.markers, id }), xml('store', { xmlns: NS.hints })))
  }

  /** XEP-0444: my whole set of reactions to one message; an empty set takes them back. Archived like a message. */
  async react(peer: string, target: string, emojis: string[]) {
    const group = this.isGroup(peer)
    const reactions = xml('reactions', { xmlns: NS.reactions, id: target }, ...emojis.map((e) => xml('reaction', {}, e)))
    await this.xmpp.send(
      xml('message', { to: group ? peer : `${peer}@${this.domain}`, type: group ? 'groupchat' : 'chat', id: crypto.randomUUID() }, reactions, xml('store', { xmlns: NS.hints })),
    )
  }

  /** Tell these operators I am here (directed presence). Those online answer, so both sides see each other. */
  async announce(peers: string[]) {
    for (const peer of peers) {
      await this.xmpp.send(xml('presence', { to: `${peer}@${this.domain}` }, xml('x', { xmlns: NS.hello }))).catch(() => {})
    }
  }

  typing(peer: string, composing: boolean) {
    if (this.isGroup(peer)) return Promise.resolve()
    return this.xmpp.send(
      xml('message', { to: `${peer}@${this.domain}`, type: 'chat' }, xml(composing ? 'composing' : 'paused', { xmlns: NS.chatstates })),
    )
  }

  /** XEP-0357: ask the server to notify `service` on node `node` when I am offline. */
  enablePush(service: string, node: string) {
    return this.xmpp.iqCaller.request(xml('iq', { type: 'set' }, xml('enable', { xmlns: NS.push, jid: service, node })), 15000)
  }

  /** Logging out: this browser must not be woken for this account any more. */
  disablePush(service: string, node: string) {
    return this.xmpp.iqCaller.request(xml('iq', { type: 'set' }, xml('disable', { xmlns: NS.push, jid: service, node })), 5000)
  }

  /** The newest `max` archived messages with anyone: what the conversation list is built from. */
  async recent(max = 200): Promise<HistoryPage> {
    return this.mam(undefined, undefined, max)
  }

  /** History with one operator or group, newest page first; pass `before` (archive id) to page back. */
  history(peer: string, before?: string, max = 30): Promise<HistoryPage> {
    return this.mam(peer, before, max)
  }

  private async mam(peer: string | undefined, before: string | undefined, max: number): Promise<HistoryPage> {
    const queryid = crypto.randomUUID()
    this.mamQueries.set(queryid, [])
    this.mamReactions.set(queryid, [])
    this.mamMarkers.set(queryid, [])
    const rsm = xml('set', { xmlns: NS.rsm }, xml('max', {}, String(max)), xml('before', {}, before ?? ''))
    const fields = [xml('field', { var: 'FORM_TYPE', type: 'hidden' }, xml('value', {}, NS.mam))]
    if (peer) fields.push(xml('field', { var: 'with' }, xml('value', {}, this.isGroup(peer) ? peer : `${peer}@${this.domain}`)))
    const form = xml('x', { xmlns: NS.data, type: 'submit' }, ...fields)
    let res: Element
    let messages: Message[]
    let reactions: Reaction[]
    let markers: Marker[]
    try {
      res = await this.xmpp.iqCaller.request(xml('iq', { type: 'set', id: queryid }, xml('query', { xmlns: NS.mam, queryid }, form, rsm)), 30000)
    } finally {
      messages = this.mamQueries.get(queryid) ?? []
      reactions = this.mamReactions.get(queryid) ?? []
      markers = this.mamMarkers.get(queryid) ?? []
      this.mamQueries.delete(queryid)
      this.mamReactions.delete(queryid)
      this.mamMarkers.delete(queryid)
    }
    const fin = res.getChild('fin', NS.mam)
    const first = fin?.getChild('set', NS.rsm)?.getChildText('first') ?? undefined
    return { messages, reactions, markers, complete: fin?.attrs.complete === 'true', first }
  }

  // ---- groups ----

  /** Create a group: a persistent members-only room, everyone subscribed, nobody joined. */
  async createGroup(name: string, members: string[], avatar?: string): Promise<string> {
    const room = `g-${Math.random().toString(36).slice(2, 10)}@${this.mucHost}`
    const nick = this.cfg.username
    // 1. Joining an unknown room creates it and makes me its owner.
    const created = this.waitFor((st) => st.is('presence') && bare(st.attrs.from) === room, 10000)
    await this.xmpp.send(xml('presence', { to: `${room}/${nick}` }, xml('x', { xmlns: NS.muc })))
    await created
    // 2. Configure it: named, persistent, members only, hidden, subscribable, archived.
    const field = (v: string, value: string) => xml('field', { var: v }, xml('value', {}, value))
    await this.xmpp.iqCaller.request(
      xml('iq', { type: 'set', to: room }, xml('query', { xmlns: NS.mucOwner }, xml('x', { xmlns: NS.data, type: 'submit' },
        field('FORM_TYPE', 'http://jabber.org/protocol/muc#roomconfig'),
        field('muc#roomconfig_roomname', name),
        field('muc#roomconfig_persistentroom', '1'),
        field('muc#roomconfig_membersonly', '1'),
        field('muc#roomconfig_publicroom', '0'),
        field('muc#roomconfig_whois', 'anyone'),
        field('allow_subscription', '1'),
        field('mam', '1'),
      ))),
      15000,
    )
    if (avatar) await this.setGroupAvatar(room, avatar).catch(() => {})
    // 3. Members, then their subscriptions (an owner may subscribe others), then mine.
    const others = members.filter((m) => m && m !== this.cfg.username)
    // The order members were added, kept in their affiliation: the first one inherits the group when the owner leaves the company.
    const added = Date.now()
    await this.xmpp.iqCaller.request(
      xml('iq', { type: 'set', to: room }, xml('query', { xmlns: NS.mucAdmin }, ...others.map((u, i) => xml('item', { affiliation: 'member', jid: `${u}@${this.domain}` }, xml('reason', {}, String(added + i)))))),
      15000,
    )
    for (const u of others) {
      await this.xmpp.iqCaller
        .request(xml('iq', { type: 'set', to: room }, xml('subscribe', { xmlns: NS.mucsub, jid: `${u}@${this.domain}`, nick: u }, xml('event', { node: NS.mucsubMessages }), xml('event', { node: NS.mucsubConfig }))), 15000)
        .catch(() => {})
    }
    await this.xmpp.iqCaller.request(xml('iq', { type: 'set', to: room }, xml('subscribe', { xmlns: NS.mucsub, nick }, xml('event', { node: NS.mucsubMessages }), xml('event', { node: NS.mucsubConfig }))), 15000)
    // 4. Leave the room: subscribers get messages without being in it.
    await this.xmpp.send(xml('presence', { to: `${room}/${nick}`, type: 'unavailable' }))
    // 5. Tell the members now, so their open clients pick the group up at once.
    for (const u of others) {
      await this.xmpp.send(xml('message', { to: `${u}@${this.domain}` }, xml('x', { xmlns: NS.conference, jid: room, reason: name }))).catch(() => {})
    }
    return room
  }

  /** Leave a group. The owner cannot just walk away: the room is destroyed, for everyone. */
  async leaveGroup(room: string, owner: boolean) {
    if (owner) await this.xmpp.iqCaller.request(xml('iq', { type: 'set', to: room }, xml('query', { xmlns: NS.mucOwner }, xml('destroy', {}))), 10000)
    else await this.xmpp.iqCaller.request(xml('iq', { type: 'set', to: room }, xml('unsubscribe', { xmlns: NS.mucsub })), 10000)
  }

  /** The group's picture lives in the room's vCard (XEP-0054), as any XMPP client would expect. */
  async setGroupAvatar(room: string, dataUrl: string) {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl)
    if (!m) return
    await this.xmpp.iqCaller.request(xml('iq', { type: 'set', to: room }, xml('vCard', { xmlns: NS.vcard }, xml('PHOTO', {}, xml('TYPE', {}, m[1]), xml('BINVAL', {}, m[2])))), 15000)
  }

  private async groupAvatar(room: string): Promise<string | undefined> {
    const res = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: room }, xml('vCard', { xmlns: NS.vcard })), 10000)
    const photo = res.getChild('vCard', NS.vcard)?.getChild('PHOTO')
    const data = photo?.getChildText('BINVAL')
    return data ? `data:${photo?.getChildText('TYPE') || 'image/jpeg'};base64,${data.replace(/\s+/g, '')}` : undefined
  }

  /** The groups I am subscribed to, with their names and members. */
  async listGroups(): Promise<GroupInfo[]> {
    const res = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: this.mucHost }, xml('subscriptions', { xmlns: NS.mucsub })), 15000)
    const rooms = (res.getChild('subscriptions', NS.mucsub)?.getChildren('subscription') ?? []).map((s: Element) => s.attrs.jid as string)
    return Promise.all(rooms.map((room) => this.groupInfo(room)))
  }

  /** Whether I am subscribed to a room: an invitation alone proves nothing, anybody can send one. */
  async subscribed(room: string): Promise<boolean> {
    const res = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: this.mucHost }, xml('subscriptions', { xmlns: NS.mucsub })), 15000)
    return (res.getChild('subscriptions', NS.mucsub)?.getChildren('subscription') ?? []).some((s: Element) => bare(s.attrs.jid) === room)
  }

  async groupInfo(room: string): Promise<GroupInfo> {
    let name = room.split('@')[0]
    let members: string[] = []
    let owner = false
    try {
      const info = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: room }, xml('query', { xmlns: NS.discoInfo })), 10000)
      name = info.getChild('query', NS.discoInfo)?.getChild('identity')?.attrs.name || name
    } catch {
      /* keep the address */
    }
    try {
      const list = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: room }, xml('query', { xmlns: NS.mucAdmin }, xml('item', { affiliation: 'member' }))), 10000)
      members = (list.getChild('query', NS.mucAdmin)?.getChildren('item') ?? []).map((i: Element) => local(i.attrs.jid))
      const owners = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: room }, xml('query', { xmlns: NS.mucAdmin }, xml('item', { affiliation: 'owner' }))), 10000)
      for (const i of owners.getChild('query', NS.mucAdmin)?.getChildren('item') ?? []) {
        members.push(local(i.attrs.jid))
        if (local(i.attrs.jid) === this.cfg.username) owner = true
      }
    } catch {
      /* not allowed to see the list */
    }
    const avatar = await this.groupAvatar(room).catch(() => undefined)
    return { peer: room, name, members: [...new Set(members)], avatar, owner }
  }

  // ---- files ----

  /** Upload a file with XEP-0363 and return its public URL. */
  async upload(file: File): Promise<string> {
    const service = await this.findUploadService()
    const res = await this.xmpp.iqCaller.request(
      xml('iq', { type: 'get', to: service }, xml('request', { xmlns: NS.upload, filename: file.name, size: String(file.size), 'content-type': file.type || 'application/octet-stream' })),
      30000,
    )
    const slot = res.getChild('slot', NS.upload)
    const put = slot?.getChild('put')
    const get = slot?.getChild('get')?.attrs.url
    if (!put || !get) throw new Error('upload: no slot')
    const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' }
    for (const hd of put.getChildren('header')) headers[hd.attrs.name] = hd.text()
    const r = await fetch(put.attrs.url, { method: 'PUT', headers, body: file })
    if (!r.ok) throw new Error(`upload: HTTP ${r.status}`)
    return get
  }

  private async findUploadService(): Promise<string> {
    if (this.uploadService) return this.uploadService
    const hasUpload = async (target: string) => {
      try {
        const info = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: target }, xml('query', { xmlns: NS.discoInfo })), 10000)
        return info.getChild('query', NS.discoInfo)?.getChildren('feature').some((f: Element) => f.attrs.var === NS.upload) ?? false
      } catch {
        return false // a service that does not answer disco is not the upload service
      }
    }
    const candidates = [`upload.${this.domain}`]
    try {
      const items = await this.xmpp.iqCaller.request(xml('iq', { type: 'get', to: this.domain }, xml('query', { xmlns: NS.disco })), 10000)
      for (const item of items.getChild('query', NS.disco)?.getChildren('item') ?? []) if (!candidates.includes(item.attrs.jid)) candidates.push(item.attrs.jid)
    } catch {
      /* fall back to the conventional name only */
    }
    for (const jid of candidates) {
      if (await hasUpload(jid)) {
        this.uploadService = jid
        return jid
      }
    }
    throw new Error('upload: service not found')
  }

  // ---- incoming ----

  private waiters: { test: (st: Element) => boolean; resolve: () => void }[] = []
  private waitFor(test: (st: Element) => boolean, timeout: number) {
    return new Promise<void>((resolve, reject) => {
      const w = { test, resolve }
      this.waiters.push(w)
      setTimeout(() => {
        const i = this.waiters.indexOf(w)
        if (i >= 0) {
          this.waiters.splice(i, 1)
          reject(new Error('timeout'))
        }
      }, timeout)
    })
  }

  private onStanza(st: Element) {
    for (const w of [...this.waiters]) {
      if (w.test(st)) {
        this.waiters.splice(this.waiters.indexOf(w), 1)
        w.resolve()
      }
    }
    if (st.is('presence')) {
      const full = st.attrs.from ?? ''
      const from = bare(full)
      if (!from || from === this.me || from.endsWith('@' + this.mucHost) || st.attrs.type === 'error' || st.attrs.type?.startsWith('subscribe')) return
      const user = local(from)
      const resources = this.online.get(user) ?? new Set<string>()
      if (st.attrs.type === 'unavailable') resources.delete(full)
      else resources.add(full)
      this.online.set(user, resources)
      this.h.presence(user, resources.size > 0)
      // A greeting deserves one answer, so the newcomer learns I am online too.
      const hello = st.getChild('x', NS.hello)
      if (hello && !hello.attrs.reply && st.attrs.type !== 'unavailable') {
        this.xmpp.send(xml('presence', { to: from }, xml('x', { xmlns: NS.hello, reply: '1' }))).catch(() => {})
      }
      return
    }
    if (!st.is('message')) return
    // MAM results and carbons are only valid from my own server (no forged forwards).
    const fromMe = !st.attrs.from || bare(st.attrs.from) === this.me
    const result = st.getChild('result', NS.mam)
    if (result) {
      if (!fromMe) return
      const inner = result.getChild('forwarded', NS.forward)?.getChild('message')
      const list = this.mamQueries.get(result.attrs.queryid)
      if (inner && list) {
        const stamp = stampOf(result.getChild('forwarded', NS.forward))
        const mk = this.markerOf(inner, stamp)
        if (mk) this.mamMarkers.get(result.attrs.queryid)?.push(mk)
        const r = mk ? undefined : this.reactionOf(inner)
        if (r) this.mamReactions.get(result.attrs.queryid)?.push(r)
        const m = r || mk ? undefined : this.toMessage(inner, result.attrs.id, stampOf(result.getChild('forwarded', NS.forward)))
        if (m) list.push(m)
      }
      return
    }
    // Carbon copies of what my other clients sent or received.
    const carbon = st.getChild('received', NS.carbons) ?? st.getChild('sent', NS.carbons)
    if (carbon) {
      if (!fromMe) return
      const inner = carbon.getChild('forwarded', NS.forward)?.getChild('message')
      if (inner) this.deliver(inner)
      return
    }
    // A group its owner destroyed: ejabberd tells subscribers on the config node.
    const ev = st.getChild('event', NS.pubsubEvent)
    if (ev?.getChild('items')?.attrs.node === NS.mucsubConfig) {
      const room = bare(st.attrs.from)
      if (this.isGroup(room) && findChild(ev, 'presence')?.getChild('x', NS.mucUser)?.getChild('destroy')) this.h.groupDestroyed(room)
      return
    }
    // A group I was added to.
    const invite = st.getChild('x', NS.conference)
    if (invite) {
      const room = bare(invite.attrs.jid)
      if (this.isGroup(room)) this.h.groupInvite(room)
      return
    }
    this.deliver(st)
  }

  private deliver(st: Element) {
    const mk = this.markerOf(st, stampOf(st))
    if (mk) {
      this.h.marker(mk)
      return
    }
    const r = this.reactionOf(st)
    if (r) {
      this.h.reaction(r)
      return
    }
    const m = this.toMessage(st, st.getChild('stanza-id', NS.sid)?.attrs.id, stampOf(st))
    if (m) {
      this.h.message(m)
      return
    }
    if (st.attrs.type !== 'chat') return
    const from = bare(st.attrs.from)
    const peer = from === this.me ? bare(st.attrs.to) : from
    const state = st.getChildByAttr('xmlns', NS.chatstates)
    if (!st.getChild('body') && state) this.h.typing(local(peer), state.name === 'composing')
  }

  /** A chat marker on a one-to-one message, live, carbon or archived. */
  private markerOf(st: Element, ts: number): Marker | undefined {
    if (st.attrs.type !== 'chat') return undefined
    const el = st.getChild('received', NS.markers) ?? st.getChild('displayed', NS.markers)
    if (!el?.attrs.id) return undefined
    const from = bare(st.attrs.from)
    const mine = from === this.me || !st.attrs.from
    const peer = mine ? local(bare(st.attrs.to)) : local(from)
    return peer ? { peer, kind: el.name as Marker['kind'], id: el.attrs.id, ts, mine } : undefined
  }

  /** A reactions stanza (XEP-0444), live, carbon, archived or wrapped by MucSub; only from where it may come from. */
  private reactionOf(st: Element): Reaction | undefined {
    const event = st.getChild('event', NS.pubsubEvent)
    let msg = st
    let room: string | undefined
    if (event && event.getChild('items')?.attrs.node === NS.mucsubMessages) {
      room = bare(st.attrs.from)
      const inner = findMessage(event)
      if (!this.isGroup(room) || !inner || bare(inner.attrs.from) !== room) return undefined
      msg = inner
    } else if (st.attrs.type === 'groupchat') {
      room = bare(st.attrs.from)
      if (!this.isGroup(room)) return undefined
    }
    const el = msg.getChild('reactions', NS.reactions)
    const target = el?.attrs.id
    if (!el || !target) return undefined
    const emojis = [...new Set(el.getChildren('reaction').map((r: Element) => r.text().trim()).filter((e: string) => e && e.length <= 16))].slice(0, 5)
    if (room) {
      const nick = (msg.attrs.from ?? '').split('/')[1] ?? ''
      return nick ? { peer: room, target, user: nick, emojis } : undefined
    }
    if (msg.attrs.type !== 'chat') return undefined
    const from = bare(msg.attrs.from)
    const mine = from === this.me || !msg.attrs.from
    const peer = mine ? local(bare(msg.attrs.to)) : local(from)
    return peer ? { peer, target, user: mine ? this.cfg.username : local(from), emojis } : undefined
  }

  /** Flatten a message stanza; a MucSub wrapper is unwrapped to the group message inside. */
  private toMessage(st: Element, archiveId: string | undefined, ts: number): Message | undefined {
    const m = this.parseMessage(st, archiveId, ts)
    if (m?.oob) {
      // Uploads are served by this CTI host, whatever host the link was made under.
      const local = this.uploadUrl(m.oob)
      m.body = m.body === m.oob ? local : m.body
      m.oob = local
    }
    return m && withReply(m, findChild(st, 'reply') ? (st.getChild('event', NS.pubsubEvent) ? findMessage(st.getChild('event', NS.pubsubEvent)!) : st) : undefined)
  }

  private uploadUrl(link: string): string {
    const i = link.indexOf('/upload/')
    return /^https:\/\/[^/]+\/upload\//.test(link) ? `https://${this.cfg.host}${link.slice(i)}` : link
  }

  private parseMessage(st: Element, archiveId: string | undefined, ts: number): Message | undefined {
    // ejabberd hands a subscriber the group message as a pubsub event:
    // <event xmlns="…/pubsub#event"><items node="urn:xmpp:mucsub:nodes:messages"><item><message type="groupchat">…
    const event = st.getChild('event', NS.pubsubEvent)
    if (event && event.getChild('items')?.attrs.node === NS.mucsubMessages) {
      const room = bare(st.attrs.from)
      if (!this.isGroup(room)) return undefined // only a room hands out room messages
      const inner = findMessage(event)
      if (!inner || bare(inner.attrs.from) !== room) return undefined
      const nick = (inner.attrs.from ?? '').split('/')[1] ?? ''
      const body = inner.getChildText('body')
      if (body === null || body === undefined) return undefined
      return {
        // The origin-id is the one the sender chose: my own copy shown while sending is replaced by the echo.
        id: inner.getChild('origin-id', NS.sid)?.attrs.id ?? archiveId ?? inner.getChild('stanza-id', NS.sid)?.attrs.id ?? inner.attrs.id ?? crypto.randomUUID(),
        oid: inner.getChild('origin-id', NS.sid)?.attrs.id ?? inner.attrs.id,
        from: room,
        to: this.cfg.username,
        body,
        ts: stampOf(inner) !== ts && inner.getChild('delay', NS.delay) ? stampOf(inner) : ts,
        mine: nick === this.cfg.username,
        oob: inner.getChild('x', NS.oob)?.getChildText('url') ?? undefined,
        room,
        nick,
      }
    }
    const body = st.getChildText('body')
    if (body === null || body === undefined) return undefined
    const from = bare(st.attrs.from)
    if (st.attrs.type === 'groupchat') {
      if (!this.isGroup(from)) return undefined
      // A live echo from a room I happen to be joined in (creation): same shape as a subscription message.
      const nick = (st.attrs.from ?? '').split('/')[1] ?? ''
      return { id: archiveId ?? st.getChild('origin-id', NS.sid)?.attrs.id ?? st.attrs.id ?? crypto.randomUUID(), oid: st.getChild('origin-id', NS.sid)?.attrs.id ?? st.attrs.id, from, to: this.cfg.username, body, ts, mine: nick === this.cfg.username, oob: st.getChild('x', NS.oob)?.getChildText('url') ?? undefined, room: from, nick }
    }
    if (st.attrs.type !== 'chat') return undefined
    const mine = from === this.me
    return {
      id: archiveId ?? st.getChild('origin-id', NS.sid)?.attrs.id ?? st.attrs.id ?? crypto.randomUUID(),
      oid: st.getChild('origin-id', NS.sid)?.attrs.id ?? st.attrs.id,
      from: local(from),
      to: local(bare(st.attrs.to)),
      body,
      ts,
      mine,
      oob: st.getChild('x', NS.oob)?.getChildText('url') ?? undefined,
    }
  }
}

const bare = (jid = '') => jid.split('/')[0]

/** XEP-0461 reply on a parsed message: the target, and the body without the quote (XEP-0428 fallback range). */
function withReply(m: Message, el?: Element): Message {
  const r = el?.getChild('reply', NS.reply)
  if (!r?.attrs.id) return m
  const to: string = r.attrs.to ?? ''
  const author = m.room ? to.split('/')[1] ?? '' : local(bare(to))
  const range = el!.getChildren('fallback', NS.fallback).find((f: Element) => f.attrs.for === NS.reply)?.getChild('body')
  const chars = [...m.body]
  const start = Number(range?.attrs.start ?? 0)
  const end = Number(range?.attrs.end ?? 0)
  if (!range || !(end > start) || end > chars.length) return { ...m, reply: { id: r.attrs.id, author } }
  const quote = chars.slice(start, end).join('').replace(/^> ?/gm, '').trim()
  return { ...m, body: (chars.slice(0, start).join('') + chars.slice(end).join('')).trim(), reply: { id: r.attrs.id, author, quote } }
}
/** SASL refused the token: an expired or revoked CTI session, not a network problem. */
const isAuthError = (e: Error & { condition?: string }) => e.name === 'SASLError' || e.condition === 'not-authorized'
const local = (jid = '') => jid.split('@')[0]
const stampOf = (el?: Element | null) => {
  const stamp = el?.getChild('delay', NS.delay)?.attrs.stamp
  return stamp ? Date.parse(stamp) : Date.now()
}
/** The <message> nested anywhere inside a MucSub event. */
function findChild(el: Element, name: string): Element | undefined {
  for (const c of el.children) {
    if (typeof c === 'string') continue
    if (c.name === name) return c
    const deeper = findChild(c, name)
    if (deeper) return deeper
  }
  return undefined
}

const findMessage = (el: Element) => findChild(el, 'message')
