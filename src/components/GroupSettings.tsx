import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import type { Conversation } from '../types'
import { Avatar, GroupAvatar } from './Avatar'
import { Button, Icon } from './Button'
import { shrink } from './NewChat'
import { t } from '../i18n'
import { isGuest } from '../types'
import type { GuestInfo } from '../api'
import { ExternalBadge } from './ChatWindow'

type Change = { add?: string[]; remove?: string; name?: string; avatar?: string }

/** The owner's panel for a group: picture, name, members in and out. */
// Confirmations as in the message menu's delete: two pills.
const pillCancel = 'ci-h-7 ci-px-3 ci-rounded-full ci-border-0 ci-bg-transparent ci-cursor-pointer ci-text-sm ci-text-gray-700 dark:ci-text-gray-200 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800'
const pillDanger = 'ci-h-7 ci-px-3 ci-rounded-full ci-border-0 ci-cursor-pointer ci-text-sm ci-bg-rose-700 ci-text-white hover:ci-bg-rose-800 dark:ci-bg-rose-500 dark:hover:ci-bg-rose-400 dark:ci-text-gray-950 disabled:ci-opacity-50'

/** A question, then its two answers together on one line. */
export function Confirm({ text, action, busy, onCancel, onConfirm }: { text: string; action: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="ci-flex ci-flex-col ci-gap-2">
      <span className="ci-text-sm ci-text-gray-900 dark:ci-text-gray-50">{text}</span>
      <div className="ci-flex ci-items-center ci-gap-2">
        <button type="button" className={pillCancel} onClick={onCancel}>
          {t('Common.Cancel')}
        </button>
        <button type="button" className={pillDanger} disabled={busy} onClick={onConfirm}>
          {action}
        </button>
      </div>
    </div>
  )
}

export function GroupSettings({ conv, onEdit, onGuest, onShare, onClose }: { conv: Conversation; onEdit: (change: Change) => Promise<void>; onGuest?: (op?: 'link' | 'revoke' | 'remove', guest?: string) => Promise<GuestInfo>; onShare?: () => Promise<GuestInfo>; onClose: () => void }) {
  const { contacts, inactive, guests, me } = useStore(useShallow((s) => ({ contacts: s.contacts, inactive: s.inactive, guests: s.guests, me: s.me })))
  const [name, setName] = useState(conv.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<string | null>(null) // asked to confirm
  const [adding, setAdding] = useState(false)
  const [sharing, setSharing] = useState(false) // asked to confirm before opening it to people outside
  const [closing, setClosing] = useState(false) // asked to confirm before making it private again
  const [relinking, setRelinking] = useState(false) // asked to confirm before replacing the link
  const [copied, setCopied] = useState(false)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const picture = useRef<HTMLInputElement>(null)
  // A room with someone outside the PBX: their link, to copy again or revoke.
  const [guest, setGuest] = useState<GuestInfo | null>(null)
  useEffect(() => {
    onGuest?.().then(setGuest).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const members = [...(conv.members ?? [])].sort((a, b) => Number(b === me) - Number(a === me) || Number(isGuest(a)) - Number(isGuest(b)) || (contacts[a]?.name ?? a).localeCompare(contacts[b]?.name ?? b))
  const nameOf = (u: string) => (u === me ? t('Common.You') : contacts[u]?.name ?? inactive[u] ?? guests[u] ?? u)
  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase()
    return Object.values(contacts)
      .filter((c) => c.username !== me && !conv.members?.includes(c.username) && !inactive[c.username])
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.username.includes(s))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [contacts, inactive, me, conv.members, q])

  const run = async (change: Change, after?: () => void) => {
    setBusy(true)
    setError('')
    try {
      await onEdit(change)
      after?.()
    } catch (e) {
      setError((e as Error).message || t('Group.Not saved'))
    } finally {
      setBusy(false)
    }
  }

  // The mockup's buttons: outlined, or accent text alone; the confirming one red.
  const outline = 'ci-w-auto ci-h-9 ci-px-3 ci-gap-2 ci-rounded-md ci-border ci-border-solid !ci-border-gray-300 dark:!ci-border-gray-600'
  const text = 'ci-w-auto ci-px-2 ci-gap-2 ci-rounded-md'
  const danger = 'ci-h-9 ci-px-3 ci-rounded-md ci-border-0 ci-cursor-pointer ci-text-sm ci-font-medium ci-bg-rose-700 ci-text-white hover:ci-bg-rose-800 dark:ci-bg-rose-600 dark:hover:ci-bg-rose-500 disabled:ci-opacity-50'
  const answers = (action: string, onCancel: () => void, onConfirm: () => void) => (
    <div className="ci-flex ci-items-center ci-justify-end ci-gap-2 ci-ml-auto">
      <Button variant="tertiary" className={text} onClick={onCancel}>
        {t('Common.Cancel')}
      </Button>
      <button type="button" className={danger} disabled={busy} onClick={onConfirm}>
        {action}
      </button>
    </div>
  )
  // A question in a grey box, its answers beside it or, when narrow, below.
  const ask = (question: string, action: string, onCancel: () => void, onConfirm: () => void) => (
    <div className="ci-flex ci-flex-wrap ci-items-center ci-gap-2 ci-p-3 ci-rounded-lg ci-bg-elevationL2 dark:ci-bg-elevationL2Dark">
      <span className="ci-flex-1 ci-min-w-48 ci-text-gray-700 dark:ci-text-gray-200">{question}</span>
      {answers(action, onCancel, onConfirm)}
    </div>
  )
  const badge = (label: string, cls: string) => <span className={`ci-shrink-0 ci-inline-flex ci-items-center ci-whitespace-nowrap ci-rounded-full ci-px-2.5 ci-py-0.5 ci-text-xs ci-leading-4 ci-font-medium ${cls}`}>{label}</span>
  const copy = (link: string) => navigator.clipboard?.writeText(link).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500))).catch(() => {})
  const share = () => {
    setBusy(true)
    ;(guest && onGuest ? onGuest('link') : onShare!())
      .then(setGuest)
      .catch((e) => setError((e as Error).message))
      .finally(() => (setBusy(false), setSharing(false)))
  }

  return (
    <div className="ci-anim-drop ci-absolute ci-left-4 ci-right-4 ci-top-[4.5rem] ci-bottom-4 ci-z-30 ci-flex ci-flex-col ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-900 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-text-sm">
      <div className="ci-flex ci-items-center ci-justify-between ci-mx-6 ci-pt-5 ci-pb-3 ci-border-b ci-border-solid ci-border-0 ci-border-gray-300 dark:ci-border-gray-700">
        <span className="ci-text-base ci-font-medium">{t('Common.Group settings')}</span>
        <Button variant="small" onClick={onClose} aria-label={t('Common.Close')} title={t('Common.Close')}>
          {Icon.close}
        </Button>
      </div>
      <div className="ci-flex-1 ci-overflow-y-auto">
      {/* Picture and name */}
      <div className="ci-flex ci-items-end ci-gap-3 ci-px-6 ci-pt-5 ci-pb-4">
        <input ref={picture} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then((avatar) => run({ avatar })).catch(() => setError(t('Group.Picture not readable')))} />
        <button type="button" title={t('Group.Change picture')} aria-label={t('Group.Change picture')} disabled={busy} onClick={() => picture.current?.click()} className="ci-relative ci-shrink-0 ci-rounded-full ci-border-0 ci-p-0 ci-bg-transparent ci-group">
          <GroupAvatar peer={conv.peer} name={conv.name ?? conv.peer} size={48} avatar={conv.avatar} />
          <span className="ci-absolute ci-inset-0 ci-rounded-full ci-bg-black/50 ci-text-white ci-hidden group-hover:ci-flex ci-items-center ci-justify-center">{Icon.camera}</span>
        </button>
        <label className="ci-flex ci-flex-1 ci-min-w-0 ci-flex-col ci-gap-1.5">
          <span className="ci-font-medium ci-text-gray-700 dark:ci-text-gray-200">{t('Common.Group name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && name.trim() !== conv.name && run({ name: name.trim() })}
            className="ci-w-full ci-box-border ci-h-9 ci-px-3 ci-rounded-md ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-outline-none focus:ci-border-accent-500 ci-bg-white dark:ci-bg-gray-950 ci-text-gray-900 dark:ci-text-white"
          />
        </label>
        <Button variant="green" className="ci-w-auto ci-h-9 ci-px-4 ci-rounded-md ci-font-medium" disabled={busy} onClick={() => name.trim() && name.trim() !== conv.name && run({ name: name.trim() })}>
          {t('Group.Save')}
        </Button>
      </div>
      {error && <div className="ci-px-6 ci-pb-2 ci-text-xs ci-text-phoneIslandClose dark:ci-text-phoneIslandCloseDark">{error}</div>}
      {(guest || onShare) && !adding && (() => {
        // The link only lets people in: closed (revoked or expired), who joined stays.
        const open = !!guest && !guest.revoked && guest.expires * 1000 > Date.now()
        const mine = !guest || guest.owner
        return (
          <div className="ci-flex ci-flex-col ci-gap-2 ci-mx-6 ci-pb-5 ci-border-b ci-border-solid ci-border-0 ci-border-gray-300 dark:ci-border-gray-700">
            <div className="ci-flex ci-flex-col ci-gap-0.5">
              <span className="ci-font-medium ci-text-gray-700 dark:ci-text-gray-200">{t('Group.External link')}</span>
              <span className="ci-text-gray-500 dark:ci-text-gray-400">
                {!mine ? t('Group.Only who invited manages the link') : open ? t('Group.Open until {{date}}', { date: new Date(guest!.expires * 1000).toLocaleDateString() }) : guest && !guest.revoked ? t('Group.Link expired') : t('Group.Private note')}
              </span>
            </div>
            {mine && (
              <div className="ci-flex ci-flex-wrap ci-items-center ci-gap-x-2 ci-gap-y-1">
                {/* Shown once, when made: the server keeps only its hash. A new one replaces it. */}
                {open && guest!.link && (
                  <Button variant="tertiary" className={outline} onClick={() => copy(guest!.link!)}>
                    {copied ? Icon.check : Icon.copy} {copied ? t('Group.Copied') : t('Group.Copy link')}
                  </Button>
                )}
                {open && !relinking && (
                  <Button variant="tertiary" className={text} disabled={busy} onClick={() => (setRelinking(true), setClosing(false))}>
                    {Icon.link} {t('Group.New link')}
                  </Button>
                )}
                {open && !closing && (
                  <Button variant="tertiary" className={text} disabled={busy} onClick={() => (setClosing(true), setRelinking(false))}>
                    {Icon.lock} {t('Group.Make private')}
                  </Button>
                )}
                {!open && !sharing && (
                  <Button variant="tertiary" className={text} disabled={busy} onClick={() => setSharing(true)}>
                    {Icon.lockOpen} {t('Group.Make public')}
                  </Button>
                )}
              </div>
            )}
            {relinking && ask(t('Group.New link confirm'), t('Group.New link'), () => setRelinking(false), () => onGuest?.('link').then(setGuest).catch((e) => setError((e as Error).message)).finally(() => setRelinking(false)))}
            {/* Private again: the link stops working; who joined stays, and a new link shares it again. */}
            {closing && ask(t('Group.Make private confirm'), t('Group.Make private'), () => setClosing(false), () => onGuest?.('revoke').then(setGuest).catch((e) => setError((e as Error).message)).finally(() => setClosing(false)))}
            {sharing && ask(t('Group.Share outside confirm'), t('Group.Make public'), () => setSharing(false), share)}
          </div>
        )
      })()}
      {adding ? (
        // Operators to add: search, tick, add.
        <>
          <div className="ci-px-6 ci-pt-3 ci-pb-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Common.Search operators')} className="ci-w-full ci-box-border ci-h-9 ci-px-3 ci-rounded-md ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-outline-none focus:ci-border-accent-500 ci-bg-white dark:ci-bg-gray-950 ci-text-gray-900 dark:ci-text-white" />
          </div>
          <ul className="ci-m-0 ci-p-0 ci-list-none">
            {candidates.length === 0 && <li className="ci-px-6 ci-py-4 ci-text-center ci-text-gray-500 dark:ci-text-gray-400">{t('Group.No operators to add')}</li>}
            {candidates.map((c) => {
              const on = picked.includes(c.username)
              return (
                <li key={c.username}>
                  <button type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.username) : [...p, c.username]))} className="ci-w-full ci-flex ci-items-center ci-gap-3 ci-px-6 ci-py-1.5 ci-border-0 ci-bg-transparent ci-text-left ci-text-inherit hover:ci-bg-gray-200 dark:hover:ci-bg-gray-700">
                    <Avatar contact={c} username={c.username} size={28} />
                    <span className="ci-flex-1 ci-truncate">{c.name}</span>
                    {/* As in New chat: the circled check when picked. */}
                    {on ? <span className="ci-flex ci-text-accent-700 dark:ci-text-accent-500">{Icon.circleCheck}</span> : <span className="ci-w-5 ci-h-5 ci-box-border ci-rounded-full ci-border ci-border-solid ci-border-gray-400 dark:ci-border-gray-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        // Members, each one removable but me.
        <>
          <div className="ci-flex ci-items-center ci-justify-between ci-gap-2 ci-px-6 ci-pt-5 ci-pb-2">
            <span className="ci-text-base ci-font-medium">
              {t('Group.Members')} <span className="ci-ml-1 ci-text-sm ci-font-normal ci-text-gray-500 dark:ci-text-gray-400">{members.length}</span>
            </span>
            <Button variant="tertiary" className={outline} disabled={busy} onClick={() => setAdding(true)}>
              {Icon.userPlus} {t('Group.Add members')}
            </Button>
          </div>
          <ul className="ci-m-0 ci-px-6 ci-pb-4 ci-list-none">
            {members.map((u, i) => {
              // Who can go: anyone but me, a guest only when the link is mine.
              const removable = u !== me && (!isGuest(u) || !!guest?.owner)
              const asking = removing === u
              return (
                // Same padding asking or not, so nothing moves; no dividers around the one asked about.
                <li key={u} className={`ci-border-0 ci-border-t first:ci-border-t-0 ci-border-solid ${asking || removing === members[i - 1] ? 'ci-border-transparent' : 'ci-border-gray-300 dark:ci-border-gray-700'}`}>
                  <div className={`ci-flex ci-flex-col ci-gap-2 ci--mx-3 ci-my-1 ci-px-3 ci-py-1.5 ci-rounded-lg ${asking ? 'ci-bg-elevationL2 dark:ci-bg-elevationL2Dark' : ''}`}>
                    <div className="ci-flex ci-items-center ci-gap-3">
                      <Avatar contact={isGuest(u) ? { username: u, name: guests[u] ?? u } : contacts[u]} username={u} size={32} />
                      <span className="ci-flex ci-flex-1 ci-min-w-0 ci-flex-wrap ci-items-center ci-gap-x-2 ci-gap-y-0.5">
                        <span className="ci-truncate ci-max-w-full">{nameOf(u)}</span>
                        {u === me && badge(t('Group.Owner'), 'ci-bg-gray-200 ci-text-gray-700 dark:ci-bg-gray-700 dark:ci-text-gray-100')}
                        {isGuest(u) && <ExternalBadge />}
                      </span>
                      {removable && !asking && (
                        <Button variant="tertiary" className={text} aria-label={t('Common.Remove {{name}}', { name: nameOf(u) })} title={t('Group.Remove from the group')} disabled={busy} onClick={() => setRemoving(u)}>
                          {Icon.circleMinus} {t('Common.Remove')}
                        </Button>
                      )}
                    </div>
                    {asking && (
                      <div className="ci-flex ci-flex-wrap ci-items-center ci-gap-2">
                        <span className="ci-flex-1 ci-min-w-48 ci-text-gray-700 dark:ci-text-gray-200">{t('Group.Remove {{name}} confirm', { name: nameOf(u) })}</span>
                        {answers(t('Common.Remove'), () => setRemoving(null), () =>
                          isGuest(u) ? onGuest?.('remove', u).then((g) => (setGuest(g), setRemoving(null))).catch((e) => setError((e as Error).message)) : run({ remove: u }, () => setRemoving(null)),
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      </div>
      {adding && (
        <div className="ci-flex ci-justify-end ci-gap-2 ci-px-6 ci-py-3 ci-border-0 ci-border-t ci-border-solid ci-border-gray-300 dark:ci-border-gray-700">
          <Button variant="tertiary" className={text} onClick={() => (setAdding(false), setPicked([]), setQ(''))}>
            {t('Common.Cancel')}
          </Button>
          <Button variant="green" className="ci-w-auto ci-h-9 ci-px-4 ci-rounded-md ci-font-medium" disabled={busy || !picked.length} onClick={() => run({ add: picked }, () => (setAdding(false), setPicked([]), setQ('')))}>
            {t('Group.Add')}{picked.length ? ` (${picked.length})` : ''}
          </Button>
        </div>
      )}
    </div>
  )
}
