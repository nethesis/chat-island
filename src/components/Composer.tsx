import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Icon } from './Button'
import { EmojiPicker } from './EmojiPicker'
import { webmOpusToOgg } from '../ogg'
import { emojify } from '../shortcodes'

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

export function Composer({ onSend, onTyping, onFile, disabled, focusKey }: { onSend: (text: string) => Promise<void> | void; onTyping: (composing: boolean) => void; onFile: (f: File) => void; disabled: boolean; focusKey?: number }) {
  const [text, setText] = useState('')
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
    if (!t) return
    setText('')
    // Not sent (the connection just dropped): give the text back rather than lose it.
    Promise.resolve(onSend(t)).catch(() => setText((cur) => cur || t))
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
    <div className="ci-relative ci-flex ci-items-center ci-gap-2 ci-px-3 ci-py-3">
      {emoji && <EmojiPicker className="ci-absolute ci-bottom-full ci-left-3 ci-mb-1" onPick={insert} onClose={() => setEmoji(false)} />}
      <input ref={file} type="file" hidden onChange={(e) => e.target.files?.[0] && (onFile(e.target.files[0]), (e.target.value = ''))} />
      <Button variant="transparent" disabled={disabled} title="Attach a file" onClick={() => file.current?.click()} className="ci-h-10 ci-w-10">
        {Icon.clip}
      </Button>
      <div className="ci-relative ci-flex-1 ci-min-w-0">
        <button
          type="button"
          disabled={disabled}
          title="Emoji"
          aria-label="Emoji"
          aria-expanded={emoji}
          onClick={() => setEmoji((v) => !v)}
          className="ci-absolute ci-left-2 ci-bottom-1 ci-z-10 ci-h-8 ci-w-8 ci-flex ci-items-center ci-justify-center ci-rounded-full ci-border-0 ci-bg-transparent ci-text-secondaryNeutral dark:ci-text-secondaryNeutralDark hover:ci-bg-gray-300/70 dark:hover:ci-bg-gray-700/30 disabled:ci-opacity-40"
        >
          {Icon.smile}
        </button>
        <textarea
          ref={box}
          value={text}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? 'Connecting…' : 'Write a message'}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter, or Enter inside an open ``` block, adds a line.
            const inFence = (text.match(/```/g) ?? []).length % 2 === 1
            if (e.key === 'Enter' && !e.shiftKey && !inFence) {
              e.preventDefault()
              submit()
            }
          }}
          className="ci-block ci-w-full ci-resize-none ci-max-h-32 ci-pl-11 ci-pr-4 ci-py-2.5 ci-rounded-3xl ci-border-0 ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400 ci-outline-none focus:ci-ring-2 focus:ci-ring-gray-400 dark:focus:ci-ring-gray-500 ci-text-sm"
          style={{ height: Math.min(128, 40 + 20 * (text.split('\n').length - 1)) }}
        />
      </div>
      {text.trim() ? (
        <Button variant="default" disabled={disabled} onClick={submit} title="Send" className="ci-h-10 ci-w-10">
          {Icon.send}
        </Button>
      ) : (
        <Button variant="default" disabled={disabled || typeof MediaRecorder === 'undefined'} onClick={record} title="Record a voice note" aria-label="Record a voice note" className="ci-h-10 ci-w-10">
          {Icon.mic}
        </Button>
      )}
    </div>
  )
}
