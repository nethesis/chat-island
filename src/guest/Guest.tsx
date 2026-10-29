import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { MessageList } from '../components/MessageList'
import { Composer } from '../components/Composer'
import { Avatar, GroupAvatar } from '../components/Avatar'
import { ExternalBadge } from '../components/ChatWindow'
import { Button, Icon } from '../components/Button'
import { t, toLang } from '../i18n'
import { chime } from '../sound'
import type { Contact, Message, Reply } from '../types'
import '../index.css'

// The invite link's token is in the fragment (never sent to a server); the gateway is under the same prefix.
// Who joined keeps a token of their own in this browser, by room.
const base = location.pathname.replace(/\/g\/?$/, '')
const link = location.hash.slice(1)
const ME = 'me'
const tokenKey = (room: string) => `chat-guest:${room}`
const stored = (room: string) => {
  try {
    return localStorage.getItem(tokenKey(room)) ?? ''
  } catch {
    return ''
  }
}
const keep = (room: string, token: string) => {
  try {
    if (token) localStorage.setItem(tokenKey(room), token)
    else localStorage.removeItem(tokenKey(room))
  } catch {
    /* this visit only */
  }
}

let token = ''
const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const api = (path: string, init?: RequestInit) =>
  fetch(base + path, { ...init, cache: 'no-store', headers: { Authorization: 'Guest ' + token, 'Content-Type': 'application/json' } })

type GuestReply = { id: string; author: string; quote?: string }
type GuestMsg = { id: string; oid: string; sid: string; mine: boolean; nick: string; author: string; body: string; files?: string[]; at: number; reply?: GuestReply }
type GuestPage = { messages: GuestMsg[]; reactions: { target: string; nick: string; emojis: string[] }[]; retractions: string[]; complete: boolean; first: string; last: string }
type State = 'loading' | 'join' | 'ready' | 'invalid' | 'closed' | 'removed'
type Reactions = Record<string, Record<string, string[]>>

useStore.setState({ me: ME, lang: toLang(), status: 'online' })

/** Dark when the system says so, unless the person picked one here. */
function useTheme(): [boolean, () => void] {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const saved = () => {
    try {
      return localStorage.getItem('chat-guest-theme')
    } catch {
      return null
    }
  }
  const [dark, setDark] = useState(() => (saved() ? saved() === 'dark' : media.matches))
  useEffect(() => {
    const on = (e: MediaQueryListEvent) => !saved() && setDark(e.matches)
    media.addEventListener('change', on)
    return () => media.removeEventListener('change', on)
  }, [media])
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.style.background = dark ? '#030712' : '#f9fafb'
  }, [dark])
  const toggle = () =>
    setDark((d) => {
      try {
        localStorage.setItem('chat-guest-theme', d ? 'light' : 'dark')
      } catch {
        /* this visit only */
      }
      return !d
    })
  return [dark, toggle]
}

async function upload(file: File): Promise<string> {
  const type = file.type || 'application/octet-stream'
  const r = await api('/guest/upload', { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size, type }) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || t('Guest.Not sent, try again'))
  const slot = (await r.json()) as { put: string; get: string; headers: Record<string, string> }
  const put = await fetch(slot.put, { method: 'PUT', headers: { ...slot.headers, 'Content-Type': type }, body: file })
  if (!put.ok) throw new Error(t('Guest.Not sent, try again'))
  return slot.get
}

export function Guest() {
  const [dark, toggleTheme] = useTheme()
  const [state, setState] = useState<State>('loading')
  const [title, setTitle] = useState('')
  const [room, setRoom] = useState('')
  const [me, setMe] = useState<{ name: string; nick: string }>()
  // Who is in the chat, by name; asked again each time the list opens.
  const [members, setMembers] = useState<{ name: string; external: boolean }[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [name, setName] = useState('')
  const [joinError, setJoinError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Reactions>({})
  const [complete, setComplete] = useState(false)
  const [offline, setOffline] = useState(false)
  const [reply, setReply] = useState<Reply | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const [jump, setJump] = useState(0)
  // The browser's permission for notifications: only the person can give it, with a click.
  const [logoOk, setLogoOk] = useState(true)
  const [notify, setNotify] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const askNotify = () => Notification.requestPermission().then(setNotify).catch(() => {})
  const last = useRef('')
  const first = useRef('')
  const myNick = useRef('')
  const roomRef = useRef('')
  const titleRef = useRef('')
  const gone = useRef(new Set<string>())
  const live = useRef(false)
  const unread = useRef(0)

  // A refused token ends the page; anything else is retried.
  const check = (r: Response) => {
    if (r.status === 401) setState('invalid')
    else if (r.status === 410) {
      keep(roomRef.current, '')
      setState('removed')
    }
    return r.ok
  }

  // A gateway message as the island's: one room; my own nick is ME, so the list puts it on my side.
  const toMessage = (m: GuestMsg): Message => ({
    id: m.id, oid: m.oid || m.id, sid: m.sid, from: 'room', to: ME, body: m.body, ts: m.at, mine: m.mine, room: 'room', nick: m.mine ? ME : m.nick,
    oob: m.files?.[0], files: m.files && m.files.length > 1 ? m.files : undefined,
    reply: m.reply ? { id: m.reply.id, author: m.reply.author === myNick.current ? ME : m.reply.author, quote: m.reply.quote } : undefined,
  })

  const apply = (p: GuestPage, older: boolean) => {
    // Names for the list: operators by username, guests by nick.
    const contacts: Record<string, Contact> = { ...useStore.getState().contacts }
    for (const m of p.messages) if (!m.mine && !contacts[m.nick]) contacts[m.nick] = { username: m.nick, name: m.author }
    useStore.setState({ contacts })
    p.retractions.forEach((ref) => gone.current.add(ref))
    const visible = (m: Message) => !gone.current.has(m.sid ?? '') && !gone.current.has(m.oid ?? '')
    const add = p.messages.map(toMessage)
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => m.id))
      const fresh = add.filter((m) => !seen.has(m.id))
      return (older ? [...fresh, ...cur] : [...cur, ...fresh]).filter(visible)
    })
    if (p.reactions.length)
      setReactions((cur) => {
        const all = { ...cur }
        for (const r of p.reactions) {
          const user = r.nick === myNick.current ? ME : r.nick
          const forMsg = { ...(all[r.target] ?? {}) }
          if (r.emojis?.length) forMsg[user] = r.emojis
          else delete forMsg[user]
          all[r.target] = forMsg
        }
        return all
      })
    // Pages move by archive id, reactions and retractions included: a long poll never sees them twice.
    if (older || !first.current) {
      if (p.first) first.current = p.first
      setComplete(p.complete)
    }
    if (!older && p.last) last.current = p.last
    const theirs = p.messages.filter((m) => !m.mine)
    if (older || !live.current || !theirs.length || (!document.hidden && document.hasFocus())) return
    // Away from the page: the title counts, a chime, and the browser's notification when allowed.
    document.title = `(${(unread.current += theirs.length)}) ${titleRef.current || 'Chat'}`
    chime()
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const m = theirs[theirs.length - 1]
      const n = new Notification(m.author, { body: m.body || t('Common.Attachment'), tag: 'chat-guest' })
      n.onclick = () => (window.focus(), n.close())
    }
  }

  const fetchNow = async (wait: boolean) => {
    const r = await api(`/guest/messages?after=${encodeURIComponent(last.current)}${wait ? '' : '&wait=0'}`)
    if (!check(r)) throw new Error(String(r.status))
    apply(await r.json(), false)
  }

  const loadOlder = async () => {
    if (complete || !first.current) return
    const r = await api(`/guest/messages?before=${encodeURIComponent(first.current)}`)
    if (r.ok) apply(await r.json(), true)
  }

  // In the room: who I am, the last page; the long poll below takes it from there.
  const enter = async (tok: string) => {
    token = tok
    const r = await api('/guest/chat')
    if (!r.ok) {
      token = ''
      return r.status
    }
    const c = await r.json()
    myNick.current = c.nick
    setMe({ name: c.name, nick: c.nick })
    setMembers(c.members ?? [])
    const p = await api('/guest/messages?wait=0')
    if (!check(p)) return p.status
    apply(await p.json(), false)
    live.current = true
    setState('ready')
    return 200
  }

  useEffect(() => {
    let stopped = false
    ;(async () => {
      if (!link) return setState('invalid')
      try {
        const r = await post('/guest/link', { link })
        if (r.status === 401) return setState('invalid')
        if (!r.ok) throw new Error(String(r.status))
        const info = (await r.json()) as { title: string; room: string; open: boolean }
        titleRef.current = info.title
        roomRef.current = info.room
        setTitle(info.title)
        setRoom(info.room)
        document.title = info.title
        const mine = stored(info.room)
        const code = mine ? await enter(mine) : 0
        if (code === 410) {
          keep(info.room, '')
          return setState('removed')
        }
        if (code !== 200) {
          if (mine) keep(info.room, '')
          setState(info.open ? 'join' : 'closed')
          if (!info.open) return
        }
      } catch {
        setOffline(true)
        setTimeout(() => location.reload(), 5000)
        return
      }
      // Long poll: the gateway answers when something arrives, or after a while with nothing.
      for (let delay = 1000; !stopped; ) {
        if (!live.current) {
          await new Promise((res) => setTimeout(res, 300)) // still choosing a name
          continue
        }
        try {
          await fetchNow(true)
          setOffline(false)
          delay = 1000
        } catch (e) {
          if ((e as Error).message === '401' || (e as Error).message === '410') return
          setOffline(true)
          await new Promise((res) => setTimeout(res, delay))
          delay = Math.min(delay * 2, 30000)
        }
      }
    })()
    const shown = () => !document.hidden && ((unread.current = 0), (document.title = titleRef.current || 'Chat'))
    document.addEventListener('visibilitychange', shown)
    window.addEventListener('focus', shown)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', shown)
      window.removeEventListener('focus', shown)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    const n = name.trim()
    if (!n) return
    setJoinError('')
    // Asked now: a click the browser accepts, from someone who will wait for answers.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') askNotify()
    const r = await post('/guest/join', { link, name: n })
    if (!r.ok) {
      const code = r.status === 409 ? ((await r.json().catch(() => ({}))) as { code?: string }).code : ''
      setJoinError(code === 'name_taken' ? t('Guest.This name is already used in this chat: choose another one.') : r.status === 409 ? t('Guest.The chat is full') : r.status === 410 ? t('Guest.This link is no longer active') : t('Guest.Not joined, try again'))
      return
    }
    const { token: tok, room: rm } = (await r.json()) as { token: string; room: string }
    keep(rm, tok)
    await enter(tok)
  }

  // A failure is thrown back to the composer, which gives the text back.
  const send = async (text: string, files: File[] = []) => {
    const links: string[] = []
    for (const f of files) links.push(await upload(f))
    const answer = reply ? { id: reply.id, author: reply.author === ME ? myNick.current : reply.author, quote: reply.quote } : undefined
    const r = await api('/guest/messages', { method: 'POST', body: JSON.stringify({ body: text || files.map((f) => f.name).join(', '), files: links, reply: answer }) })
    if (!check(r)) throw new Error(t('Guest.Not sent, try again'))
    setReply(null)
    await fetchNow(false)
  }

  // As in the island: one reaction per person; the same one again takes it back.
  const react = async (target: string, emoji: string) => {
    const mine = reactions[target]?.[ME] ?? []
    const next = mine.includes(emoji) ? [] : [emoji]
    const r = await api('/guest/react', { method: 'POST', body: JSON.stringify({ target, emojis: next }) })
    if (r.ok) setReactions((cur) => ({ ...cur, [target]: { ...(cur[target] ?? {}), [ME]: next } }))
  }

  const retract = async (m: Message) => {
    if (!m.sid) return
    const r = await api('/guest/retract', { method: 'POST', body: JSON.stringify({ sid: m.sid }) })
    if (r.ok) {
      gone.current.add(m.sid)
      setMessages((cur) => cur.filter((x) => x.id !== m.id))
    }
  }

  const startReply = (m: Message) => {
    if (!m.oid) return
    const author = m.mine ? ME : m.nick ?? ''
    const text = m.oob ? t('Common.Attachment') : m.body.replace(/\s+/g, ' ').trim().slice(0, 100)
    const who = m.mine ? me?.name ?? '' : useStore.getState().contacts[author]?.name ?? author
    setReply({ id: m.oid, author, quote: `${who}: ${text}` })
    setFocusTick((n) => n + 1)
  }

  // The members list closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!showMembers) return
    const close = () => setShowMembers(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('pointerdown', close), document.removeEventListener('keydown', esc))
  }, [showMembers])

  const toggleMembers = async () => {
    if (!showMembers) {
      const r = await api('/guest/chat')
      if (r.ok) setMembers(((await r.json()) as { members?: { name: string; external: boolean }[] }).members ?? [])
    }
    setShowMembers((v) => !v)
  }

  // Search: the whole conversation is loaded first (these chats are short), then looked through here.
  const openSearch = async () => {
    setSearching(true)
    for (let i = 0; i < 20 && first.current; i++) {
      const r = await api(`/guest/messages?before=${encodeURIComponent(first.current)}`)
      if (!r.ok) break
      const p = (await r.json()) as GuestPage
      apply(p, true)
      if (p.complete || !p.first) break
    }
  }
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q.length < 2 ? [] : messages.filter((m) => m.body.toLowerCase().includes(q)).reverse()
  }, [messages, query])
  const go = (step: number) => {
    if (!hits.length) return
    setAt((i) => (i + step + hits.length) % hits.length)
    setJump((n) => n + 1)
  }

  const endText: Partial<Record<State, [string, string]>> = {
    invalid: [t('Guest.Invalid link'), t('Guest.Check that you opened the whole link.')],
    closed: [t('Guest.This link is no longer active'), t('Guest.Ask whoever sent it for a new one.')],
    removed: [t('Guest.You are no longer in this chat'), t('Guest.Ask whoever sent it for a new one.')],
  }
  const ended = endText[state]
  // The island's reset clears an input's border: the frame is on a box around it, as in New chat.
  const box = 'ci-h-10 ci-flex ci-items-center ci-px-4 ci-box-border ci-rounded-full ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 focus-within:ci-border-transparent focus-within:ci-ring-2 focus-within:ci-ring-accent-500 dark:focus-within:ci-ring-accent-300'
  const input = 'ci-flex-1 ci-min-w-0 ci-bg-transparent ci-border-0 ci-outline-none ci-text-sm ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400'
  return (
    // dark: variants apply below .ci-dark, never on the element that carries it.
    <div className={`chat-island-root ${dark ? 'ci-dark' : ''} ci-font-sans ci-fixed ci-inset-0`}>
      <div className="ci-h-full ci-flex ci-flex-col ci-bg-gray-50 dark:ci-bg-gray-950 ci-text-gray-900 dark:ci-text-white">
        <header className="ci-relative ci-z-20 ci-shrink-0 ci-border-b ci-border-solid ci-border-x-0 ci-border-t-0 ci-border-gray-300 dark:ci-border-gray-700" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {/* The CTI's own logo, from the same host (rebranded with it), at the page's left edge where there is room. */}
          {logoOk && <img src={dark ? '/login_logo_dark.svg' : '/login_logo.svg'} alt="" height={22} onError={() => setLogoOk(false)} className="ci-absolute ci-left-6 ci-top-1/2 ci--translate-y-1/2 ci-h-[22px] ci-w-auto ci-hidden xl:ci-block" />}
          <div className="ci-max-w-3xl ci-mx-auto ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-3">
            {/* The chat's name opens who is in it, as for a group in the island. */}
            <button type="button" disabled={state !== 'ready'} onPointerDown={(e) => e.stopPropagation()} onClick={toggleMembers} aria-expanded={showMembers} className="ci-flex ci-flex-1 ci-min-w-0 ci-items-center ci-gap-3 ci-p-0 ci-border-0 ci-bg-transparent ci-text-left ci-text-inherit ci-cursor-pointer disabled:ci-cursor-default">
              {title && <GroupAvatar peer={room} name={title} size={36} />}
              <span className="ci-flex-1 ci-min-w-0">
                <span className="ci-block ci-font-medium ci-text-sm ci-truncate">{title || 'Chat'}</span>
                {me && (
                  <span className="ci-block ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-truncate">
                    {offline ? t('Guest.Connection lost, retrying…') : members.length ? members.map((m) => (m.name === me.nick ? t('Common.You') : m.name)).join(', ') : t('Guest.You are {{name}}', { name: me.name })}
                  </span>
                )}
              </span>
            </button>
            {state === 'ready' && (
              <Button variant="small" onClick={() => (searching ? setSearching(false) : openSearch())} aria-label={t('Guest.Search')} title={t('Guest.Search')}>
                {Icon.search}
              </Button>
            )}
            <Button variant="small" onClick={toggleTheme} aria-label={dark ? t('Guest.Light theme') : t('Guest.Dark theme')} title={dark ? t('Guest.Light theme') : t('Guest.Dark theme')}>
              {dark ? Icon.sun : Icon.moon}
            </Button>
          </div>
          {showMembers && (
            // Over the chat, as the island's members list: nothing below moves.
            <div className="ci-absolute ci-inset-x-0 ci-top-full ci-z-30 ci-max-w-3xl ci-mx-auto ci-px-4 ci-pt-1" onPointerDown={(e) => e.stopPropagation()}>
              <div className="ci-anim-drop ci-max-h-80 ci-overflow-y-auto ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-p-2">
                {members.map((m) => (
                  <div key={m.name} className="ci-flex ci-items-center ci-gap-3 ci-px-2 ci-py-1.5 ci-text-sm">
                    <Avatar contact={{ username: m.name, name: m.name }} username={m.name} size={28} />
                    <span className="ci-flex-1 ci-min-w-0 ci-truncate">{m.name === me?.nick ? `${m.name} (${t('Common.You')})` : m.name}</span>
                    {m.external && <ExternalBadge />}
                  </div>
                ))}
              </div>
            </div>
          )}
          {searching && (
            <div className="ci-max-w-3xl ci-mx-auto ci-flex ci-items-center ci-gap-2 ci-px-4 ci-pb-3">
              <label className={`ci-flex-1 ci-min-w-0 ci-gap-2 ci-text-gray-500 dark:ci-text-gray-400 ${box}`}>
                {Icon.search}
                <input autoFocus value={query} onChange={(e) => (setQuery(e.target.value), setAt(0), setJump((n) => n + 1))} onKeyDown={(e) => e.key === 'Enter' && go(e.shiftKey ? -1 : 1)} placeholder={t('Guest.Search')} className={input} />
              </label>
              <span className="ci-shrink-0 ci-text-xs ci-tabular-nums">{query.trim().length < 2 ? '' : hits.length ? t('Chat.{{n}} of {{total}}', { n: at + 1, total: hits.length }) : t('Chat.No results')}</span>
              <Button variant="small" disabled={!hits.length} onClick={() => go(1)} aria-label={t('Chat.Older')} title={t('Chat.Older')}>
                {Icon.up}
              </Button>
              <Button variant="small" disabled={!hits.length} onClick={() => go(-1)} aria-label={t('Chat.Newer')} title={t('Chat.Newer')}>
                {Icon.down}
              </Button>
              <Button variant="small" onClick={() => setSearching(false)} aria-label={t('Common.Close')} title={t('Common.Close')}>
                {Icon.close}
              </Button>
            </div>
          )}
        </header>
        {/* The chat's column below the header, framed at the sides. */}
        <div className="ci-flex-1 ci-min-h-0 ci-w-full ci-max-w-3xl ci-mx-auto ci-box-border ci-flex ci-flex-col ci-border-0 md:ci-border-x ci-border-solid ci-border-gray-300 dark:ci-border-gray-700">
        {ended ? (
          <div className="ci-m-auto ci-px-6 ci-text-center">
            <div className="ci-font-medium">{ended[0]}</div>
            <div className="ci-mt-1 ci-text-sm ci-text-gray-500 dark:ci-text-gray-400">{ended[1]}</div>
          </div>
        ) : state === 'join' ? (
          // The first time: the name others will see.
          <form className="ci-m-auto ci-w-full ci-max-w-sm ci-box-border ci-px-6 ci-flex ci-flex-col ci-gap-4" onSubmit={(e) => (e.preventDefault(), join())}>
            <h1 className="ci-m-0 ci-text-center ci-text-lg ci-font-medium">{t('Guest.Join chat')}</h1>
            <div className="ci-flex ci-flex-col ci-gap-1.5">
              <label htmlFor="guest-name" className="ci-text-sm ci-font-medium">{t('Guest.Name')}</label>
              <div className={box}>
                <input id="guest-name" autoFocus value={name} maxLength={64} onChange={(e) => setName(e.target.value)} placeholder={t('Guest.e.g. Jenny Wilson')} aria-describedby="guest-name-help" className={input} />
              </div>
              <span id="guest-name-help" className="ci-text-xs ci-text-gray-500 dark:ci-text-gray-400">{t('Guest.Your name is visible to everyone in this chat')}</span>
            </div>
            <Button variant="default" type="submit" className="ci-w-full ci-h-10 ci-font-medium" disabled={!name.trim()}>
              {t('Guest.Join')}
            </Button>
            {joinError && <div role="alert" className="ci-text-center ci-text-xs ci-text-phoneIslandClose dark:ci-text-phoneIslandCloseDark">{joinError}</div>}
          </form>
        ) : (
          <main className="ci-relative ci-flex-1 ci-min-h-0 ci-flex ci-flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {state === 'ready' && (notify === 'default' || notify === 'denied') && (
              <div className="ci-mx-3 ci-mt-3 ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-2 ci-rounded-2xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-xs">
                <span className="ci-flex ci-text-gray-600 dark:ci-text-gray-300">{Icon.bell}</span>
                <span className="ci-flex-1">{notify === 'default' ? t('Guest.Turn on notifications to know when someone answers.') : t('Guest.Notifications are blocked: turn them on from the icon next to the address.')}</span>
                {notify === 'default' && (
                  <Button variant="default" className="ci-w-auto ci-h-8 ci-px-4 ci-text-xs ci-font-medium" onClick={askNotify}>
                    {t('Guest.Turn on')}
                  </Button>
                )}
                <Button variant="small" onClick={() => setNotify('granted')} aria-label={t('Common.Close')} title={t('Common.Close')}>
                  {Icon.close}
                </Button>
              </div>
            )}
            {state === 'ready' && !messages.length && (
              <div className="ci-absolute ci-inset-x-0 ci-top-1/3 ci-px-6 ci-text-center ci-text-sm ci-text-gray-500 dark:ci-text-gray-400">{t('Guest.No messages yet. Write here: the answer comes on this page.')}</div>
            )}
            <MessageList
              messages={messages}
              typing={false}
              group
              hasOlder={!complete}
              onLoadOlder={loadOlder}
              me={ME}
              reactions={reactions}
              onReact={react}
              onReply={startReply}
              onDelete={retract}
              highlight={searching ? query.trim() : undefined}
              current={searching ? hits[at]?.id : undefined}
              jump={jump}
            />
            {reply && (
              <div className="ci-mx-3 ci-mt-1 ci-flex ci-items-center ci-gap-2 ci-pl-3 ci-pr-1 ci-py-1.5 ci-rounded-2xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-border-0 ci-border-l-4 ci-border-solid ci-border-iconSecondary dark:ci-border-iconSecondaryDark">
                <div className="ci-flex-1 ci-min-w-0 ci-text-xs">
                  <div className="ci-font-medium ci-text-gray-900 dark:ci-text-white">{reply.author === ME ? t('Common.You') : useStore.getState().contacts[reply.author]?.name ?? reply.author}</div>
                  <div className="ci-truncate ci-text-gray-500 dark:ci-text-gray-400">{reply.quote?.replace(/^[^:]*: /, '')}</div>
                </div>
                <Button variant="small" onClick={() => setReply(null)} aria-label={t('Chat.Cancel reply')} title={t('Chat.Cancel reply')}>
                  {Icon.close}
                </Button>
              </div>
            )}
            <Composer disabled={state !== 'ready'} focusKey={focusTick} onSend={(text, files) => send(text, files)} onTyping={() => {}} onFile={(f) => send('', [f]).catch(() => {})} />
          </main>
        )}
        </div>
      </div>
    </div>
  )
}
