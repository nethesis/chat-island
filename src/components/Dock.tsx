import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import { Avatar, GroupAvatar, PresenceDot } from './Avatar'
import { Button, Icon } from './Button'

/** Messenger-style chat heads: one round avatar per conversation, plus the phone-island style buttons. */
/** pushButton: offer the bell to enable notifications; off when the host asks at start-up like phone-island does for the microphone. */
export function Dock({ onDragStart, pushButton = true }: { onDragStart?: (e: React.PointerEvent) => void; pushButton?: boolean }) {
  const { order, open, conversations, contacts, inactive, online, mobile, openChat, removeHead, picker, setPicker, status, push, enablePush, newChatButton } = useStore(
    useShallow((s) => ({ order: s.order, open: s.open, conversations: s.conversations, contacts: s.contacts, inactive: s.inactive, online: s.online, mobile: s.mobile, openChat: s.openChat, removeHead: s.removeHead, picker: s.picker, setPicker: s.setPicker, status: s.status, push: s.push, enablePush: s.enablePush, newChatButton: s.newChatButton })),
  )
  // Reversed column: the most recent head sits at the bottom, beside the open
  // window; the buttons stack above the heads. Press and drag anywhere here to move the island.
  return (
    <div className={`ci-flex ci-flex-col-reverse ci-items-center ci-gap-3 ci-mb-3 ${onDragStart ? 'ci-cursor-grab active:ci-cursor-grabbing ci-touch-none' : ''}`} onPointerDown={onDragStart}>
      {order.map((peer) => {
        const c = conversations[peer]
        const active = open === peer
        return (
          <div key={peer} className="ci-relative ci-group">
            <button
              type="button"
              title={c?.kind === 'group' ? c.name ?? peer : contacts[peer]?.name ?? inactive[peer] ?? peer}
              onClick={() => (active ? useStore.getState().closeChat() : openChat(peer))}
              className={`ci-relative ci-rounded-full ci-shadow-lg ci-transition-transform hover:ci-scale-105 ci-ring-2 ci-border-0 ci-p-0 ci-bg-transparent ${active ? 'ci-ring-iconSecondary dark:ci-ring-iconSecondaryDark' : 'ci-ring-gray-50 dark:ci-ring-gray-950'}`}
            >
              {c?.kind === 'group' ? (
                <GroupAvatar name={c.name ?? peer} size={48} avatar={c.avatar} />
              ) : (
                <>
                  <Avatar contact={contacts[peer]} username={peer} size={48} />
                  <PresenceDot online={online[peer]} presence={contacts[peer]?.presence} mobile={mobile[peer]} />
                </>
              )}
              {c?.unread > 0 && (
                <span className="ci-absolute ci--top-1 ci--right-1 ci-min-w-5 ci-h-5 ci-px-1 ci-rounded-full ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark ci-text-white dark:ci-text-gray-950 ci-text-xs ci-font-medium ci-flex ci-items-center ci-justify-center">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={`Remove ${c?.kind === 'group' ? c.name ?? peer : contacts[peer]?.name ?? inactive[peer] ?? peer} from the dock`}
              onClick={() => removeHead(peer)}
              className="ci-absolute ci--top-1 ci--left-1 ci-hidden group-hover:ci-flex group-focus-within:ci-flex ci-w-5 ci-h-5 ci-rounded-full ci-border-0 ci-p-0 ci-bg-gray-700 dark:ci-bg-gray-300 ci-text-gray-50 dark:ci-text-gray-900 ci-items-center ci-justify-center"
            >
              {Icon.close}
            </button>
          </div>
        )
      })}
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
