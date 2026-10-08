import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import type { Conversation } from '../types'
import { Avatar, GroupAvatar } from './Avatar'
import { Button, Icon } from './Button'
import { shrink } from './NewChat'

type Change = { add?: string[]; remove?: string; name?: string; avatar?: string }

/** The owner's panel for a group: picture, name, members in and out. */
export function GroupSettings({ conv, onEdit, onClose }: { conv: Conversation; onEdit: (change: Change) => Promise<void>; onClose: () => void }) {
  const { contacts, inactive, me } = useStore(useShallow((s) => ({ contacts: s.contacts, inactive: s.inactive, me: s.me })))
  const [name, setName] = useState(conv.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<string | null>(null) // asked to confirm
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const picture = useRef<HTMLInputElement>(null)
  const members = [...(conv.members ?? [])].sort((a, b) => Number(a === me) - Number(b === me) || (contacts[a]?.name ?? a).localeCompare(contacts[b]?.name ?? b))
  const nameOf = (u: string) => (u === me ? 'You' : contacts[u]?.name ?? inactive[u] ?? u)
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
      setError((e as Error).message || 'Not saved')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ci-anim-drop ci-absolute ci-left-3 ci-right-3 ci-top-16 ci-bottom-3 ci-z-30 ci-flex ci-flex-col ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-text-sm">
      <div className="ci-flex ci-items-center ci-justify-between ci-pl-4 ci-pr-2 ci-pt-2">
        <span className="ci-font-semibold">Group settings</span>
        <Button variant="small" onClick={onClose} aria-label="Close" title="Close">
          {Icon.close}
        </Button>
      </div>
      {/* Picture and name */}
      <div className="ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-3">
        <input ref={picture} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && shrink(e.target.files[0]).then((avatar) => run({ avatar })).catch(() => setError('Picture not readable'))} />
        <button type="button" title="Change picture" aria-label="Change picture" disabled={busy} onClick={() => picture.current?.click()} className="ci-relative ci-shrink-0 ci-rounded-full ci-border-0 ci-p-0 ci-bg-transparent ci-group">
          <GroupAvatar peer={conv.peer} name={conv.name ?? conv.peer} size={48} avatar={conv.avatar} />
          <span className="ci-absolute ci-inset-0 ci-rounded-full ci-bg-black/50 ci-text-white ci-hidden group-hover:ci-flex ci-items-center ci-justify-center">{Icon.camera}</span>
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && name.trim() !== conv.name && run({ name: name.trim() })}
          aria-label="Group name"
          className="ci-flex-1 ci-min-w-0 ci-h-9 ci-px-3 ci-rounded-full ci-border-0 ci-outline-none ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-900 dark:ci-text-white"
        />
        <Button variant="green" className="ci-w-auto ci-h-9 ci-px-4" disabled={busy || !name.trim() || name.trim() === conv.name} onClick={() => run({ name: name.trim() })}>
          Save
        </Button>
      </div>
      {error && <div className="ci-px-4 ci-pb-2 ci-text-xs ci-text-phoneIslandClose dark:ci-text-phoneIslandCloseDark">{error}</div>}
      <div className="ci-border-t ci-border-gray-300 dark:ci-border-gray-700" />
      {adding ? (
        // Operators to add: search, tick, add.
        <>
          <div className="ci-px-4 ci-pt-3 ci-pb-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search operators" className="ci-w-full ci-h-9 ci-px-3 ci-rounded-full ci-border-0 ci-outline-none ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-text-gray-900 dark:ci-text-white" />
          </div>
          <ul className="ci-flex-1 ci-overflow-y-auto ci-m-0 ci-p-0 ci-list-none">
            {candidates.length === 0 && <li className="ci-px-4 ci-py-4 ci-text-center ci-text-gray-500 dark:ci-text-gray-400">No operators to add</li>}
            {candidates.map((c) => {
              const on = picked.includes(c.username)
              return (
                <li key={c.username}>
                  <button type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.username) : [...p, c.username]))} className="ci-w-full ci-flex ci-items-center ci-gap-3 ci-px-4 ci-py-1.5 ci-border-0 ci-bg-transparent ci-text-left ci-text-inherit hover:ci-bg-gray-200 dark:hover:ci-bg-gray-700">
                    <Avatar contact={c} username={c.username} size={28} />
                    <span className="ci-flex-1 ci-truncate">{c.name}</span>
                    <span className={`ci-w-5 ci-h-5 ci-rounded-full ci-border ci-flex ci-items-center ci-justify-center ${on ? 'ci-bg-phoneIslandCall dark:ci-bg-phoneIslandCallDark ci-border-transparent ci-text-white dark:ci-text-gray-950' : 'ci-border-gray-400 dark:ci-border-gray-600'}`}>{on && Icon.check}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="ci-flex ci-justify-end ci-gap-2 ci-px-4 ci-py-3 ci-border-t ci-border-gray-300 dark:ci-border-gray-700">
            <Button variant="small" className="ci-w-auto ci-px-3" onClick={() => (setAdding(false), setPicked([]), setQ(''))}>
              Cancel
            </Button>
            <Button variant="green" className="ci-w-auto ci-h-9 ci-px-4" disabled={busy || !picked.length} onClick={() => run({ add: picked }, () => (setAdding(false), setPicked([]), setQ('')))}>
              Add{picked.length ? ` (${picked.length})` : ''}
            </Button>
          </div>
        </>
      ) : (
        // Members, each one removable but me.
        <>
          <div className="ci-flex ci-items-center ci-justify-between ci-pl-4 ci-pr-3 ci-pt-3 ci-pb-1">
            <span className="ci-text-xs ci-font-medium ci-text-gray-500 dark:ci-text-gray-400">{members.length} members</span>
            <Button variant="small" className="ci-w-auto ci-px-2 ci-gap-1" disabled={busy} onClick={() => setAdding(true)}>
              {Icon.plus} Add members
            </Button>
          </div>
          <ul className="ci-flex-1 ci-overflow-y-auto ci-m-0 ci-p-0 ci-list-none">
            {members.map((u) => (
              <li key={u} className="ci-flex ci-items-center ci-gap-3 ci-pl-4 ci-pr-2 ci-py-1.5">
                <Avatar contact={contacts[u]} username={u} size={28} />
                <span className="ci-flex-1 ci-truncate">{nameOf(u)}</span>
                {u === me ? (
                  <span className="ci-pr-2 ci-text-xs ci-text-gray-500 dark:ci-text-gray-400">Owner</span>
                ) : removing === u ? (
                  <>
                    <Button variant="small" className="ci-w-auto ci-px-2" onClick={() => setRemoving(null)}>
                      Cancel
                    </Button>
                    <Button variant="red" className="ci-w-auto ci-h-8 ci-px-3" disabled={busy} onClick={() => run({ remove: u }, () => setRemoving(null))}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button variant="small" aria-label={`Remove ${nameOf(u)}`} title="Remove from the group" disabled={busy} onClick={() => setRemoving(u)}>
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
