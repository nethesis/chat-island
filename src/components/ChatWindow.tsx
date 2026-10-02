import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import { emit } from '../events'
import { Avatar, GroupAvatar, PresenceDot } from './Avatar'
import { Button, Icon } from './Button'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import type { Message, Reply } from '../types'
import type { Theme } from '../theme'

export interface WindowActions {
  send: (peer: string, text: string, reply?: Reply) => Promise<void>
  createGroup: (name: string, members: string[], avatar?: string) => Promise<void>
  typing: (peer: string, composing: boolean) => void
  upload: (peer: string, file: File) => void
  loadOlder: (peer: string) => void
  remove: (peer: string) => Promise<void>
  react: (peer: string, target: string, emoji: string) => Promise<void>
  seen: (peer: string) => void
}

/** CTI main presence values under which a call can be placed to this person. */
const callable = (presence?: string) => !!presence && !['offline', 'dnd', 'busy', 'ringing', 'onhold'].includes(presence)

/** The floating conversation: phone-island surface, radius and buttons. */
export function ChatWindow({ peer, actions, theme, onDragStart }: { peer: string; actions: WindowActions; theme?: Theme; onDragStart?: (e: React.PointerEvent) => void }) {
  // Only what this window shows: a message elsewhere, or an operator's presence, must not re-render it.
  const { c, contacts, online, mobile, inactive, status, closeChat, openChat, markRead, order, me } = useStore(
    useShallow((s) => ({ c: s.conversations[peer], contacts: s.contacts, online: s.online, mobile: s.mobile, inactive: s.inactive, status: s.status, closeChat: s.closeChat, openChat: s.openChat, markRead: s.markRead, order: s.order, me: s.me })),
  )
  // The head this window belongs to: index 0 is the bottom head (its centre 2.25rem above the window bottom), each one 3.75rem higher.
  const slot = Math.max(0, order.indexOf(peer))
  const contact = contacts[peer]
  const [showMembers, setShowMembers] = useState(false)
  const [menu, setMenu] = useState(false)
  // The message being answered, and a tick that puts the cursor in the composer.
  const [reply, setReply] = useState<Reply | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const nameOf = (u: string) => (u === me ? 'You' : contacts[u]?.name ?? u)
  const members = [...(c?.members ?? [])].sort((a, b) => Number(a === me) - Number(b === me)) // me last

  useEffect(() => {
    if (c && !c.loaded) actions.loadOlder(peer)
  }, [peer, c?.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markRead(peer)
    actions.seen(peer)
  }, [peer, c?.messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setShowMembers(false)
    setMenu(false)
    setReply(null)
  }, [peer])

  const startReply = (m: Message) => {
    if (!m.oid) return
    const author = c?.kind === 'group' ? m.nick ?? '' : m.mine ? me : peer
    const text = m.oob ? 'Attachment' : m.body.replace(/```/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
    const name = author === me ? useStore.getState().myName || me : contacts[author]?.name ?? author
    setReply({ id: m.oid, author, quote: `${name}: ${text}` })
    setFocusTick((t) => t + 1)
  }

  // Escape closes the members list first, then the window.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (menu) setMenu(false)
    else if (reply) setReply(null)
    else if (showMembers) setShowMembers(false)
    else closeChat()
  }

  if (!c) return null
  // An operator gone from the CTI: the chat stays to read, nothing more to send.
  const gone = c.kind !== 'group' && !!inactive[peer]
  return (
    <div role="dialog" aria-label={c.kind === 'group' ? c.name ?? peer : contact?.name ?? inactive[peer] ?? peer} onKeyDown={onKeyDown} className="ci-relative ci-w-[22rem] ci-h-[30rem] ci-flex ci-flex-col ci-rounded-3xl ci-shadow-2xl ci-bg-gray-50 dark:ci-bg-gray-950 dark:ci-border dark:ci-border-solid dark:ci-border-gray-700 ci-text-gray-900 dark:ci-text-white">
      {/* The tail slides to the head this window belongs to. */}
      <span
        className="ci-absolute ci--right-1.5 ci-w-3 ci-h-3 ci-rotate-45 ci-bg-gray-50 dark:ci-bg-gray-950 dark:ci-border-0 dark:ci-border-t dark:ci-border-r dark:ci-border-solid dark:ci-border-gray-700 ci-shadow-2xl ci-transition-all ci-duration-200"
        style={{ bottom: `calc(1.875rem + ${slot} * 3.75rem)` }}
        aria-hidden="true"
      />
      <div className={`ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-3 ci-rounded-t-3xl ${onDragStart ? 'ci-cursor-grab active:ci-cursor-grabbing ci-touch-none' : ''}`} onPointerDown={onDragStart}>
        {c.kind === 'group' ? (
          <GroupAvatar name={c.name ?? peer} size={36} avatar={c.avatar} />
        ) : (
          <span className="ci-relative">
            <Avatar contact={contact} username={peer} size={36} />
            <PresenceDot online={online[peer]} presence={contact?.presence} mobile={mobile[peer]} />
          </span>
        )}
        {/* A group's subtitle lists its members; press it for the full list with everyone's presence. */}
        <div
          className={`ci-flex-1 ci-min-w-0 ${c.kind === 'group' ? 'ci-cursor-pointer' : ''}`}
          {...(c.kind === 'group' ? { role: 'button', tabIndex: 0, 'aria-expanded': showMembers, onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setShowMembers((v) => !v)) } : {})}
          onClick={() => c.kind === 'group' && setShowMembers((v) => !v)}
        >
          <div className="ci-font-medium ci-truncate ci-text-sm">{c.kind === 'group' ? c.name ?? peer : contact?.name ?? inactive[peer] ?? peer}</div>
          <div className="ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-truncate">
            {gone
              ? 'No longer active'
              : status !== 'online'
              ? status
              : c.kind === 'group'
                ? members.map(nameOf).join(', ')
                : c.typing
                  ? 'typing…'
                  : online[peer]
                    ? 'online'
                    : mobile[peer]
                      ? 'Mobile'
                      : 'offline'}
          </div>
        </div>
        {/* Call when the CTI says the person is reachable on a phone (webrtc, desk phone, NethLink, mobile): being in the chat alone is not enough. */}
        {!gone && c.kind !== 'group' && contact?.number && callable(contact.presence) && (
          <Button variant="call" title={`Call ${contact.number}`} aria-label="Call" onClick={() => emit('chat-island-call', { username: peer, number: contact.number! })}>
            {Icon.phone}
          </Button>
        )}
        {/* Minimize: the head stays in the dock; its X closes the conversation. */}
        <Button variant="small" onClick={() => closeChat()} aria-label="Minimize" title="Minimize">
          {Icon.minus}
        </Button>
        {/* Window menu: the theme now, more entries later. */}
        <Button variant="small" onClick={() => setMenu((v) => !v)} aria-label="Menu" title="Menu" aria-expanded={menu}>
          {Icon.dots}
        </Button>
      </div>
      <div className="ci-border-t ci-border-gray-300 dark:ci-border-gray-700" />
      {menu && <WindowMenu theme={theme} onClose={() => setMenu(false)} />}
      {showMembers && c.kind === 'group' && (
        <div className="ci-anim-drop ci-absolute ci-left-3 ci-right-3 ci-top-16 ci-z-10 ci-max-h-64 ci-overflow-y-auto ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-p-2">
          {members.map((m) => (
            <div key={m} className="ci-flex ci-items-center ci-gap-3 ci-px-2 ci-py-1.5 ci-text-sm">
              <span className="ci-relative">
                <Avatar contact={contacts[m]} username={m} size={28} />
                {m !== me && <PresenceDot online={online[m]} presence={contacts[m]?.presence} mobile={mobile[m]} />}
              </span>
              <span className="ci-truncate ci-flex-1">{nameOf(m)}</span>
              {/* Reach one member directly: a one-to-one chat, or a call when the CTI says they can be called. */}
              {m !== me && (
                <>
                  <Button variant="small" title="Chat" aria-label="Chat" onClick={() => openChat(m)}>
                    {Icon.chat}
                  </Button>
                  {contacts[m]?.number && callable(contacts[m]?.presence) && (
                    <Button variant="call" title={`Call ${contacts[m]?.number}`} aria-label="Call" onClick={() => emit('chat-island-call', { username: m, number: contacts[m]!.number! })}>
                      {Icon.phone}
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="ci-flex-1 ci-min-h-0 ci-flex ci-flex-col ci-overflow-hidden ci-rounded-b-3xl">
      <MessageList
        messages={c.messages}
        typing={c.typing}
        group={c.kind === 'group'}
        hasOlder={c.loaded && !c.complete}
        onLoadOlder={() => actions.loadOlder(peer)}
        reactions={c.reactions}
        delivered={c.delivered}
        read={c.read}
        me={me}
        onReact={(target, emoji) => actions.react(peer, target, emoji)}
        onReply={startReply}
      />
      {reply && (
        <div className="ci-mx-3 ci-mt-1 ci-flex ci-items-center ci-gap-2 ci-pl-3 ci-pr-1 ci-py-1.5 ci-rounded-2xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-border-0 ci-border-l-4 ci-border-solid ci-border-iconSecondary dark:ci-border-iconSecondaryDark">
          <div className="ci-flex-1 ci-min-w-0 ci-text-xs">
            <div className="ci-font-medium ci-text-gray-900 dark:ci-text-white">{reply.author === me ? 'You' : contacts[reply.author]?.name ?? reply.author}</div>
            <div className="ci-truncate ci-text-gray-500 dark:ci-text-gray-400">{reply.quote?.replace(/^[^:]*: /, '')}</div>
          </div>
          <Button variant="small" onClick={() => setReply(null)} aria-label="Cancel reply" title="Cancel reply">
            {Icon.close}
          </Button>
        </div>
      )}
      <Composer
        key={peer}
        focusKey={focusTick}
        disabled={status !== 'online' || gone}
        disabledText={gone ? 'No longer active' : undefined}
        onSend={(t) => actions.send(peer, t, reply ?? undefined).then(() => setReply(null))}
        onTyping={(v) => actions.typing(peer, v)}
        onFile={(f) => actions.upload(peer, f)}
      />
      </div>
    </div>
  )
}

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: Icon.sun },
  { value: 'dark', label: 'Dark', icon: Icon.moon },
  { value: 'system', label: 'System', icon: Icon.monitor },
]

/** The header menu; a click elsewhere closes it. */
function WindowMenu({ theme, onClose }: { theme?: Theme; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-label="Menu"]') && onClose()
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [onClose])
  return (
    <div ref={box} role="menu" className="ci-anim-drop ci-absolute ci-right-3 ci-top-14 ci-z-20 ci-w-44 ci-py-2 ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-text-sm">
      <div className="ci-px-4 ci-py-1 ci-font-semibold ci-text-gray-600 dark:ci-text-gray-50">Theme</div>
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="menuitemradio"
          aria-checked={theme === t.value}
          onClick={() => {
            emit('chat-island-theme-change', { theme: t.value })
            onClose()
          }}
          className="ci-w-full ci-flex ci-items-center ci-gap-2 ci-px-3 ci-py-2 ci-border-0 ci-bg-transparent ci-text-left ci-text-gray-700 dark:ci-text-gray-50 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-700"
        >
          <span className="ci-w-4 ci-text-green-600 dark:ci-text-green-400">{theme === t.value && Icon.check}</span>
          <span className="ci-text-gray-600 dark:ci-text-gray-100">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  )
}
