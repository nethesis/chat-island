import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDrag } from './drag'
import { Chat, DOMAIN } from './xmpp'
import { chime } from './sound'
import { peerOf, useStore } from './store'
import { deleteHistory, fetchContacts, fetchInactive, fetchMobile } from './api'
import { registerWebPush } from './push'
import { emit, listen, type ContactsEvent } from './events'
import { Dock } from './components/Dock'
import { ChatWindow, type WindowActions } from './components/ChatWindow'
import { NewChat } from './components/NewChat'
import { appAttachment } from './components/MessageList'
import { emojify } from './shortcodes'
import type { Config, ConversationSummary, Message } from './types'
import { useDark, type Theme } from './theme'
import './index.css'

export interface ChatIslandProps {
  /** Base64 of "<cti_host>:<cti_username>:<cti_token>", the same shape phone-island uses. */
  dataConfig: string
  /** Where the island sits; default bottom-right. */
  position?: 'bottom-right' | 'bottom-left'
  /** 'light', 'dark' or 'system'; default follows the host's `dark` class on <html>. */
  theme?: Theme
  /** URL of chat-island-sw.js served by the host app; enables notifications when the tab is closed. */
  serviceWorker?: string
  /** How many chat heads the dock keeps; older ones drop off. Default 5. */
  maxHeads?: number
  /** Show the "new chat" button with the operator picker. Off when the host has its own list. Default true. */
  newChatButton?: boolean
  /** Notification permission: 'auto' asks once online, 'click' waits for the bell. Default 'click'. */
  notifications?: 'auto' | 'click'
  /** Play a short chime when a message arrives and its window is not in view (default true). */
  sound?: boolean
  /** Drag the island around the page (default true); off when the host moves its own window. */
  drag?: boolean
  /** Host drag from the dock and the window header, instead of the island's own (e.g. to move an app window). */
  onDragStart?: (e: React.PointerEvent) => void
}

function summarize(): ConversationSummary[] {
  const st = useStore.getState()
  return Object.values(st.conversations)
    .map((c) => {
      const m = c.messages[c.messages.length - 1]
      const contact = st.contacts[c.peer]
      return {
        peer: c.peer,
        kind: c.kind,
        name: c.kind === 'group' ? c.name ?? c.peer.split('@')[0] : contact?.name ?? st.inactive[c.peer] ?? c.peer,
        inactive: c.kind === 'group' ? undefined : !!st.inactive[c.peer],
        avatar: c.kind === 'group' ? c.avatar : contact?.avatar,
        online: c.kind === 'group' ? false : !!st.online[c.peer],
        mobile: c.kind === 'group' ? false : !!st.mobile[c.peer],
        owner: c.kind === 'group' ? !!c.owner : undefined,
        unread: c.unread,
        members: c.members,
        last: m ? { body: plain(m.body), ts: m.ts, mine: m.mine, oob: m.oob, nick: m.nick } : undefined,
      }
    })
    .filter((c) => c.last || c.kind === 'group')
    .sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0))
}

/** Keeps a render error from unmounting the host page; closes the window, gives up after 3 failures. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  private failures: number[] = []
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: Error) {
    emit('chat-island-error', { scope: 'render', message: e.message })
    const now = Date.now()
    this.failures = [...this.failures.filter((t) => now - t < 10000), now]
    if (this.failures.length >= 3) return
    useStore.getState().closeChat()
    window.setTimeout(() => this.setState({ failed: false }), 0)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function parseConfig(dataConfig: string): Config | null {
  try {
    const [host, username, token] = atob(dataConfig).split(':')
    return host && username && token ? { host, username, token } : null
  } catch {
    return null
  }
}

/** A one-line preview of a message: Markdown marks dropped, a code block shown as its text. */
const plain = (t: string) => (appAttachment(t) ? 'Attachment' : emojify(t)).replace(/```[^\n]*\n?/g, '').replace(/(\*\*|__|~~|`)/g, '').replace(/(^|\s)[*_](\S[^*_]*)[*_]/g, '$1$2').replace(/\s+/g, ' ').trim()

export function ChatIsland({ dataConfig, position = 'bottom-right', theme, serviceWorker, maxHeads = 5, newChatButton = true, notifications = 'click', sound = true, drag: draggable = true, onDragStart }: ChatIslandProps) {
  const cfg = useMemo(() => parseConfig(dataConfig), [dataConfig])
  const dark = useDark(theme)
  // Read at the moment they are needed: changing them must not tear the connection down.
  const cfgRef = useRef(cfg)
  const soundRef = useRef(sound)
  const notificationsRef = useRef(notifications)
  useEffect(() => {
    cfgRef.current = cfg
    soundRef.current = sound
    notificationsRef.current = notifications
  }, [cfg, sound, notifications])
  useEffect(() => useStore.setState({ maxHeads, newChatButton }), [maxHeads, newChatButton])
  // Back from the browser's page cache the old connection is gone: start a new one.
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setEpoch((n) => n + 1)
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])
  const chat = useRef<Chat | null>(null)
  const loading = useRef(new Set<string>())
  const pushDone = useRef(false)
  const pushNode = useRef<{ service: string; node: string } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useDrag(rootRef, `chat-island-pos:${cfg?.host ?? ''}:${cfg?.username ?? ''}`)
  const { open, picker, status } = useStore(useShallow((st) => ({ open: st.open, picker: st.picker, status: st.status })))

  const actions: WindowActions = useMemo(
    () => ({
      // A failure is thrown back to the composer, which gives the text back to the person.
      send: async (peer, text, reply) => {
        const c = chat.current
        if (!c) throw new Error('not connected')
        try {
          useStore.getState().addMessage(peer, await c.send(peer, emojify(text), undefined, reply))
        } catch (e) {
          emit('chat-island-error', { scope: 'send', message: (e as Error).message })
          throw e
        }
      },
      // Typing hints only to someone in the chat: to an offline account they would turn into empty pushes.
      typing: (peer, composing) => useStore.getState().online[peer] && chat.current?.typing(peer, composing).catch(() => {}),
      upload: async (peer, file) => {
        const c = chat.current
        if (!c) return
        try {
          const url = await c.upload(file)
          useStore.getState().addMessage(peer, await c.send(peer, file.name, url))
        } catch (e) {
          emit('chat-island-error', { scope: 'upload', message: (e as Error).message })
        }
      },
      createGroup: async (name, members, avatar) => {
        const c = chat.current
        const cfg = cfgRef.current
        if (!c || !cfg) return
        try {
          const room = await c.createGroup(name, members, avatar)
          const st = useStore.getState()
          st.setGroup(room, name, [...members, cfg.username], avatar)
          st.openChat(room)
        } catch (e) {
          emit('chat-island-error', { scope: 'group', message: (e as Error).message })
        }
      },
      // Delete a conversation: my archive is purged on the server; a group is left, or destroyed when I own it.
      remove: async (peer) => {
        const c = chat.current
        const cfg = cfgRef.current
        if (!c || !cfg) return
        const conv = useStore.getState().conversations[peer]
        try {
          // The room may already be gone (destroyed by its owner): the archive is purged anyway.
          if (conv?.kind === 'group') await c.leaveGroup(peer, !!conv.owner).catch(() => {})
          await deleteHistory(cfg.host, cfg.token, peer)
          useStore.getState().removeConversation(peer)
        } catch (e) {
          emit('chat-island-error', { scope: 'delete', message: (e as Error).message })
        }
      },
      // WhatsApp style: one reaction per person; the same one again takes it back.
      react: async (peer, target, emoji) => {
        const c = chat.current
        const me = cfgRef.current?.username
        if (!c || !me) return
        const mine = useStore.getState().conversations[peer]?.reactions?.[target]?.[me] ?? []
        const next = mine.includes(emoji) ? [] : [emoji]
        try {
          await c.react(peer, target, next)
          useStore.getState().applyReactions([{ peer, target, user: me, emojis: next }])
        } catch (e) {
          emit('chat-island-error', { scope: 'reaction', message: (e as Error).message })
        }
      },
      // One page at a time per conversation: scrolling fires this on every pixel near the top.
      loadOlder: async (peer) => {
        const c = chat.current
        const conv = useStore.getState().ensure(peer)
        if (!c || conv.complete || loading.current.has(peer)) return
        loading.current.add(peer)
        try {
          const page = await c.history(peer, conv.oldest)
          useStore.getState().prependHistory(peer, page.messages, page.complete, page.first)
          useStore.getState().applyReactions(page.reactions)
        } catch (e) {
          emit('chat-island-error', { scope: 'history', message: (e as Error).message })
        } finally {
          loading.current.delete(peer)
        }
      },
    }),
    [],
  )

  useEffect(() => {
    if (!cfg) return
    const s = useStore.getState()
    s.reset() // another account may have been here before (logout, then login as someone else)
    useStore.setState({ me: cfg.username, mucHost: `conference.${DOMAIN}`, maxHeads, newChatButton }) // eslint-disable-line react-hooks/exhaustive-deps
    const c = new Chat(cfg, {
      status: (st, err) => {
        s.setStatus(st, err)
        emit('chat-island-status', { status: st, error: err })
        if (st === 'online' && serviceWorker && !pushDone.current && typeof Notification !== 'undefined') {
          const p = Notification.permission
          if (p === 'granted' || (notificationsRef.current === 'auto' && p === 'default')) enable()
        }
        if (st === 'online') {
          c.listGroups()
            .then((groups) => groups.forEach((g) => s.setGroup(g.peer, g.name, g.members, g.avatar, g.owner)))
            .catch(() => {})
            .then(() => c.recent())
            .then((page) => {
              if (!page) return
              useStore.getState().seed(page.messages, cfg.username)
              useStore.getState().applyReactions(page.reactions)
            })
            .catch(() => {})
        }
      },
      typing: (peer, composing) => s.setTyping(peer, composing),
      reaction: (r) => s.applyReactions([r]),
      presence: (peer, online) => s.setOnline(peer, online),
      // The owner destroyed the group: it leaves the list here and in the host.
      groupDestroyed: (room) => s.removeConversation(room),
      // Anybody can send an invitation: the group shows only once the server says I am in it.
      groupInvite: (room) => {
        c.subscribed(room)
          .then(async (ok) => {
            if (!ok) return
            const g = await c.groupInfo(room)
            s.setGroup(g.peer, g.name, g.members, g.avatar, g.owner)
          })
          .catch(() => {})
      },
      message: (m) => {
        const peer = peerOf(m)
        if (m.room && !useStore.getState().conversations[m.room]?.name) c.groupInfo(m.room).then((g) => s.setGroup(g.peer, g.name, g.members, g.avatar, g.owner)).catch(() => {})
        s.addMessage(peer, m, { live: true })
        emit('chat-island-message', { ...m, peer })
        emit('chat-island-unread', { total: useStore.getState().totalUnread() })
        if (!m.mine) notify(peer, m)
      },
    })
    // A message the person is not looking at: chime, tell the host (a toast), and when the
    // page is hidden show a browser notification ourselves (push only wakes closed tabs).
    const notify = (peer: string, m: Message) => {
      const st = useStore.getState()
      const visible = document.visibilityState === 'visible'
      if (visible && st.open === peer) return
      const conv = st.conversations[peer]
      const name = conv?.kind === 'group' ? conv.name ?? peer : st.contacts[peer]?.name ?? st.inactive[peer] ?? peer
      const text = m.oob ? 'Attachment' : emojify(m.body)
      const group = conv?.kind === 'group'
      const author = group && m.nick ? st.contacts[m.nick]?.name ?? m.nick : name
      const body = group && m.nick ? `${author}: ${text}` : text
      if (soundRef.current) chime()
      const avatar = group ? conv?.avatar : st.contacts[peer]?.avatar
      emit('chat-island-notify', { peer, name, body, kind: group ? 'group' : 'chat', author, text, attachment: !!m.oob, avatar, ts: m.ts })
      if (!visible && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(name, { body, tag: `chat-${peer}` })
          n.onclick = () => {
            window.focus()
            useStore.getState().openChat(peer)
            n.close()
          }
        } catch {
          /* some browsers only allow notifications from a worker */
        }
      }
    }
    chat.current = c
    // Web Push: registering needs the notification permission, and browsers only
    // grant it on a click, so the dock shows a bell until it is done.
    const enable = () => {
      if (!serviceWorker || pushDone.current) return
      pushDone.current = true
      registerWebPush(cfg, serviceWorker)
        .then((p) => {
          if (!p) {
            pushDone.current = false
            useStore.setState({ push: Notification.permission === 'denied' ? 'denied' : 'ask' })
            return
          }
          return c.enablePush(p.service, p.node).then(() => {
            pushNode.current = p
            useStore.setState({ push: 'enabled' })
            emit('chat-island-push', { enabled: true })
          })
        })
        .catch((e) => {
          pushDone.current = false
          emit('chat-island-error', { scope: 'push', message: (e as Error).message })
        })
    }
    const canPush = !!serviceWorker && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
    useStore.setState({ push: !canPush ? 'unavailable' : Notification.permission === 'denied' ? 'denied' : 'ask', enablePush: enable })
    // Closing the page: end the stream so the server sees us gone now, not after the resume window.
    const bye = () => c.stop()
    window.addEventListener('pagehide', bye)
    c.start()
    // Who has the mobile app: refreshed now and then, it is not a live presence.
    const mobile = () => {
      fetchMobile(cfg.host, cfg.token).then(s.setMobile).catch(() => {})
      fetchInactive(cfg.host, cfg.token).then(s.setInactive).catch(() => {})
    }
    mobile()
    const mobileTimer = window.setInterval(mobile, 2 * 60 * 1000)
    fetchContacts(cfg.host, cfg.token, cfg.username, (myName) => useStore.setState({ myName }))
      .then(s.setContacts)
      .catch((e) => emit('chat-island-error', { scope: 'contacts', message: (e as Error).message }))
    const offOpen = listen<{ username: string }>('chat-island-open', ({ username }) => username && s.openChat(username))
    const offClose = listen('chat-island-close', () => s.closeChat())
    const offNew = listen('chat-island-new', () => s.setPicker(true))
    const offDelete = listen<{ username: string }>('chat-island-delete', ({ username }) => username && actions.remove(username))
    const offContacts = listen<ContactsEvent>('chat-island-contacts', ({ contacts }) => contacts && s.setContacts(contacts))
    const offList = listen('chat-island-conversations-request', () => emit('chat-island-conversations', { conversations: summarize() }))
    return () => {
      window.removeEventListener('pagehide', bye)
      window.clearInterval(mobileTimer)
      offList()
      offNew()
      offDelete()
      offOpen()
      offClose()
      offContacts()
      // Unmounting is a logout or an account change, never a page close (that is pagehide): stop waking this browser for this account.
      if (pushNode.current) c.disablePush(pushNode.current.service, pushNode.current.node).catch(() => {})
      pushNode.current = null
      c.stop()
      chat.current = null
      pushDone.current = false // the next connection registers again
    }
  }, [cfg, serviceWorker, epoch])

  // Once online and with the operator list in hand, greet everyone: that is how presence works here.
  const contactKeys = useStore((st) => Object.keys(st.contacts).join(','))
  useEffect(() => {
    if (status === 'online' && contactKeys) chat.current?.announce(contactKeys.split(','))
  }, [status, contactKeys])

  // The conversation list for the host: pushed whenever it changes.
  const listKey = useStore((st) =>
    Object.values(st.conversations)
      .map((c) => `${c.peer}:${c.kind}:${c.name ?? ''}:${(c.members ?? []).length}:${c.unread}:${c.messages[c.messages.length - 1]?.id ?? ''}`)
      .join('|') + '#' + Object.keys(st.contacts).length + '#' + Object.values(st.online).filter(Boolean).length + '#' + Object.keys(st.inactive).length,
  )
  useEffect(() => emit('chat-island-conversations', { conversations: summarize() }), [listKey])

  // Unread badge for the host, whenever it changes.
  const unread = useStore((st) => Object.values(st.conversations).reduce((n, c) => n + c.unread, 0))
  useEffect(() => emit('chat-island-unread', { total: unread }), [unread])


  if (!cfg) return null
  const anchored = draggable && !onDragStart && drag.anchor ? { right: drag.anchor.right, bottom: drag.anchor.bottom } : undefined
  const side = anchored ? '' : position === 'bottom-left' ? 'ci-left-4 ci-bottom-5' : 'ci-right-4 ci-bottom-5'
  return (
    <div
      ref={rootRef}
      style={anchored}
      onClickCapture={drag.onClickCapture}
      className={`chat-island-root ${dark ? 'ci-dark' : ''} ci-fixed ${side} ci-z-[9999] ci-flex ci-items-end ci-gap-3 ci-font-sans ci-select-none`}
      data-status={status}
    >
      <Boundary>
        {open && <ChatWindow peer={open} actions={actions} onDragStart={onDragStart ?? (draggable ? drag.start : undefined)} />}
        {picker && <NewChat onOpen={(peer) => useStore.getState().openChat(peer)} onCreateGroup={actions.createGroup} onDragStart={onDragStart ?? (draggable ? drag.start : undefined)} />}
        <Dock onDragStart={onDragStart ?? (draggable ? drag.start : undefined)} pushButton={notifications !== 'auto'} />
      </Boundary>
    </div>
  )
}
