import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Avatar, PresenceDot } from './Avatar'
import { Button, Icon } from './Button'

/** Pick one operator for a chat, or several for a group. */
/** A picture for the group: whatever was chosen, squared and shrunk so it travels in the room's vCard. */
export async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  canvas.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 128, 128)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export function NewChat({ onOpen, onCreateGroup, onDragStart, docked }: { onOpen: (peer: string) => void; onCreateGroup: (name: string, members: string[], avatar?: string) => Promise<void>; onDragStart?: (e: React.PointerEvent) => void; docked?: boolean }) {
  const { contacts, online, mobile, setPicker } = useStore()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [avatar, setAvatar] = useState<string>()
  const picture = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    const all = Object.values(contacts)
    const s = q.trim().toLowerCase()
    return s ? all.filter((c) => (c.name ?? '').toLowerCase().includes(s) || c.username.includes(s)) : all
  }, [contacts, q])

  const toggle = (u: string) => setSelected((sel) => (sel.includes(u) ? sel.filter((x) => x !== u) : [...sel, u]))
  const create = async () => {
    setBusy(true)
    try {
      await onCreateGroup(name.trim(), selected, avatar)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${docked ? 'ci-w-full ci-h-full' : 'ci-w-[25rem] ci-max-h-[30rem] ci-rounded-3xl ci-shadow-2xl dark:ci-border dark:ci-border-solid dark:ci-border-gray-700'} ci-flex ci-flex-col ci-overflow-hidden ci-bg-gray-50 dark:ci-bg-gray-950 ci-text-gray-900 dark:ci-text-white`}>
      {/* The search row moves the island too, like a conversation's header; typing and closing stay clicks. */}
      <div
        className={`ci-px-4 ci-py-3 ci-flex ci-items-center ci-gap-2 ${onDragStart ? 'ci-cursor-grab active:ci-cursor-grabbing ci-touch-none' : ''}`}
        onPointerDown={(e) => !(e.target as HTMLElement).closest('input, button') && onDragStart?.(e)}
      >
        <div className="ci-flex-1 ci-flex ci-items-center ci-gap-2 ci-px-4 ci-py-2 ci-rounded-3xl ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-500 dark:ci-text-gray-400">
          {Icon.search}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search operators"
            className="ci-flex-1 ci-bg-transparent ci-border-0 ci-outline-none ci-text-sm ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400"
          />
        </div>
        <Button variant="small" onClick={() => setPicker(false)} aria-label="Close">
          {Icon.close}
        </Button>
      </div>
      {selected.length > 0 && (
        <div className="ci-px-4 ci-pb-2 ci-flex ci-flex-wrap ci-gap-1.5">
          {selected.map((u) => (
            <button key={u} type="button" onClick={() => toggle(u)} className="ci-flex ci-items-center ci-gap-1 ci-pl-2.5 ci-pr-1.5 ci-py-1 ci-rounded-full ci-text-xs ci-bg-gray-700 ci-text-gray-50 dark:ci-bg-gray-300 dark:ci-text-gray-900 ci-border-0">
              {contacts[u]?.name ?? u}
              {Icon.close}
            </button>
          ))}
        </div>
      )}
      <div className="ci-border-t ci-border-gray-300 dark:ci-border-gray-700" />
      <ul className="ci-overflow-y-auto ci-py-1 ci-m-0 ci-p-0 ci-list-none ci-flex-1">
        {list.length === 0 && <li className="ci-px-4 ci-py-6 ci-text-center ci-text-sm ci-text-gray-500 dark:ci-text-gray-400">No operators found</li>}
        {list.map((c) => {
          const on = selected.includes(c.username)
          return (
            <li key={c.username}>
              <button type="button" onClick={() => toggle(c.username)} className="ci-w-full ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-2 ci-bg-transparent ci-border-0 ci-text-left hover:ci-bg-gray-300/70 dark:hover:ci-bg-gray-700/30 ci-text-inherit">
                <span className="ci-relative">
                  <Avatar contact={c} username={c.username} size={36} />
                  <PresenceDot online={online[c.username]} presence={c.presence} mobile={mobile[c.username]} />
                </span>
                <span className="ci-flex ci-flex-col ci-min-w-0 ci-flex-1">
                  <span className="ci-text-sm ci-font-medium ci-truncate">{c.name}</span>
                  <span className="ci-text-xs ci-text-gray-500 dark:ci-text-gray-400 ci-truncate">{c.username}</span>
                </span>
                <span className={`ci-w-5 ci-h-5 ci-rounded-full ci-border ci-flex ci-items-center ci-justify-center ${on ? 'ci-bg-phoneIslandCall dark:ci-bg-phoneIslandCallDark ci-border-transparent ci-text-white dark:ci-text-gray-950' : 'ci-border-gray-400 dark:ci-border-gray-600'}`}>
                  {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {selected.length > 0 && (
        <div className="ci-border-t ci-border-gray-300 dark:ci-border-gray-700 ci-px-4 ci-py-3 ci-flex ci-items-center ci-gap-2">
          {selected.length === 1 ? (
            <Button variant="default" className="ci-w-auto ci-h-10 ci-px-5" onClick={() => onOpen(selected[0])}>
              Open chat
            </Button>
          ) : (
            <>
              <input ref={picture} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then(setAvatar).catch(() => {})} />
              <button type="button" title="Group picture" onClick={() => picture.current?.click()} className="ci-w-10 ci-h-10 ci-shrink-0 ci-rounded-full ci-border-0 ci-p-0 ci-overflow-hidden ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-500 dark:ci-text-gray-400 ci-flex ci-items-center ci-justify-center">
                {avatar ? <img src={avatar} alt="" draggable={false} className="ci-w-full ci-h-full ci-object-cover" /> : Icon.camera}
              </button>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && create()}
                className="ci-flex-1 ci-min-w-0 ci-w-0 ci-px-4 ci-py-2 ci-rounded-3xl ci-border-0 ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-sm ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400 ci-outline-none focus:ci-ring-2 focus:ci-ring-gray-400 dark:focus:ci-ring-gray-500"
              />
              <Button variant="green" className="ci-w-auto ci-h-10 ci-px-4 ci-shrink-0 ci-whitespace-nowrap" disabled={!name.trim() || busy} onClick={create}>
                {busy ? '…' : 'Create group'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
