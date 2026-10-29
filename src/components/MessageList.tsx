import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Message } from '../types'
import { useStore } from '../store'
import { Avatar } from './Avatar'
import { emojify } from '../shortcodes'
import { Icon } from './Button'
import { EmojiPicker, QUICK_REACTIONS } from './EmojiPicker'
import { noticeText } from '../notice'
import { t } from '../i18n'

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
const time = (ts: number) => new Date(ts).toLocaleTimeString(useStore.getState().lang, { hour: '2-digit', minute: '2-digit' })
const day = (ts: number) => new Date(ts).toLocaleDateString(useStore.getState().lang, { weekday: 'short', day: 'numeric', month: 'short' })
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

/** Save a file from the upload host as itself: a blob link downloads in place, where a plain one opens a window (an empty one in NethLink). */
const save = (url: string) =>
  fetch(url)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fileName(url)
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    })
    .catch(() => window.open(url, '_blank', 'noreferrer'))

/** A voice note, WhatsApp style: play, a seek bar and the time, and a download. Our own: Chrome's player, narrow, spills its volume slider out. */
/** alone: nothing under it but the message time, so the duration sits on that line, as in WhatsApp. */
function Voice({ url, alone }: { url: string; alone?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const [length, setLength] = useState(0)
  // Rounded the same way at rest and while playing; at rest a short note shows 0:01, not 0:00.
  const clock = (s: number, rest = false) => ((r) => `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`)(Math.max(Math.round(s), rest && s > 0 ? 1 : 0))
  // Recorded WebM can report an infinite length until read to the end: seek far once to learn it.
  const measure = () => {
    const a = audio.current
    if (!a) return
    if (Number.isFinite(a.duration)) return setLength(a.duration)
    a.currentTime = 1e9
    a.addEventListener('timeupdate', () => ((a.currentTime = 0), Number.isFinite(a.duration) && setLength(a.duration)), { once: true })
  }
  const toggle = () => {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }
  return (
    // A 0..15rem grid track: the player takes up to 15rem but never widens the bubble (a group's beside its avatar).
    <div className="ci-relative ci-grid ci-grid-cols-[minmax(0,15rem)_auto] ci-items-center ci-gap-1 ci-max-w-full">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onLoadedMetadata={measure}
        onDurationChange={() => audio.current && Number.isFinite(audio.current.duration) && setLength(audio.current.duration)}
        onTimeUpdate={() => audio.current && setAt(audio.current.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => (setPlaying(false), setAt(0))}
      />
      <div className="ci-flex ci-items-center ci-gap-2 ci-min-w-0">
        <button type="button" onClick={toggle} title={playing ? t('Messages.Pause') : t('Messages.Play')} aria-label={playing ? t('Messages.Pause') : t('Messages.Play')} className="ci-h-10 ci-w-10 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-p-0 ci-bg-transparent ci-text-current hover:ci-bg-black/10 dark:hover:ci-bg-white/10">
          {playing ? Icon.pause : Icon.play}
        </button>
        <input
          type="range"
          min={0}
          max={length || 1}
          step={0.01}
          value={Math.min(at, length || 1)}
          disabled={!length}
          onChange={(e) => audio.current && (audio.current.currentTime = Number(e.target.value))}
          aria-label={t('Messages.Position')}
          style={{ '--ci-at': `${length ? (Math.min(at, length) / length) * 100 : 0}%` } as React.CSSProperties}
          className="ci-voice ci-flex-1 ci-min-w-0 ci-w-full ci-m-0 ci-block ci-cursor-pointer"
        />
        {!alone && <span className="ci-shrink-0 ci-text-xs ci-tabular-nums ci-opacity-70">{(playing || at ? clock(at) : clock(length, true))}</span>}
      </div>
      <a href={url} download={fileName(url)} target="_blank" rel="noreferrer" onClick={(e) => (e.preventDefault(), save(url))} title={t('Messages.Download')} aria-label={t('Messages.Download')} className="ci-h-8 ci-w-8 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-text-current ci-opacity-60 hover:ci-opacity-100 hover:ci-bg-black/10 dark:hover:ci-bg-white/10">
        {Icon.download}
      </a>
      {alone && <span className="ci-absolute ci-left-12 ci-top-full ci-mt-1 ci-text-[10px] ci-leading-none ci-tabular-nums ci-opacity-60">{(playing || at ? clock(at) : clock(length, true))}</span>}
    </div>
  )
}

const Attachment = memo(function Attachment({ url, alone }: { url: string; alone?: boolean }) {
  if (!safeUrl(url)) return <span className="ci-break-all">{url}</span>
  if (isImage(url))
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={fileName(url)} className="ci-max-w-full ci-max-h-60 ci-rounded-2xl ci-block" />
      </a>
    )
  if (isAudio(url)) return <Voice url={url} alone={alone} />
  return (
    <a href={url} target="_blank" rel="noreferrer" className="ci-underline ci-break-all ci-flex ci-items-center ci-gap-1">
      {Icon.clip}
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

/** Small Markdown as React elements (nothing injected): code, bold, italic, strike, links, bullets, @mentions. */
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)|(?<![\w@.])@([\w.-]*\w)/g

/** The searched text marked wherever it appears, as WhatsApp does; case does not matter. */
// The designer's yellow, the same on every bubble and theme; only the current hit has the border.
const MARK = 'ci-bg-yellow-400 ci-text-gray-900'
const RING = 'ci-ring-yellow-600 dark:ci-ring-yellow-400'
const mark = (text: string, hl?: string): ReactNode[] => {
  if (!hl || hl.length < 2) return [text]
  const parts = text.split(new RegExp(`(${hl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((p, i) => (i % 2 ? <mark key={i} className={`ci-rounded-sm ${MARK}`}>{p}</mark> : p))
}

/** @username of someone the island knows: highlighted, more so when it is me. */
type Mentions = { known: (u: string) => boolean; me: string; mine?: boolean }

function Inline({ text, at: mention, hl }: { text: string; at: Mentions; hl?: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const s = m[0]
    const at = m.index ?? 0
    if (at > last) out.push(<Fragment key={`t${at}`}>{mark(emojify(text.slice(last, at)), hl)}</Fragment>)
    if (m[1]) out.push(<code key={at} className="ci-px-1 ci-py-0.5 ci-rounded ci-bg-black/10 dark:ci-bg-white/10 ci-font-mono ci-text-[0.85em]">{mark(s.slice(1, -1), hl)}</code>)
    else if (m[2]) out.push(<strong key={at}>{mark(s.slice(2, -2), hl)}</strong>)
    else if (m[3]) out.push(<s key={at}>{mark(s.slice(2, -2), hl)}</s>)
    else if (m[4]) out.push(<em key={at}>{mark(s.slice(1, -1), hl)}</em>)
    else if (m[5]) out.push(<a key={at} href={m[6]} target="_blank" rel="noreferrer" className="ci-underline">{m[5]}</a>)
    else if (m[8] !== undefined) {
      const u = m[8].toLowerCase()
      if (!mention.known(u)) out.push(s)
      else
        out.push(
          <span key={at} className={`ci-font-medium ${mention.mine ? 'ci-text-blue-300 dark:ci-text-blue-700' : 'ci-text-blue-600 dark:ci-text-blue-400'} ${u === mention.me && !mention.mine ? 'ci-rounded ci-px-0.5 ci-bg-blue-500/15' : ''}`}>
            {s}
          </span>,
        )
    } else out.push(<a key={at} href={s} target="_blank" rel="noreferrer" className="ci-underline ci-break-all">{s}</a>)
    last = at + s.length
  }
  if (last < text.length) out.push(<Fragment key="end">{mark(emojify(text.slice(last)), hl)}</Fragment>)
  return <>{out}</>
}

// Up to three emoji and nothing else: shown large, as WhatsApp does.
const bigEmoji = (text: string) => {
  const g = [...new Intl.Segmenter().segment(emojify(text).replace(/\s+/g, ''))]
  return g.length > 0 && g.length <= 3 && g.every((x) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(x.segment))
}

const Body = memo(function Body({ text, mine, hl }: { text: string; mine?: boolean; hl?: string }) {
  const contacts = useStore((st) => st.contacts)
  const me = useStore((st) => st.me)
  const at: Mentions = { known: (u) => u === me || !!contacts[u], me, mine }
  // Fenced blocks first (odd parts), the rest line by line so bullets get their dot.
  const parts = text.split(/```[^\n]*\n?([\s\S]*?)```/g)
  return (
    <span className="ci-whitespace-pre-wrap ci-break-words">
      {parts.map((p, i) =>
        i % 2 ? (
          <pre key={i} className="ci-my-1 ci-p-2 ci-rounded-xl ci-bg-black/10 dark:ci-bg-white/10 ci-font-mono ci-text-xs ci-overflow-x-auto ci-whitespace-pre">
            {mark(p.replace(/\n$/, ''), hl)}
          </pre>
        ) : (
          <Inline key={i} text={p.replace(/^(\s*)[-*] (?=\S)/gm, '$1• ')} at={at} hl={hl} />
        ),
      )}
    </span>
  )
})

function OldAppAttachment({ text, count }: { text?: string; count: number }) {
  return (
    <span className="ci-italic ci-opacity-80">
      {text && <span className="ci-not-italic ci-block">{text}</span>}
      {count > 1 ? `${count} attachments` : t('Common.Attachment')} from the mobile app, not available here
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
            title={users.map((u) => (u === me ? t('Common.You') : nameOf(u))).join(', ')}
            aria-label={t(own ? 'Messages.{{emoji}} {{count}}, yours: press to remove' : 'Messages.{{emoji}} {{count}}', { emoji: e, count: users.length })}
            onClick={() => onReact(e)}
            className={`ci-flex ci-items-center ci-gap-0.5 ci-h-6 ci-px-1.5 ci-rounded-full ci-text-xs ci-border ci-border-solid ci-shadow-sm ${
              own
                ? 'ci-bg-accent-50 ci-border-accent-400 dark:ci-bg-accent-950 dark:ci-border-accent-600'
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
  const text = original ? (original.oob ? t('Common.Attachment') : original.body) : reply.quote?.replace(/^[^:]*: /, '') ?? ''
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
  onDelete,
  highlight,
  current,
  jump,
  padTop,
  members,
}: {
  messages: Message[]
  typing: boolean
  hasOlder: boolean
  onLoadOlder: () => Promise<void>
  group?: boolean
  reactions?: Reactions
  delivered?: number
  read?: number
  me?: string
  onReact?: (target: string, emoji: string) => void
  onReply?: (m: Message) => void
  onDelete?: (m: Message) => void
  highlight?: string // searched text, marked in every bubble
  current?: string // id of the search hit on show: scrolled to and outlined
  jump?: number // changes whenever the view must go to `current` again
  padTop?: boolean // room at the top for the search bar floating over the list
  members?: string[] // a group's members: only theirs is a colleague's name and face
}) {
  const contacts = useStore((s) => s.contacts)
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [menuFor, setMenuFor] = useState<string | null>(null) // quick reactions open on this message
  const [pickerFor, setPickerFor] = useState<string | null>(null) // the full picker, for this message
  const [deleteFor, setDeleteFor] = useState<string | null>(null) // "delete for everyone?" asked on this message
  const nameOf = (u: string) => contacts[u]?.name ?? u
  // In a group the author is the nick its sender chose: a colleague's name only when that colleague is in the group.
  const author = (u: string) => (!members || members.includes(u) ? nameOf(u) : u)

  // Pinned to the bottom, also when a picture loads later and grows the list.
  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, typing, reactions])

  // The search hit on show, in the middle of the list.
  useEffect(() => {
    if (!current) return
    const el = box.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(current)}"]`)
    if (!el) return
    stick.current = false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [current, jump])

  // A click anywhere else closes the quick reactions or the delete question.
  useEffect(() => {
    if (!menuFor && !deleteFor) return
    const close = () => {
      setMenuFor(null)
      setDeleteFor(null)
    }
    const t = window.setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('click', close)
    }
  }, [menuFor, deleteFor])

  // Older pages, like an infinite scroll upwards: what is on screen stays put while they land above it.
  const [loading, setLoading] = useState(false)
  const older = useRef<{ height: number; top: number; count: number } | null>(null)
  const loadOlder = async () => {
    const el = box.current
    if (!el || older.current || !hasOlder) return
    older.current = { height: el.scrollHeight, top: el.scrollTop, count: messages.length }
    setLoading(true)
    try {
      await onLoadOlder()
    } finally {
      setLoading(false)
    }
  }
  useLayoutEffect(() => {
    const el = box.current
    const o = older.current
    if (!el || !o || loading) return
    older.current = null
    el.scrollTop = el.scrollHeight - o.height + o.top
    // Still at the top (a wheel there fires no scroll event): the next page follows, as long as pages bring something.
    if (el.scrollTop < 30 && messages.length > o.count) loadOlder()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps
  // A short history that does not fill the window cannot be scrolled: it pages back on its own.
  useEffect(() => {
    const el = box.current
    if (el && hasOlder && el.scrollHeight <= el.clientHeight) loadOlder()
  }, [hasOlder, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = box.current
    if (!el) return
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (el.scrollTop < 30) loadOlder()
  }

  const react = (target: string, emoji: string) => {
    setMenuFor(null)
    setPickerFor(null)
    onReact?.(target, emoji)
  }

  return (
    <div className="ci-relative ci-flex-1 ci-min-h-0 ci-flex ci-flex-col">
      <div ref={box} onScroll={onScroll} style={{ overflowAnchor: 'none' }} onLoadCapture={() => stick.current && box.current && (box.current.scrollTop = box.current.scrollHeight)} className={`ci-flex-1 ci-overflow-y-auto ci-px-4 ${padTop ? 'ci-pt-14 ci-pb-2' : 'ci-py-2'} ci-space-y-1`}>
        {hasOlder && (
          <div className="ci-flex ci-justify-center ci-items-center ci-gap-2 ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-1">
            {loading ? (
              <>
                <span className="ci-w-3 ci-h-3 ci-rounded-full ci-border-2 ci-border-current ci-border-t-transparent ci-animate-spin" aria-hidden="true" />
                {t('Messages.Loading older messages')}
              </>
            ) : (
              t('Messages.Scroll up for older messages')
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || !sameDay(prev.ts, m.ts)
          // A change to the group: one quiet line, no bubble.
          if (m.notice)
            return (
              <div key={m.id}>
                {newDay && <div className="ci-text-center ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-2">{day(m.ts)}</div>}
                <div className="ci-text-center ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-1">
                  {m.notice.event === 'call' && <span className="ci-inline-flex ci-align-middle ci-mr-1.5 [&>svg]:ci-w-3 [&>svg]:ci-h-3">{Icon.phone}</span>}
                  {noticeText(m.notice, nameOf, me, m.mine ? me : m.nick ?? m.from)}
                  {m.notice.event === 'call' && <span className="ci-opacity-70"> · {time(m.ts)}</span>}
                </div>
              </div>
            )
          const grouped = prev && !newDay && prev.mine === m.mine && prev.nick === m.nick && m.ts - prev.ts < 120000
          // In a group, who wrote it: the avatar sits beside the first bubble of a run, the name is its tooltip.
          const sender = group && !m.mine && m.nick ? author(m.nick) : null
          const target = m.oid
          const canReact = !!onReact && !!target && !m.pending
          const reactButton = canReact && (
            <button
              type="button"
              title={t('Messages.React')}
              aria-label={t('Messages.React to this message')}
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
              title={t('Messages.Reply')}
              aria-label={t('Messages.Reply to this message')}
              onClick={(e) => {
                e.stopPropagation()
                onReply(m)
              }}
              className="ci-self-center ci-h-7 ci-w-7 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-text-gray-500 dark:ci-text-gray-400 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800 focus:ci-opacity-100 ci-opacity-0 group-hover:ci-opacity-100"
            >
              {Icon.reply}
            </button>
          )
          // Mine only, once the server has it: a group message is taken back by the room's id.
          const canDelete = !!onDelete && m.mine && !m.pending && !!(m.room ? m.sid : m.oid)
          const deleteButton = canDelete && (
            <button
              type="button"
              title={t('Messages.Delete')}
              aria-label={t('Messages.Delete this message')}
              onClick={(e) => {
                e.stopPropagation()
                setMenuFor(null)
                setDeleteFor(deleteFor === m.id ? null : m.id)
              }}
              className={`ci-self-center ci-h-7 ci-w-7 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-text-gray-500 dark:ci-text-gray-400 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800 focus:ci-opacity-100 ${deleteFor === m.id ? 'ci-opacity-100' : 'ci-opacity-0 group-hover:ci-opacity-100'}`}
            >
              {Icon.trash}
            </button>
          )
          return (
            <div key={m.id} data-oid={m.oid} data-id={m.id} data-current={current === m.id || undefined}>
              {newDay && <div className="ci-text-center ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-py-2">{day(m.ts)}</div>}
              <div className={`ci-group ci-flex ci-items-start ci-gap-1.5 ${m.mine ? 'ci-justify-end' : 'ci-justify-start'} ${grouped ? 'ci-mt-0.5' : 'ci-mt-2'}`}>
                {sender && (
                  <span className="ci-w-7 ci-shrink-0" title={sender}>
                    {!grouped && <Avatar contact={!members || members.includes(m.nick!) ? contacts[m.nick!] : undefined} username={m.nick!} size={28} />}
                  </span>
                )}
                {m.mine && deleteButton}
                {m.mine && replyButton}
                {m.mine && reactButton}
                <div className={`ci-relative ci-flex ci-flex-col ci-max-w-[80%] ${m.mine ? 'ci-items-end' : 'ci-items-start'}`}>
                  {deleteFor === m.id && (
                    <div
                      role="dialog"
                      onClick={(e) => e.stopPropagation()}
                      className="ci-absolute ci-bottom-full ci-mb-1 ci-right-0 ci-z-20 ci-flex ci-items-center ci-gap-2 ci-py-1.5 ci-pl-3 ci-pr-1.5 ci-rounded-full ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-text-sm ci-whitespace-nowrap ci-text-gray-900 dark:ci-text-gray-50"
                    >
                      {/* Everyone is only worth saying with more than one other person. */}
                      {m.room ? t('Messages.Delete for everyone?') : t('Messages.Delete message?')}
                      <button type="button" onClick={() => setDeleteFor(null)} className="ci-h-7 ci-px-3 ci-rounded-full ci-border-0 ci-bg-transparent ci-cursor-pointer ci-text-gray-700 dark:ci-text-gray-200 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800">
                        {t('Common.Cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteFor(null)
                          onDelete?.(m)
                        }}
                        className="ci-h-7 ci-px-3 ci-rounded-full ci-border-0 ci-cursor-pointer ci-bg-rose-700 ci-text-white hover:ci-bg-rose-800 dark:ci-bg-rose-500 dark:hover:ci-bg-rose-400 dark:ci-text-gray-950"
                      >
                        {t('Messages.Delete')}
                      </button>
                    </div>
                  )}
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
                        title={t('Messages.More emojis')}
                        aria-label={t('Messages.More emojis')}
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
                    className={`ci-px-3.5 ci-py-2 ci-rounded-3xl ${!m.reply && !m.files && !m.oob && bigEmoji(m.body) ? 'ci-text-4xl ci-leading-tight' : 'ci-text-sm'} ci-select-text ci-cursor-text ${
                      m.mine
                        ? 'ci-bg-gray-700 ci-text-gray-50 dark:ci-bg-gray-300 dark:ci-text-gray-900 ci-rounded-br-lg'
                        : 'ci-bg-elevationL2 ci-text-gray-900 dark:ci-bg-elevationL2Dark dark:ci-text-white ci-rounded-tl-lg'
                    } ${m.pending ? 'ci-opacity-60' : ''} ${current === m.id ? `ci-ring-2 ${RING}` : ''}`}
                  >
                    {m.reply && <Quote reply={m.reply} messages={messages} mine={m.mine} name={(u) => (u === me ? t('Common.You') : nameOf(u))} />}
                    {m.files ? <Attachments urls={m.files} /> : m.oob ? <Attachment url={m.oob} alone={!m.reply && !(m.body && !namesOnly(m.body, [m.oob]))} /> : appAttachment(m.body) ? <OldAppAttachment {...appAttachment(m.body)!} /> : <Body text={m.body} mine={m.mine} hl={highlight} />}
                    {m.oob && m.body && !namesOnly(m.body, m.files ?? [m.oob]) && <div className="ci-mt-1"><Body text={m.body} mine={m.mine} hl={highlight} /></div>}
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
            <div className="ci-px-3.5 ci-py-2 ci-rounded-3xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-500 dark:ci-text-gray-400 ci-text-xs ci-italic">{t('Messages.typing…')}</div>
          </div>
        )}
      </div>
      {pickerFor && <EmojiPicker className="ci-absolute ci-bottom-2 ci-left-1/2 ci--translate-x-1/2" onPick={(e) => react(pickerFor, e)} onClose={() => setPickerFor(null)} />}
    </div>
  )
}

const TICK_LABEL = { pending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read' }

/** WhatsApp style: thin ticks, one sent, two delivered, two in the host's accent read; a clock while sending. */
function Ticks({ state }: { state: 'pending' | 'sent' | 'delivered' | 'read' }) {
  return (
    <span title={t(`Messages.${TICK_LABEL[state]}`)} aria-label={t(`Messages.${TICK_LABEL[state]}`)} className={`ci-inline-flex ${state === 'read' ? 'ci-text-accent-400 dark:ci-text-accent-600' : 'ci-opacity-60'}`}>
      {state === 'pending' ? Icon.clock : state === 'sent' ? Icon.tick : Icon.ticks}
    </span>
  )
}
