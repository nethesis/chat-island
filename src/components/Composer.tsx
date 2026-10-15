import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Icon } from './Button'
import { EmojiPicker } from './EmojiPicker'
import { webmOpusToOgg } from '../ogg'
import { emojify } from '../shortcodes'
import { useStore } from '../store'
import { Avatar, PresenceDot } from './Avatar'

/** Ogg Opus first (the app's voice format); WebM Opus is remuxed to Ogg, Safari falls back to mp4. */
const RECORD_TYPES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']

/** The recording as a file to send: WebM Opus becomes Ogg Opus; anything else goes as recorded. */
async function voiceFile(chunks: Blob[], mime: string): Promise<File> {
  const stamp = Date.now()
  if (/webm/.test(mime) && /opus/.test(mime)) {
    try {
      const ogg = webmOpusToOgg(new Uint8Array(await new Blob(chunks).arrayBuffer()))
      if (ogg) return new File([ogg], `voice-${stamp}.ogg`, { type: 'audio/ogg' })
    } catch {
      /* keep the WebM */
    }
  }
  return new File(chunks, `voice-${stamp}.${extOf(mime)}`, { type: mime.split(';')[0] })
}
const extOf = (mime: string) => (/mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm')
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export function Composer({ onSend, onTyping, onFile, disabled, disabledText, focusKey, members }: { onSend: (text: string, files: File[]) => Promise<void> | void; onTyping: (composing: boolean) => void; onFile: (f: File) => void; disabled: boolean; disabledText?: string; focusKey?: number; members?: string[] }) {
  const [text, setText] = useState('')
  // @ in a group: the members to mention, as in Mattermost; the word being typed filters them.
  const [mention, setMention] = useState<{ start: number; q: string } | null>(null)
  const [pick, setPick] = useState(0)
  const { contacts, me, online, mobile } = useStore()
  const candidates = useMemo(() => {
    if (!mention || !members) return []
    const q = mention.q
    return members
      .filter((u) => u !== me)
      .map((u) => ({ u, name: contacts[u]?.name ?? u }))
      .filter((c) => c.u.includes(q) || c.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.u.startsWith(q)) - Number(!b.u.startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [mention, members, contacts, me])
  const findMention = (v: string, caret: number) => {
    const m = members?.length ? v.slice(0, caret).match(/(?:^|\s)@([\w.-]*)$/) : null
    setMention(m ? { start: caret - m[1].length - 1, q: m[1].toLowerCase() } : null)
    setPick(0)
  }
  const choose = (u: string) => {
    if (!mention) return
    const caret = box.current?.selectionStart ?? text.length
    const v = text.slice(0, mention.start) + '@' + u + ' ' + text.slice(caret)
    change(v)
    cursor.current = mention.start + u.length + 2
    setMention(null)
  }
  // Attachments wait here and go with the text in one message, as in WhatsApp; a voice note still goes at once.
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')), [files])
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews])
  const addFiles = (list: FileList | File[] | null) => list && list.length && setFiles((cur) => [...cur, ...Array.from(list)].slice(0, 10))
  const [emoji, setEmoji] = useState(false)
  const cursor = useRef<number | null>(null) // where the cursor goes once the converted text is on screen
  const file = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const typingTimer = useRef<number>()
  const composing = useRef(false)
  // Voice note: the recorder, when it started, and whether the stop is a cancel.
  const [rec, setRec] = useState<{ r: MediaRecorder; since: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const cancel = useRef(false)
  const starting = useRef(false)
  const unmounted = useRef(false)
  const live = useRef<{ r?: MediaRecorder; stream?: MediaStream }>({})

  // The window just opened for this conversation: start typing right away.
  useEffect(() => box.current?.focus(), [])

  // Another conversation, or the window closed, in the middle of a voice note: drop it and free the microphone.
  useEffect(
    () => () => {
      unmounted.current = true
      cancel.current = true
      window.clearTimeout(typingTimer.current)
      const { r, stream } = live.current
      if (r && r.state !== 'inactive') r.stop()
      stream?.getTracks().forEach((t) => t.stop())
      live.current = {}
    },
    [],
  )

  useEffect(() => {
    if (!rec) return
    const id = window.setInterval(() => setElapsed(Date.now() - rec.since), 250)
    return () => window.clearInterval(id)
  }, [rec])

  // Replying puts the cursor here.
  useEffect(() => {
    if (focusKey) box.current?.focus()
  }, [focusKey])

  const setComposing = (v: boolean) => {
    if (composing.current !== v) {
      composing.current = v
      onTyping(v)
    }
  }

  const change = (typed: string) => {
    // A :code: just closed becomes its emoji, and the cursor stays where it was.
    const v = typed.includes(':') ? emojify(typed) : typed
    if (v !== typed) cursor.current = Math.max(0, (box.current?.selectionStart ?? typed.length) - (typed.length - v.length))
    setText(v)
    findMention(v, box.current?.selectionStart ?? v.length)
    if (v) {
      setComposing(true)
      window.clearTimeout(typingTimer.current)
      typingTimer.current = window.setTimeout(() => setComposing(false), 4000)
    } else setComposing(false)
  }

  // Before the next key is handled: the cursor after the emoji the code became.
  useLayoutEffect(() => {
    if (cursor.current === null) return
    box.current?.setSelectionRange(cursor.current, cursor.current)
    cursor.current = null
  }, [text])

  // The emoji goes where the cursor is, and the cursor stays right after it.
  const insert = (e: string) => {
    const el = box.current
    const at = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? at
    change(text.slice(0, at) + e + text.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + e.length, at + e.length)
    })
  }

  const submit = () => {
    const t = text.trim()
    if ((!t && !files.length) || busy) return
    const sending = files
    setText('')
    setFiles([])
    setBusy(!!sending.length)
    // Not sent (the connection just dropped): give the text and the attachments back rather than lose them.
    Promise.resolve(onSend(t, sending))
      .catch(() => {
        setText((cur) => cur || t)
        setFiles((cur) => (cur.length ? cur : sending))
      })
      .finally(() => setBusy(false))
    window.clearTimeout(typingTimer.current)
    composing.current = false
  }

  const record = async () => {
    if (starting.current || rec) return
    starting.current = true
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const media = stream
      if (unmounted.current) {
        media.getTracks().forEach((t) => t.stop())
        return // unmounted while the browser was asking for the microphone
      }
      const mimeType = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      r.onstop = () => {
        media.getTracks().forEach((t) => t.stop())
        live.current = {}
        setRec(null)
        if (!cancel.current && chunks.length) voiceFile(chunks, r.mimeType || mimeType || '').then(onFile)
      }
      cancel.current = false
      r.start()
      live.current = { r, stream: media }
      setElapsed(0)
      setRec({ r, since: Date.now() })
    } catch {
      stream?.getTracks().forEach((t) => t.stop()) // no microphone, permission refused, or the recorder failed
    } finally {
      starting.current = false
    }
  }

  const stop = (discard: boolean) => {
    cancel.current = discard
    rec?.r.stop()
  }

  if (rec)
    return (
      <div className="ci-flex ci-items-center ci-gap-2 ci-px-3 ci-py-3">
        <Button variant="transparent" title="Discard" aria-label="Discard" onClick={() => stop(true)} className="ci-h-10 ci-w-10">
          {Icon.close}
        </Button>
        <div className="ci-flex-1 ci-flex ci-items-center ci-gap-2 ci-px-4 ci-py-2.5 ci-rounded-3xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-sm">
          <span className="ci-w-2.5 ci-h-2.5 ci-rounded-full ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark ci-animate-pulse" />
          <span>Recording {mmss(elapsed)}</span>
        </div>
        <Button variant="green" title="Send voice note" aria-label="Send voice note" onClick={() => stop(false)} className="ci-h-10 ci-w-10">
          {Icon.send}
        </Button>
      </div>
    )

  return (
    <div
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (disabled || !e.dataTransfer.files.length) return
        e.preventDefault()
        addFiles(e.dataTransfer.files)
      }}
    >
      {files.length > 0 && <div className="ci-mx-4 ci-border-t ci-border-gray-300 dark:ci-border-gray-700" />}
      {files.length > 0 && (
        <div className="ci-flex ci-gap-2 ci-px-3 ci-pt-3 ci-overflow-x-auto">
          {files.map((f, i) => (
            <div key={i} title={f.name} className="ci-relative ci-shrink-0 ci-w-14 ci-h-14 ci-rounded-xl ci-overflow-hidden ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-flex ci-items-center ci-justify-center">
              {previews[i] ? (
                <img src={previews[i]} alt={f.name} className="ci-w-full ci-h-full ci-object-cover" />
              ) : (
                <span className="ci-flex ci-flex-col ci-items-center ci-gap-0.5 ci-w-full ci-px-1 ci-text-[10px] ci-text-gray-600 dark:ci-text-gray-300">
                  {Icon.clip}
                  <span className="ci-w-full ci-truncate ci-text-center">{f.name}</span>
                </span>
              )}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="ci-absolute ci-top-0.5 ci-right-0.5 ci-w-5 ci-h-5 ci-p-0 ci-rounded-full ci-border-0 ci-bg-gray-700/80 ci-text-white ci-flex ci-items-center ci-justify-center">
                {Icon.xs}
              </button>
            </div>
          ))}
        </div>
      )}
    <div className="ci-relative ci-flex ci-items-center ci-gap-2 ci-px-3 ci-py-3">
      {emoji && <EmojiPicker className="ci-absolute ci-bottom-full ci-left-3 ci-mb-1" onPick={insert} onClose={() => setEmoji(false)} />}
      {candidates.length > 0 && (
        <div role="listbox" aria-label="Group members" className="ci-absolute ci-bottom-full ci-left-3 ci-right-3 ci-mb-1 ci-z-30 ci-py-2 ci-rounded-2xl ci-shadow-xl ci-bg-gray-50 dark:ci-bg-gray-900 ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-700">
          <div className="ci-px-4 ci-pb-1 ci-text-xs ci-font-medium ci-uppercase ci-tracking-wide ci-text-gray-500 dark:ci-text-gray-400">Group members</div>
          {candidates.map((c, i) => (
            <button
              key={c.u}
              type="button"
              role="option"
              aria-selected={i === pick}
              onMouseDown={(e) => (e.preventDefault(), choose(c.u))}
              onMouseEnter={() => setPick(i)}
              className={`ci-w-full ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-1.5 ci-border-0 ci-text-left ci-cursor-pointer ci-text-sm ci-text-gray-900 dark:ci-text-white ${i === pick ? 'ci-bg-gray-200 dark:ci-bg-gray-800' : 'ci-bg-transparent'}`}
            >
              <span className="ci-relative ci-shrink-0">
                <Avatar contact={contacts[c.u]} username={c.u} size={28} />
                <PresenceDot online={online[c.u]} presence={contacts[c.u]?.presence} mobile={mobile[c.u]} />
              </span>
              <span className="ci-font-medium">@{c.u}</span>
              <span className="ci-truncate ci-text-gray-500 dark:ci-text-gray-400">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <input ref={file} type="file" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
      {/* One box, as in the phone island: attach and emoji on the left, the microphone or send on the right. */}
      <div className="ci-flex-1 ci-min-w-0 ci-flex ci-items-end ci-gap-0.5 ci-px-1 ci-py-1 ci-rounded-3xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark focus-within:ci-ring-2 focus-within:ci-ring-gray-400 dark:focus-within:ci-ring-gray-500">
        <button type="button" disabled={disabled || busy} title="Attach files" aria-label="Attach files" onClick={() => file.current?.click()} className="ci-h-8 ci-w-8 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-cursor-pointer ci-text-secondaryNeutral dark:ci-text-secondaryNeutralDark hover:ci-bg-gray-300/70 dark:hover:ci-bg-gray-700/30 disabled:ci-opacity-40 disabled:ci-cursor-default">
          {Icon.clip}
        </button>
        <button type="button" disabled={disabled} title="Emoji" aria-label="Emoji" aria-expanded={emoji} onClick={() => setEmoji((v) => !v)} className="ci-h-8 ci-w-8 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-cursor-pointer ci-text-secondaryNeutral dark:ci-text-secondaryNeutralDark hover:ci-bg-gray-300/70 dark:hover:ci-bg-gray-700/30 disabled:ci-opacity-40 disabled:ci-cursor-default">
          {Icon.smile}
        </button>
          <textarea
            ref={box}
            value={text}
            disabled={disabled}
            rows={1}
            placeholder={disabled ? disabledText ?? 'Connecting…' : busy ? 'Sending…' : files.length ? 'Add a caption' : 'Write a message'}
            onChange={(e) => change(e.target.value)}
            onClick={(e) => findMention(text, e.currentTarget.selectionStart)}
            onBlur={() => setMention(null)}
            onPaste={(e) => {
              if (!e.clipboardData.files.length) return
              e.preventDefault()
              addFiles(e.clipboardData.files)
            }}
            onKeyDown={(e) => {
              if (candidates.length) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setPick((i) => (i + (e.key === 'ArrowDown' ? 1 : candidates.length - 1)) % candidates.length)
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  choose(candidates[Math.min(pick, candidates.length - 1)].u)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setMention(null)
                  return
                }
              }
              // Enter sends; Shift+Enter, or Enter inside an open ``` block, adds a line.
              const inFence = (text.match(/```/g) ?? []).length % 2 === 1
              if (e.key === 'Enter' && !e.shiftKey && !inFence) {
                e.preventDefault()
                submit()
              }
            }}
            className={`${disabled ? 'ci-overflow-hidden' : ''} ci-block ci-flex-1 ci-min-w-0 ci-resize-none ci-max-h-32 ci-px-1 ci-py-1.5 ci-border-0 ci-bg-transparent ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400 ci-outline-none ci-text-sm`}
            style={{ height: Math.min(128, 32 + 20 * (text.split('\n').length - 1)) }}
          />
        {text.trim() || files.length || busy ? (
          <button type="button" disabled={disabled || busy} onClick={submit} title="Send" aria-label="Send" className="ci-h-8 ci-w-8 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-cursor-pointer ci-text-accent-700 dark:ci-text-accent-500 hover:ci-bg-gray-300/70 dark:hover:ci-bg-gray-700/30 disabled:ci-opacity-40 disabled:ci-cursor-default">
            {Icon.send}
          </button>
        ) : (
          <button type="button" disabled={disabled || typeof MediaRecorder === 'undefined'} onClick={record} title="Record a voice note" aria-label="Record a voice note" className="ci-h-8 ci-w-8 ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-cursor-pointer ci-text-secondaryNeutral dark:ci-text-secondaryNeutralDark hover:ci-bg-gray-300/70 dark:hover:ci-bg-gray-700/30 disabled:ci-opacity-40 disabled:ci-cursor-default">
            {Icon.mic}
          </button>
        )}
      </div>
    </div>
    </div>
  )
}
