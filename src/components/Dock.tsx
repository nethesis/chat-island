import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import { Avatar, GroupAvatar, PresenceDot } from './Avatar'
import { Button, Icon } from './Button'

/** Messenger-style chat heads: one round avatar per conversation, plus the phone-island style buttons. */
/** pushButton: offer the bell to enable notifications; off when the host asks at start-up like phone-island does for the microphone. */
/** rail: heads only, in a compact column for the host's side rail while the chat is pinned. */
export function Dock({ onDragStart, pushButton = true, rail = false }: { onDragStart?: (e: React.PointerEvent) => void; pushButton?: boolean; rail?: boolean }) {
  const { order, picker, setPicker, status, push, enablePush, newChatButton, maxHeads, place } = useStore(
    useShallow((s) => ({ order: s.order, picker: s.picker, setPicker: s.setPicker, status: s.status, push: s.push, enablePush: s.enablePush, newChatButton: s.newChatButton, maxHeads: s.maxHeads, place: s.place })),
  )
  if (rail)
    return (
      <div className="ci-flex ci-flex-col ci-items-center ci-gap-4">
        {order.length > 0 && <div className="ci-w-6 ci-border-t ci-border-solid ci-border-gray-300 dark:ci-border-gray-700" />}
        {order.slice(0, maxHeads).map((peer) => (
          <Head key={peer} peer={peer} size={36} rail />
        ))}
        {order.length > maxHeads && <Overflow peers={order.slice(maxHeads)} rail />}
      </div>
    )
  // Reversed column: the most recent head sits at the bottom, beside the open
  // window; the buttons stack above the heads. Press and drag anywhere here to move the island.
  return (
    <div className={`ci-flex ${place.y === 'up' ? 'ci-flex-col-reverse ci-mb-3' : 'ci-flex-col ci-mt-3'} ci-items-center ci-gap-3 ${onDragStart ? 'ci-cursor-grab active:ci-cursor-grabbing ci-touch-none' : ''}`} onPointerDown={onDragStart}>
      {order.slice(0, maxHeads).map((peer) => (
        <Head key={peer} peer={peer} size={48} />
      ))}
      {order.length > maxHeads && <Overflow peers={order.slice(maxHeads)} />}
      {newChatButton && (
        <Button variant="default" title={status === 'online' ? 'New chat' : `Chat ${status}`} onClick={() => setPicker(!picker)} className="ci-relative ci-shadow-lg">
          {Icon.chat}
          {status !== 'online' && <span className="ci-absolute ci-bottom-0 ci-right-0 ci-w-3 ci-h-3 ci-rounded-full ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark ci-ring-2 ci-ring-gray-50 dark:ci-ring-gray-950" />}
        </Button>
      )}
      {pushButton && push === 'ask' && status === 'online' && (
        <Button variant="neutral" title="Enable notifications when the tab is closed" onClick={enablePush} className="ci-shadow-lg ci-bg-gray-50 dark:ci-bg-gray-950">
          {Icon.bell}
        </Button>
      )}
    </div>
  )
}

/** One head: avatar, presence and unread count; a click opens its chat, on the open one it closes it. */
function Head({ peer, size, rail }: { peer: string; size: number; rail?: boolean }) {
  const { c, contact, active, inactive, online, mobile, openChat, removeHead, place } = useStore(
    useShallow((s) => ({ c: s.conversations[peer], contact: s.contacts[peer], active: s.open === peer, inactive: s.inactive[peer], online: s.online[peer], mobile: s.mobile[peer], openChat: s.openChat, removeHead: s.removeHead, place: s.place })),
  )
  const name = c?.kind === 'group' ? c.name ?? peer : contact?.name ?? inactive ?? peer
  // The name at once on hover, like the host's rail tooltips, on the side facing the page.
  const left = rail || place.x === 'left'
  return (
    <div className="ci-relative ci-group">
      <span
        role="tooltip"
        className={`ci-pointer-events-none ci-absolute ci-top-1/2 ci--translate-y-1/2 ${left ? 'ci-right-full ci-mr-3' : 'ci-left-full ci-ml-3'} ci-z-30 ci-hidden group-hover:ci-block ci-whitespace-nowrap ci-rounded ci-px-2.5 ci-py-1.5 ci-text-sm ci-font-normal ci-leading-5 ci-shadow-lg ci-bg-gray-800 ci-text-gray-50 dark:ci-bg-gray-100 dark:ci-text-gray-900`}
      >
        {name}
        <span className={`ci-absolute ci-top-1/2 ci--translate-y-1/2 ci-rotate-45 ci-w-2 ci-h-2 ci-bg-gray-800 dark:ci-bg-gray-100 ${left ? 'ci--right-1' : 'ci--left-1'}`} />
      </span>
      <button
        type="button"
        aria-label={name}
        onClick={() => (active ? useStore.getState().closeChat() : openChat(peer))}
        className={`ci-relative ci-rounded-full ci-shadow-lg ci-transition-transform hover:ci-scale-105 ci-ring-2 ci-border-0 ci-p-0 ci-bg-transparent ${active ? 'ci-ring-iconSecondary dark:ci-ring-iconSecondaryDark' : 'ci-ring-gray-50 dark:ci-ring-gray-950'}`}
      >
        {c?.kind === 'group' ? (
          <GroupAvatar name={name} size={size} avatar={c.avatar} />
        ) : (
          <>
            <Avatar contact={contact} username={peer} size={size} />
            <PresenceDot online={online} presence={contact?.presence} mobile={mobile} />
          </>
        )}
        {c?.unread > 0 && (
          <span className="ci-absolute ci--top-1 ci--right-1 ci-min-w-5 ci-h-5 ci-px-1 ci-rounded-full ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark ci-text-white dark:ci-text-gray-950 ci-text-xs ci-font-medium ci-flex ci-items-center ci-justify-center">
            {c.unread > 99 ? '99+' : c.unread}
          </span>
        )}
      </button>
      {!rail && <button
        type="button"
        aria-label={`Remove ${name} from the dock`}
        onClick={() => removeHead(peer)}
        className="ci-absolute ci--top-1 ci--left-1 ci-hidden group-hover:ci-flex group-focus-within:ci-flex ci-w-5 ci-h-5 ci-rounded-full ci-border-0 ci-p-0 ci-bg-gray-700 dark:ci-bg-gray-300 ci-text-gray-50 dark:ci-text-gray-900 ci-items-center ci-justify-center"
      >
        {Icon.close}
      </button>}
    </div>
  )
}

/** +N: the chats past the dock's heads, in a list to bring one back. */
function Overflow({ peers, rail = false }: { peers: string[]; rail?: boolean }) {
  const { conversations, contacts, inactive, online, mobile, openChat, removeHead, place } = useStore(
    useShallow((s) => ({ conversations: s.conversations, contacts: s.contacts, inactive: s.inactive, online: s.online, mobile: s.mobile, openChat: s.openChat, removeHead: s.removeHead, place: s.place })),
  )
  const [show, setShow] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const unread = peers.reduce((n, p) => n + (conversations[p]?.unread ?? 0), 0)
  const nameOf = (p: string) => (conversations[p]?.kind === 'group' ? conversations[p]?.name ?? p : contacts[p]?.name ?? inactive[p] ?? p)

  useEffect(() => {
    if (!show) return
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setShow(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setShow(false)
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', esc, true)
    }
  }, [show])

  return (
    <div ref={box} className="ci-relative">
      <Button variant="default" title={`${peers.length} more chats`} aria-expanded={show} onClick={() => setShow((v) => !v)} className={`ci-relative ci-shadow-lg ci-font-medium ci-ring-2 ci-ring-gray-50 dark:ci-ring-gray-950 ${rail ? '!ci-w-9 !ci-h-9 ci-text-sm' : ''}`}>
        +{peers.length}
        {unread > 0 && (
          <span className="ci-absolute ci--top-1 ci--right-1 ci-min-w-5 ci-h-5 ci-px-1 ci-rounded-full ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark ci-text-white dark:ci-text-gray-950 ci-text-xs ci-font-medium ci-flex ci-items-center ci-justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>
      {show && (
        <div role="menu" onPointerDown={(e) => e.stopPropagation()} className={`ci-anim-drop ci-absolute ${rail || place.x === 'left' ? 'ci-right-full ci-mr-3' : 'ci-left-full ci-ml-3'} ${rail || place.y === 'up' ? 'ci-top-0' : 'ci-bottom-0'} ci-z-30 ci-w-64 ci-max-h-80 ci-overflow-y-auto ci-py-2 ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-text-gray-900 dark:ci-text-white ci-text-sm ci-cursor-default`}>
          {peers.map((p) => {
            const c = conversations[p]
            return (
              <div key={p} className="ci-group ci-flex ci-items-center ci-pr-2 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-700">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShow(false)
                    openChat(p)
                  }}
                  className="ci-flex-1 ci-min-w-0 ci-flex ci-items-center ci-gap-3 ci-px-3 ci-py-2 ci-border-0 ci-bg-transparent ci-text-left ci-text-inherit"
                >
                  <span className="ci-relative">
                    {c?.kind === 'group' ? (
                      <GroupAvatar name={nameOf(p)} size={32} avatar={c.avatar} />
                    ) : (
                      <>
                        <Avatar contact={contacts[p]} username={p} size={32} />
                        <PresenceDot online={online[p]} presence={contacts[p]?.presence} mobile={mobile[p]} />
                      </>
                    )}
                  </span>
                  <span className="ci-flex-1 ci-truncate">{nameOf(p)}</span>
                  {(c?.unread ?? 0) > 0 && (
                    <span className="ci-min-w-5 ci-h-5 ci-px-1 ci-rounded-full ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark ci-text-white dark:ci-text-gray-950 ci-text-xs ci-font-medium ci-flex ci-items-center ci-justify-center">
                      {c!.unread > 99 ? '99+' : c!.unread}
                    </span>
                  )}
                </button>
                <Button variant="small" aria-label={`Remove ${nameOf(p)} from the dock`} title="Remove from the dock" onClick={() => removeHead(p)} className="ci-opacity-0 group-hover:ci-opacity-100 focus:ci-opacity-100">
                  {Icon.close}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
