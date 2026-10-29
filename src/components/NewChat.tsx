import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Avatar, PresenceDot } from './Avatar'
import { Button, Icon } from './Button'
import { t } from '../i18n'
import type { GuestInfo } from '../api'
import { SecretLink } from './SecretLink'

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

export function NewChat({ onOpen, onCreateGroup, onInvite, onDragStart, docked }: { onOpen: (peer: string) => void; onCreateGroup: (name: string, members: string[], avatar?: string) => Promise<void>; onInvite?: (name: string) => Promise<GuestInfo>; onDragStart?: (e: React.PointerEvent) => void; docked?: boolean }) {
  const { contacts, online, mobile, setPicker, myName } = useStore()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [avatar, setAvatar] = useState<string>()
  const picture = useRef<HTMLInputElement>(null)
  // Someone outside the PBX: a name, then the link to send them.
  const [inviting, setInviting] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guest, setGuest] = useState<GuestInfo | null>(null)
  const [error, setError] = useState('')
  const invite = async () => {
    if (!onInvite || !guestName.trim()) return
    setBusy(true)
    setError('')
    try {
      setGuest(await onInvite(guestName.trim()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const list = useMemo(() => {
    const all = Object.values(contacts)
    const s = q.trim().toLowerCase()
    return s ? all.filter((c) => (c.name ?? '').toLowerCase().includes(s) || c.username.includes(s)) : all
  }, [contacts, q])

  const toggle = (u: string) => setSelected((sel) => (sel.includes(u) ? sel.filter((x) => x !== u) : [...sel, u]))
  const create = async () => {
    setBusy(true)
    try {
      // No name, as in WhatsApp: the members' first names, mine last; the owner can rename it later.
      const first = (n: string) => n.split(' ')[0]
      const fallback = [...selected.map((u) => first(contacts[u]?.name ?? u)), ...(myName ? [first(myName)] : [])].join(', ')
      await onCreateGroup(name.trim() || fallback, selected, avatar)
    } finally {
      setBusy(false)
    }
  }

  const field = 'ci-h-12 ci-rounded-full ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 focus-within:ci-border-transparent focus-within:ci-ring-2 focus-within:ci-ring-accent-500 dark:focus-within:ci-ring-accent-300'
  return (
    <div className={`${docked ? 'ci-w-full ci-h-full' : 'ci-w-[25rem] ci-h-[32rem] ci-rounded-3xl ci-shadow-2xl ci-border ci-border-solid ci-border-gray-200 dark:ci-border-gray-800'} ci-flex ci-flex-col ci-overflow-hidden ci-bg-gray-50 dark:ci-bg-gray-950 ci-text-gray-900 dark:ci-text-white`}>
      <div className="ci-px-4 ci-pt-3 ci-pb-3 ci-flex ci-flex-col ci-gap-3 ci-border-b ci-border-solid ci-border-x-0 ci-border-t-0 ci-border-gray-300 dark:ci-border-gray-700">
        {/* The title row moves the island too, like a conversation's header; closing stays a click. */}
        <div
          className={`ci-flex ci-items-center ci-justify-between ${onDragStart ? 'ci-cursor-grab active:ci-cursor-grabbing ci-touch-none' : ''}`}
          onPointerDown={(e) => !(e.target as HTMLElement).closest('button') && onDragStart?.(e)}
        >
          <span className="ci-text-lg ci-font-medium">{t('Common.New chat')}</span>
          <Button variant="small" onClick={() => setPicker(false)} aria-label={t('Common.Close')}>
            {Icon.close}
          </Button>
        </div>
        <label className={`ci-flex ci-items-center ci-gap-3 ci-px-4 ci-text-gray-500 dark:ci-text-gray-400 ${field}`}>
          {Icon.search}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Common.Search operators')}
            className="ci-flex-1 ci-min-w-0 ci-bg-transparent ci-border-0 ci-outline-none ci-text-sm ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400"
          />
        </label>
        {selected.length > 0 && (
          <div className="ci-flex ci-flex-wrap ci-gap-1.5">
            {selected.map((u) => (
              <button key={u} type="button" title={t('Common.Remove {{name}}', { name: contacts[u]?.name ?? u })} onClick={() => toggle(u)} className="ci-flex ci-items-center ci-gap-1.5 ci-pl-2.5 ci-pr-2 ci-py-0.5 ci-rounded-full ci-text-xs ci-font-medium ci-bg-gray-200 ci-text-gray-800 dark:ci-bg-gray-700 dark:ci-text-gray-100 ci-border-0 ci-cursor-pointer">
                {(contacts[u]?.name ?? u).split(' ')[0]}
                {Icon.xs}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="ci-overflow-y-auto ci-py-1 ci-m-0 ci-p-0 ci-list-none ci-flex-1">
        {list.length === 0 && <li className="ci-px-4 ci-py-6 ci-text-center ci-text-sm ci-text-gray-500 dark:ci-text-gray-400">{t('NewChat.No operators found')}</li>}
        {list.map((c) => {
          const on = selected.includes(c.username)
          return (
            <li key={c.username}>
              <button type="button" aria-pressed={on} onClick={() => toggle(c.username)} className="ci-w-full ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-2.5 ci-bg-transparent ci-border-0 ci-text-left ci-cursor-pointer hover:ci-bg-gray-200/70 dark:hover:ci-bg-gray-800/50 ci-text-inherit">
                <span className="ci-relative ci-shrink-0">
                  <Avatar contact={c} username={c.username} size={40} />
                  <PresenceDot online={online[c.username]} presence={c.presence} mobile={mobile[c.username]} />
                </span>
                <span className="ci-flex ci-flex-col ci-min-w-0 ci-flex-1">
                  <span className="ci-text-sm ci-font-medium ci-truncate">{c.name || c.username}</span>
                  <span className="ci-text-sm ci-text-gray-500 dark:ci-text-gray-400 ci-truncate">@{c.username}</span>
                </span>
                {on ? (
                  <span className="ci-flex ci-text-accent-700 dark:ci-text-accent-500">{Icon.circleCheck}</span>
                ) : (
                  <span className="ci-w-5 ci-h-5 ci-box-border ci-rounded-full ci-border ci-border-solid ci-border-gray-400 dark:ci-border-gray-600" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="ci-border-t ci-border-solid ci-border-x-0 ci-border-b-0 ci-border-gray-300 dark:ci-border-gray-700 ci-px-4 ci-py-4 ci-flex ci-items-center ci-gap-2">
        {guest ? (
          <div className="ci-flex ci-flex-col ci-gap-2 ci-w-full ci-text-sm">
            <span className="ci-text-gray-600 dark:ci-text-gray-300">{t('NewChat.Link ready')}</span>
            <div className="ci-flex ci-items-center ci-gap-2">
              <SecretLink link={guest.link} />
              <Button variant="default" className="ci-w-auto ci-h-10 ci-px-5 ci-gap-2 ci-whitespace-nowrap ci-font-medium" onClick={() => onOpen(guest.room)}>
                {Icon.arrowRight}
                {t('NewChat.Open chat')}
              </Button>
            </div>
          </div>
        ) : inviting ? (
          <div className="ci-flex ci-flex-col ci-gap-2 ci-w-full">
            <div className="ci-flex ci-items-center ci-gap-2">
              <Button variant="small" aria-label={t('Common.Cancel')} title={t('Common.Cancel')} onClick={() => (setInviting(false), setError(''))}>
                {Icon.close}
              </Button>
              <input
                autoFocus
                value={guestName}
                maxLength={64}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={t('NewChat.External name')}
                onKeyDown={(e) => e.key === 'Enter' && !busy && invite()}
                className={`ci-flex-1 ci-min-w-0 ci-w-0 ci-box-border ci-px-4 ci-bg-transparent ci-text-sm ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400 ci-outline-none focus:ci-border-transparent focus:ci-ring-2 focus:ci-ring-accent-500 dark:focus:ci-ring-accent-300 ${field}`}
              />
              <Button variant="default" className="ci-w-auto ci-px-5 ci-gap-2 ci-whitespace-nowrap ci-font-medium" disabled={busy || !guestName.trim()} onClick={invite}>
                {Icon.link}
                {busy ? '…' : t('NewChat.Create link')}
              </Button>
            </div>
            {error && <span className="ci-text-xs ci-text-phoneIslandClose dark:ci-text-phoneIslandCloseDark">{error}</span>}
          </div>
        ) : selected.length < 2 ? (
          <>
            {onInvite && !selected.length && (
              <Button variant="tertiary" className="ci-w-auto ci-gap-2" onClick={() => setInviting(true)}>
                {Icon.link}
                {t('NewChat.Invite external')}
              </Button>
            )}
            <Button variant="default" className="ci-w-auto ci-px-6 ci-gap-3 ci-ml-auto ci-font-medium" disabled={!selected.length} onClick={() => onOpen(selected[0])}>
              {Icon.arrowRight}
              {t('NewChat.Start chat')}
            </Button>
          </>
        ) : (
          <>
            <input ref={picture} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then(setAvatar).catch(() => {})} />
            <button type="button" title={t('NewChat.Group picture')} aria-label={t('NewChat.Group picture')} onClick={() => picture.current?.click()} className="ci-w-12 ci-h-12 ci-shrink-0 ci-box-border ci-p-0 ci-overflow-hidden ci-rounded-full ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-bg-transparent ci-cursor-pointer ci-text-gray-700 dark:ci-text-gray-200 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800 ci-flex ci-items-center ci-justify-center">
              {avatar ? <img src={avatar} alt="" draggable={false} className="ci-w-full ci-h-full ci-object-cover" /> : Icon.camera}
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('NewChat.Group name (optional)')}
              onKeyDown={(e) => e.key === 'Enter' && !busy && create()}
              className={`ci-flex-1 ci-min-w-0 ci-w-0 ci-box-border ci-px-4 ci-bg-transparent ci-text-sm ci-text-gray-900 dark:ci-text-white placeholder:ci-text-gray-500 dark:placeholder:ci-text-gray-400 ci-outline-none focus:ci-border-transparent focus:ci-ring-2 focus:ci-ring-accent-500 dark:focus:ci-ring-accent-300 ${field}`}
            />
            <Button variant="default" className="ci-w-auto ci-px-5 ci-gap-2 ci-whitespace-nowrap ci-font-medium" disabled={busy} onClick={create}>
              {Icon.group}
              {busy ? '…' : t('NewChat.Create group')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
