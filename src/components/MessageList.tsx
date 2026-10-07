import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Message } from '../types'
import { useStore } from '../store'
import { Avatar } from './Avatar'
import { emojify } from '../shortcodes'
import { Icon } from './Button'
import { EmojiPicker, QUICK_REACTIONS } from './EmojiPicker'
import { noticeText } from '../notice'

const isImage = (url: string) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)
const isAudio = (url: string) => /\.(webm|ogg|oga|opus|mp3|m4a|wav)(\?|$)/i.test(url)
/** The name at the end of a URL; a malformed escape (a%E0%A4) must not take the window down. */
export const fileName = (url: string) => {
  const last = url.split('/').pop() || 'file'
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}
/** Attachments come from other people: only an https URL becomes a link, an image or a player. */
export const safeUrl = (url: string) => {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const day = (ts: number) => new Date(ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

/** Old Acrobits attachment JSON kept in the archive: encrypted on Acrobits, not viewable here. */
export const appAttachment = (body: string): { text?: string; count: number } | null => {
  if (!body.startsWith('{"')) return null
  try {
    const v = JSON.parse(body) as { body?: unknown; attachments?: unknown }
    if (!Array.isArray(v.attachments) || !v.attachments.length) return null
    return { text: typeof v.body === 'string' && v.body ? v.body : undefined, count: v.attachments.length }
  } catch {
    return null
  }
}

const Attachment = memo(function Attachment({ url }: { url: string }) {
  if (!safeUrl(url)) return <span className="ci-break-all">{url}</span>
  if (isImage(url))
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName(url)} className="ci-max-w-full ci-max-h-60 ci-rounded-2xl ci-block" />
      </a>
    )
  // Our own download: the browser's player hides it when narrow, or has none (Firefox, Safari); its ⋮ menu goes.
  if (isAudio(url))
    return (
      // A 0..15rem grid track: the player takes up to 15rem but never widens the bubble (a group's beside its avatar).
      <div className="ci-grid ci-grid-cols-[minmax(0,15rem)_auto] ci-items-center ci-gap-1 ci-max-w-full">
        <audio controls controlsList="nodownload noplaybackrate" src={url} className="ci-w-full" />
        <a href={url} download={fileName(url)} target="_blank" rel="noreferrer" title="Download" aria-label="Download" className="ci-h-8 ci-w-8 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-text-gray-500 dark:ci-text-gray-400 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
        </a>
      </div>
    )
  return (
    <a href={url} target="_blank" rel="noreferrer" className="ci-underline ci-break-all ci-flex ci-items-center ci-gap-1">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
      {fileName(url)}
    </a>
  )
})

/** Several attachments in one message: pictures in a grid, other files listed under them. */
function Attachments({ urls }: { urls: string[] }) {
  const pictures = urls.filter((u) => isImage(u) && safeUrl(u))
  const rest = urls.filter((u) => !pictures.includes(u))
  return (
    <div className="ci-flex ci-flex-col ci-gap-1">
      {pictures.length > 0 && (
        <div className={`ci-grid ci-gap-1 ${pictures.length > 1 ? 'ci-grid-cols-2' : ''}`}>
          {pictures.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">
              <img src={u} alt={fileName(u)} className="ci-w-28 ci-h-28 ci-object-cover ci-rounded-xl ci-block" />
            </a>
          ))}
        </div>
      )}
      {rest.map((u) => (
        <Attachment key={u} url={u} />
      ))}
    </div>
  )
}

/** A caption that only names the files (what a message without text carries) is not shown. */
const namesOnly = (body: string, urls: string[]) => body === urls.map(fileName).join(', ') || urls.some((u) => body === u || body === fileName(u))

/** Small Markdown as React elements (nothing injected): code, bold, italic, strike, links, bullets. */
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g

function Inline({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const s = m[0]
    const at = m.index ?? 0
    if (at > last) out.push(emojify(text.slice(last, at)))
    if (m[1]) out.push(<code key={at} className="ci-px-1 ci-py-0.5 ci-rounded ci-bg-black/10 dark:ci-bg-white/10 ci-font-mono ci-text-[0.85em]">{s.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={at}>{s.slice(2, -2)}</strong>)
    else if (m[3]) out.push(<s key={at}>{s.slice(2, -2)}</s>)
    else if (m[4]) out.push(<em key={at}>{s.slice(1, -1)}</em>)
    else if (m[5]) out.push(<a key={at} href={m[6]} target="_blank" rel="noreferrer" className="ci-underline">{m[5]}</a>)
    else out.push(<a key={at} href={s} target="_blank" rel="noreferrer" className="ci-underline ci-break-all">{s}</a>)
    last = at + s.length
  }
  if (last < text.length) out.push(emojify(text.slice(last)))
  return <>{out}</>
}

const Body = memo(function Body({ text }: { text: string }) {
  // Fenced blocks first (odd parts), the rest line by line so bullets get their dot.
  const parts = text.split(/```[^\n]*\n?([\s\S]*?)```/g)
  return (
    <span className="ci-whitespace-pre-wrap ci-break-words">
      {parts.map((p, i) =>
        i % 2 ? (
          <pre key={i} className="ci-my-1 ci-p-2 ci-rounded-xl ci-bg-black/10 dark:ci-bg-white/10 ci-font-mono ci-text-xs ci-overflow-x-auto ci-whitespace-pre">
            {p.replace(/\n$/, '')}
          </pre>
        ) : (
          <Inline key={i} text={p.replace(/^(\s*)[-*] (?=\S)/gm, '$1• ')} />
        ),
      )}
    </span>
  )
})

function OldAppAttachment({ text, count }: { text?: string; count: number }) {
  return (
    <span className="ci-italic ci-opacity-80">
      {text && <span className="ci-not-italic ci-block">{text}</span>}
      {count > 1 ? `${count} attachments` : 'Attachment'} from the mobile app, not available here
    </span>
  )
}

type Reactions = Record<string, Record<string, string[]>>

/** The reactions under a bubble: one chip per emoji with how many, mine highlighted; pressing mine takes it back. */
function Chips({ forMsg, me, onReact, nameOf, mine }: { forMsg?: Record<string, string[]>; me: string; onReact: (e: string) => void; nameOf: (u: string) => string; mine: boolean }) {
  if (!forMsg) return null
  const by = new Map<string, string[]>()
  for (const [user, emojis] of Object.entries(forMsg)) for (const e of emojis) by.set(e, [...(by.get(e) ?? []), user])
  if (!by.size) return null
  return (
    <div className={`ci-flex ci-flex-wrap ci-gap-1 ci--mt-1.5 ci-relative ci-z-[1] ${mine ? 'ci-justify-end ci-pr-2' : 'ci-pl-2'}`}>
      {[...by.entries()].map(([e, users]) => {
        const own = users.includes(me)
        return (
          <button
            key={e}
            type="button"
            title={users.map((u) => (u === me ? 'You' : nameOf(u))).join(', ')}
            aria-label={`${e} ${users.length}${own ? ', yours: press to remove' : ''}`}
            onClick={() => onReact(e)}
            className={`ci-flex ci-items-center ci-gap-0.5 ci-h-6 ci-px-1.5 ci-rounded-full ci-text-xs ci-border ci-border-solid ci-shadow-sm ${
              own
                ? 'ci-bg-emerald-50 ci-border-emerald-400 dark:ci-bg-emerald-950 dark:ci-border-emerald-600'
                : 'ci-bg-gray-50 ci-border-gray-300 dark:ci-bg-gray-900 dark:ci-border-gray-700'
            } ci-text-gray-900 dark:ci-text-white`}
          >
            <span style={{ fontSize: 16, lineHeight: '20px' }}>{e}</span>
            {users.length > 1 && <span>{users.length}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** The quoted message on top of a reply; a click goes back to it. */
function Quote({ reply, messages, mine, name }: { reply: NonNullable<Message['reply']>; messages: Message[]; mine: boolean; name: (u: string) => string }) {
  const original = messages.find((x) => x.oid === reply.id)
  const text = original ? (original.oob ? 'Attachment' : original.body) : reply.quote?.replace(/^[^:]*: /, '') ?? ''
  const jump = (e: React.MouseEvent) => {
    e.stopPropagation()
    const el = document.querySelector<HTMLElement>(`.chat-island-root [data-oid="${CSS.escape(reply.id)}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 900 })
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={jump}
      onKeyDown={(e) => e.key === 'Enter' && jump(e as unknown as React.MouseEvent)}
      className={`ci-mb-1.5 ci-px-2.5 ci-py-1 ci-rounded-xl ci-cursor-pointer ci-border-0 ci-border-l-4 ci-border-solid ci-text-xs ${
        mine ? 'ci-bg-black/20 dark:ci-bg-black/10 ci-border-gray-400 dark:ci-border-gray-600' : 'ci-bg-black/5 dark:ci-bg-white/10 ci-border-iconSecondary dark:ci-border-iconSecondaryDark'
      }`}
    >
      <div className="ci-font-medium">{name(reply.author)}</div>
      <div className="ci-line-clamp-2 ci-break-words ci-opacity-80">{text}</div>
    </div>
  )
}

export function MessageList({
  messages,
  typing,
  onLoadOlder,
  hasOlder,
  group,
  reactions,
  delivered = 0,
  read = 0,
  me = '',
  onReact,
  onReply,
}: {
  messages: Message[]
  typing: boolean
  hasOlder: boolean
  onLoadOlder: () => void
  group?: boolean
  reactions?: Reactions
  delivered?: number
  read?: number
  me?: string
  onReact?: (target: string, emoji: string) => void
  onReply?: (m: Message) => void
}) {
  const contacts = useStore((s) => s.contacts)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [menuFor, setMenuFor] = useState<string | null>(null) // quick reactions open on this message
  const [pickerFor, setPickerFor] = useState<string | null>(null) // the full picker, for this message
  const nameOf = (u: string) => contacts[u]?.name ?? u

  // Pinned to the bottom, also when a picture loads later and grows the list.
  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, typing, reactions])

  // A click anywhere else closes the quick reactions.
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    const t = window.setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('click', close)
    }
  }, [menuFor])

  const onScroll = () => {
    const el = box.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (el.scrollTop < 30 && hasOlder) onLoadOlder()
  }

  const react = (target: string, emoji: string) => {
    setMenuFor(null)
    setPickerFor(null)
    onReact?.(target, emoji)
  }

  return (
    <div className="ci-relative ci-flex-1 ci-min-h-0 ci-flex ci-flex-col">
      <div ref={box} onScroll={onScroll} onLoadCapture={() => stick.current && box.current && (box.current.scrollTop = box.current.scrollHeight)} className="ci-flex-1 ci-overflow-y-auto ci-px-4 ci-py-2 ci-space-y-1">
        {hasOlder && <div className="ci-text-center ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-1">Scroll up for older messages</div>}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || !sameDay(prev.ts, m.ts)
          // A change to the group: one quiet line, no bubble.
          if (m.notice)
            return (
              <div key={m.id}>
                {newDay && <div className="ci-text-center ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-2">{day(m.ts)}</div>}
                <div className="ci-text-center ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-1">
                  {m.mine ? 'You' : nameOf(m.nick ?? '')} {noticeText(m.notice, nameOf, me)}
                </div>
              </div>
            )
          const grouped = prev && !newDay && prev.mine === m.mine && prev.nick === m.nick && m.ts - prev.ts < 120000
          // In a group, who wrote it: the avatar sits beside the first bubble of a run, the name is its tooltip.
          const sender = group && !m.mine && m.nick ? nameOf(m.nick) : null
          const target = m.oid
          const canReact = !!onReact && !!target && !m.pending
          const reactButton = canReact && (
            <button
              type="button"
              title="React"
              aria-label="React to this message"
              onClick={(e) => {
                e.stopPropagation()
                setMenuFor(menuFor === target ? null : target!)
              }}
              className={`ci-self-center ci-h-7 ci-w-7 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-text-gray-500 dark:ci-text-gray-400 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800 focus:ci-opacity-100 ${menuFor === target ? 'ci-opacity-100' : 'ci-opacity-0 group-hover:ci-opacity-100'}`}
            >
              {Icon.react}
            </button>
          )
          const replyButton = !!onReply && !!target && !m.pending && (
            <button
              type="button"
              title="Reply"
              aria-label="Reply to this message"
              onClick={(e) => {
                e.stopPropagation()
                onReply(m)
              }}
              className="ci-self-center ci-h-7 ci-w-7 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-text-gray-500 dark:ci-text-gray-400 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800 focus:ci-opacity-100 ci-opacity-0 group-hover:ci-opacity-100"
            >
              {Icon.reply}
            </button>
          )
          return (
            <div key={m.id} data-oid={m.oid}>
              {newDay && <div className="ci-text-center ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-2">{day(m.ts)}</div>}
              <div className={`ci-group ci-flex ci-items-start ci-gap-1.5 ${m.mine ? 'ci-justify-end' : 'ci-justify-start'} ${grouped ? 'ci-mt-0.5' : 'ci-mt-2'}`}>
                {sender && (
                  <span className="ci-w-7 ci-shrink-0" title={sender}>
                    {!grouped && <Avatar contact={contacts[m.nick!]} username={m.nick!} size={28} />}
                  </span>
                )}
                {m.mine && replyButton}
                {m.mine && reactButton}
                <div className={`ci-relative ci-flex ci-flex-col ci-max-w-[80%] ${m.mine ? 'ci-items-end' : 'ci-items-start'}`}>
                  {menuFor === target && target && (
                    <div
                      role="menu"
                      onClick={(e) => e.stopPropagation()}
                      className={`ci-absolute ci-bottom-full ci-mb-1 ci-z-20 ci-flex ci-items-center ci-gap-0.5 ci-p-1 ci-rounded-full ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ${m.mine ? 'ci-right-0' : 'ci-left-0'}`}
                    >
                      {QUICK_REACTIONS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          role="menuitem"
                          aria-label={e}
                          onClick={() => react(target, e)}
                          style={{ fontSize: 22, lineHeight: '32px' }}
                          className={`ci-h-9 ci-w-9 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 hover:ci-scale-125 ci-transition-transform ${reactions?.[target]?.[me]?.includes(e) ? 'ci-bg-gray-200 dark:ci-bg-gray-800' : 'ci-bg-transparent'}`}
                        >
                          {e}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        title="More emojis"
                        aria-label="More emojis"
                        onClick={() => {
                          setMenuFor(null)
                          setPickerFor(target)
                        }}
                        className="ci-h-8 ci-w-8 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-gray-200 dark:ci-bg-gray-800 ci-text-gray-700 dark:ci-text-gray-200 ci-text-lg"
                      >
                        +
                      </button>
                    </div>
                  )}
                  <div
                    title={time(m.ts)}
                    onDoubleClick={() => canReact && react(target!, QUICK_REACTIONS[0])}
                    className={`ci-px-3.5 ci-py-2 ci-rounded-3xl ci-text-sm ci-select-text ci-cursor-text ${
                      m.mine
                        ? 'ci-bg-gray-700 ci-text-gray-50 dark:ci-bg-gray-300 dark:ci-text-gray-900 ci-rounded-br-lg'
                        : 'ci-bg-elevationL2 ci-text-gray-900 dark:ci-bg-elevationL2Dark dark:ci-text-white ci-rounded-tl-lg'
                    } ${m.pending ? 'ci-opacity-60' : ''}`}
                  >
                    {m.reply && <Quote reply={m.reply} messages={messages} mine={m.mine} name={(u) => (u === me ? 'You' : nameOf(u))} />}
                    {m.files ? <Attachments urls={m.files} /> : m.oob ? <Attachment url={m.oob} /> : appAttachment(m.body) ? <OldAppAttachment {...appAttachment(m.body)!} /> : <Body text={m.body} />}
                    {m.oob && m.body && !namesOnly(m.body, m.files ?? [m.oob]) && <div className="ci-mt-1"><Body text={m.body} /></div>}
                    <span className="ci-flex ci-items-center ci-justify-end ci-gap-1 ci-text-[10px] ci-leading-none ci-mt-1">
                      <span className="ci-opacity-60">{time(m.ts)}</span>
                      {m.mine && <Ticks state={m.pending ? 'pending' : m.ts <= read ? 'read' : m.ts <= delivered ? 'delivered' : 'sent'} />}
                    </span>
                  </div>
                  {target && <Chips forMsg={reactions?.[target]} me={me} mine={m.mine} nameOf={nameOf} onReact={(e) => canReact && react(target, e)} />}
                </div>
                {!m.mine && reactButton}
                {!m.mine && replyButton}
              </div>
            </div>
          )
        })}
        {typing && (
          <div className="ci-flex ci-justify-start ci-mt-2">
            <div className="ci-px-3.5 ci-py-2 ci-rounded-3xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-500 dark:ci-text-gray-400 ci-text-xs ci-italic">typing…</div>
          </div>
        )}
      </div>
      {pickerFor && <EmojiPicker className="ci-absolute ci-bottom-2 ci-left-1/2 ci--translate-x-1/2" onPick={(e) => react(pickerFor, e)} onClose={() => setPickerFor(null)} />}
    </div>
  )
}

const TICK_LABEL = { pending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read' }

/** WhatsApp style: one tick sent, two delivered, two in NethVoice green read (the light green on my dark bubble, and back); a clock while sending. */
function Ticks({ state }: { state: 'pending' | 'sent' | 'delivered' | 'read' }) {
  return (
    <span title={TICK_LABEL[state]} aria-label={TICK_LABEL[state]} className={state === 'read' ? 'ci-text-phoneIslandCallDark dark:ci-text-phoneIslandCall' : 'ci-opacity-60'}>
      {state === 'pending' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      ) : (
        <svg width="16" height="12" viewBox="0 0 28 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 9l4 4 9-10" />
          {state !== 'sent' && <path d="M12 12l1 1 9-10" />}
        </svg>
      )}
    </span>
  )
}
