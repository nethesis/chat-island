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
import { SecretLink } from './SecretLink'

type Change = { add?: string[]; remove?: string; name?: string; avatar?: string }

/** The owner's panel for a group: picture, name, members in and out. */
// Confirmations as in the message menu's delete: two pills.
const pillCancel = 'ci-h-7 ci-px-3 ci-rounded-full ci-border-0 ci-bg-transparent ci-cursor-pointer ci-text-sm ci-text-gray-700 dark:ci-text-gray-200 hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800'
const pillDanger = 'ci-h-7 ci-px-3 ci-rounded-full ci-border-0 ci-cursor-pointer ci-text-sm ci-bg-rose-700 ci-text-white hover:ci-bg-rose-800 dark:ci-bg-rose-500 dark:hover:ci-bg-rose-400 dark:ci-text-gray-950 disabled:ci-opacity-50'

/** A question, then its two answers together on one line. */
function Confirm({ text, action, busy, onCancel, onConfirm }: { text: string; action: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
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
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const picture = useRef<HTMLInputElement>(null)
  // A room with someone outside the PBX: their link, to copy again or revoke.
  const [guest, setGuest] = useState<GuestInfo | null>(null)
  useEffect(() => {
    onGuest?.().then(setGuest).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const members = [...(conv.members ?? [])].sort((a, b) => Number(isGuest(a)) - Number(isGuest(b)) || Number(a === me) - Number(b === me) || (contacts[a]?.name ?? a).localeCompare(contacts[b]?.name ?? b))
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

  return (
    <div className="ci-anim-drop ci-absolute ci-left-3 ci-right-3 ci-top-16 ci-bottom-3 ci-z-30 ci-flex ci-flex-col ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-text-sm">
      <div className="ci-flex ci-items-center ci-justify-between ci-pl-4 ci-pr-2 ci-pt-2">
        <span className="ci-font-semibold">{t('Common.Group settings')}</span>
        <Button variant="small" onClick={onClose} aria-label={t('Common.Close')} title={t('Common.Close')}>
          {Icon.close}
        </Button>
      </div>
      {/* Picture and name */}
      <div className="ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-3">
        <input ref={picture} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then((avatar) => run({ avatar })).catch(() => setError(t('Group.Picture not readable')))} />
        <button type="button" title={t('Group.Change picture')} aria-label={t('Group.Change picture')} disabled={busy} onClick={() => picture.current?.click()} className="ci-relative ci-shrink-0 ci-rounded-full ci-border-0 ci-p-0 ci-bg-transparent ci-group">
          <GroupAvatar peer={conv.peer} name={conv.name ?? conv.peer} size={48} avatar={conv.avatar} />
          <span className="ci-absolute ci-inset-0 ci-rounded-full ci-bg-black/50 ci-text-white ci-hidden group-hover:ci-flex ci-items-center ci-justify-center">{Icon.camera}</span>
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && name.trim() !== conv.name && run({ name: name.trim() })}
          aria-label={t('Common.Group name')}
          className="ci-flex-1 ci-min-w-0 ci-h-9 ci-px-3 ci-rounded-full ci-border-0 ci-outline-none ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-900 dark:ci-text-white"
        />
        <Button variant="green" className="ci-w-auto ci-h-9 ci-px-4" disabled={busy} onClick={() => name.trim() && name.trim() !== conv.name && run({ name: name.trim() })}>
          {t('Group.Save')}
        </Button>
      </div>
      {error && <div className="ci-px-4 ci-pb-2 ci-text-xs ci-text-phoneIslandClose dark:ci-text-phoneIslandCloseDark">{error}</div>}
      {!guest && onShare && !adding && (
        // A group of mine, not yet open to people outside: a link lets them in, the members stay.
        <div className="ci-flex ci-flex-col ci-gap-1.5 ci-px-4 ci-pb-3">
          <span className="ci-text-xs ci-text-gray-500 dark:ci-text-gray-400">{t('Group.Share outside note')}</span>
          {sharing ? (
            <Confirm
              text={t('Group.Share outside confirm')}
              action={t('Group.Share')}
              busy={busy}
              onCancel={() => setSharing(false)}
              onConfirm={() => {
                setBusy(true)
                onShare()
                  .then(setGuest)
                  .catch((e) => setError((e as Error).message))
                  .finally(() => (setBusy(false), setSharing(false)))
              }}
            />
          ) : (
            <Button variant="small" className="ci-w-auto ci-px-2 ci-gap-1 ci-mr-auto" disabled={busy} onClick={() => setSharing(true)}>
              {Icon.link} {t('Group.Share outside')}
            </Button>
          )}
        </div>
      )}
      {guest && !adding && (() => {
        // The link only lets people in: closed (revoked or expired), who joined stays.
        const open = !guest.revoked && guest.expires * 1000 > Date.now()
        const relink = relinking ? (
          <Confirm
            text={t('Group.New link confirm')}
            action={t('Group.New link')}
            busy={busy}
            onCancel={() => setRelinking(false)}
            onConfirm={() => (onGuest ? onGuest('link') : onShare?.())?.then(setGuest).catch((e) => setError((e as Error).message)).finally(() => setRelinking(false))}
          />
        ) : (
          <Button variant="small" className="ci-w-auto ci-px-2 ci-gap-1 ci-mr-auto" disabled={busy} onClick={() => setRelinking(true)}>
            {Icon.link} {t('Group.New link')}
          </Button>
        )
        return (
          <div className="ci-flex ci-flex-col ci-gap-1.5 ci-px-4 ci-pb-3">
            <span className="ci-text-xs ci-font-medium ci-text-gray-500 dark:ci-text-gray-400">
              {t('Group.External link')}
              {open && ` · ${t('Group.Expires {{date}}', { date: new Date(guest.expires * 1000).toLocaleDateString() })}`}
            </span>
            {!open && <span className="ci-text-xs ci-text-gray-500 dark:ci-text-gray-400">{guest.revoked ? t('Group.Link revoked') : t('Group.Link expired')}</span>}
            {!guest.owner ? (
              <span className="ci-text-xs ci-text-gray-500 dark:ci-text-gray-400">{t('Group.Only who invited manages the link')}</span>
            ) : (
              <div className="ci-flex ci-items-center ci-gap-2">
                {/* Shown once, when made: the server keeps only its hash. A new one replaces it. */}
                {guest.link && open ? <SecretLink link={guest.link} /> : relink}
              </div>
            )}
            {guest.owner && open && (closing ? (
              // Private again: the link stops working; who joined stays, and a new link shares it again.
              <Confirm
                text={t('Group.Make private confirm')}
                action={t('Group.Make private')}
                busy={busy}
                onCancel={() => setClosing(false)}
                onConfirm={() => onGuest?.('revoke').then(setGuest).catch((e) => setError((e as Error).message)).finally(() => setClosing(false))}
              />
            ) : (
              <Button variant="small" className="ci-w-auto ci-px-2 ci-gap-1 ci-mr-auto" disabled={busy} onClick={() => setClosing(true)}>
                {Icon.lock} {t('Group.Make private')}
              </Button>
            ))}
          </div>
        )
      })()}
      <div className="ci-border-t ci-border-gray-300 dark:ci-border-gray-700" />
      {adding ? (
        // Operators to add: search, tick, add.
        <>
          <div className="ci-px-4 ci-pt-3 ci-pb-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Common.Search operators')} className="ci-w-full ci-h-9 ci-px-3 ci-rounded-full ci-border-0 ci-outline-none ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-900 dark:ci-text-white" />
          </div>
          <ul className="ci-flex-1 ci-overflow-y-auto ci-m-0 ci-p-0 ci-list-none">
            {candidates.length === 0 && <li className="ci-px-4 ci-py-4 ci-text-center ci-text-gray-500 dark:ci-text-gray-400">{t('Group.No operators to add')}</li>}
            {candidates.map((c) => {
              const on = picked.includes(c.username)
              return (
                <li key={c.username}>
                  <button type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.username) : [...p, c.username]))} className="ci-w-full ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-1.5 ci-border-0 ci-bg-transparent ci-text-left ci-text-inherit hover:ci-bg-gray-200 dark:hover:ci-bg-gray-700">
                    <Avatar contact={c} username={c.username} size={28} />
                    <span className="ci-flex-1 ci-truncate">{c.name}</span>
                    {/* As in New chat: the circled check when picked. */}
                    {on ? <span className="ci-flex ci-text-accent-700 dark:ci-text-accent-500">{Icon.circleCheck}</span> : <span className="ci-w-5 ci-h-5 ci-box-border ci-rounded-full ci-border ci-border-solid ci-border-gray-400 dark:ci-border-gray-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="ci-flex ci-justify-end ci-gap-2 ci-px-4 ci-py-3 ci-border-t ci-border-gray-300 dark:ci-border-gray-700">
            <Button variant="small" className="ci-w-auto ci-px-3" onClick={() => (setAdding(false), setPicked([]), setQ(''))}>
              {t('Common.Cancel')}
            </Button>
            <Button variant="green" className="ci-w-auto ci-h-9 ci-px-4" disabled={busy || !picked.length} onClick={() => run({ add: picked }, () => (setAdding(false), setPicked([]), setQ('')))}>
              {t('Group.Add')}{picked.length ? ` (${picked.length})` : ''}
            </Button>
          </div>
        </>
      ) : (
        // Members, each one removable but me.
        <>
          <div className="ci-flex ci-items-center ci-justify-between ci-pl-4 ci-pr-3 ci-pt-3 ci-pb-1">
            <span className="ci-text-xs ci-font-medium ci-text-gray-500 dark:ci-text-gray-400">{members.length} members</span>
            <Button variant="tertiary" className="ci-w-auto" disabled={busy} onClick={() => setAdding(true)}>
              {Icon.circlePlus} {t('Group.Add members')}
            </Button>
          </div>
          <ul className="ci-flex-1 ci-overflow-y-auto ci-m-0 ci-p-0 ci-list-none">
            {members.map((u) => (
              <li key={u} className="ci-flex ci-items-center ci-gap-3 ci-pl-4 ci-pr-2 ci-py-1.5">
                <Avatar contact={isGuest(u) ? { username: u, name: guests[u] ?? u } : contacts[u]} username={u} size={28} />
                <span className="ci-flex-1 ci-truncate">{nameOf(u)}</span>
                {u === me ? (
                  <span className="ci-pr-2 ci-text-xs ci-text-gray-500 dark:ci-text-gray-400">{t('Group.Owner')}</span>
                ) : isGuest(u) && !guest?.owner ? (
                  <span className="ci-pr-2 ci-text-xs ci-text-gray-500 dark:ci-text-gray-400">{t('Group.External')}</span>
                ) : isGuest(u) && removing === u ? (
                  <>
                    <button type="button" className={pillCancel} onClick={() => setRemoving(null)}>
                      {t('Common.Cancel')}
                    </button>
                    <button type="button" className={pillDanger} disabled={busy} onClick={() => onGuest?.('remove', u).then((g) => (setGuest(g), setRemoving(null))).catch((e) => setError((e as Error).message))}>
                      {t('Common.Remove')}
                    </button>
                  </>
                ) : removing === u ? (
                  <>
                    <button type="button" className={pillCancel} onClick={() => setRemoving(null)}>
                      {t('Common.Cancel')}
                    </button>
                    <button type="button" className={pillDanger} disabled={busy} onClick={() => run({ remove: u }, () => setRemoving(null))}>
                      {t('Common.Remove')}
                    </button>
                  </>
                ) : (
                  <Button variant="small" aria-label={t('Common.Remove {{name}}', { name: nameOf(u) })} title={t('Group.Remove from the group')} disabled={busy} onClick={() => setRemoving(u)}>
                    {Icon.close}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
