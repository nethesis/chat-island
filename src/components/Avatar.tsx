import type { Contact } from '../types'

/** Initials on the phone-island neutral grays: the picture, when the CTI has one, wins. */
// Words are letters and digits: "Coda - Assistenza" is CA, not C-.
const initials = (name: string) =>
  name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

export function Avatar({ contact, username, size = 40 }: { contact?: Contact; username: string; size?: number }) {
  const name = contact?.name || username
  const style = { width: size, height: size, fontSize: size / 2.6 }
  return contact?.avatar ? (
    <img src={contact.avatar} alt={name} style={style} draggable={false} className="ci-rounded-full ci-object-cover ci-shrink-0" />
  ) : (
    <div style={style} className="ci-rounded-full ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-font-medium ci-bg-gray-700 ci-text-gray-50 dark:ci-bg-gray-300 dark:ci-text-gray-900">
      {initials(name)}
    </div>
  )
}

/** Green: connected to the chat. Red: the CTI says busy or do-not-disturb. Green as well when only the mobile app is registered: the text says Mobile. Grey: not reachable. */
export function PresenceDot({ online, presence, mobile }: { online?: boolean; presence?: string; mobile?: boolean }) {
  // As in the CTI: DND black (a light ring in the dark theme), busy or ringing red.
  const color = presence === 'dnd' ? 'ci-bg-gray-950 dark:ci-ring-gray-50' : ['busy', 'ringing', 'incoming'].includes(presence ?? '') ? 'ci-bg-phoneIslandClose dark:ci-bg-phoneIslandCloseDark dark:ci-ring-gray-950' : online || mobile ? 'ci-bg-phoneIslandCall dark:ci-bg-phoneIslandCallDark dark:ci-ring-gray-950' : 'ci-bg-gray-400 dark:ci-bg-gray-600 dark:ci-ring-gray-950'
  return <span className={`ci-absolute ci-bottom-0 ci-right-0 ci-w-3 ci-h-3 ci-rounded-full ci-ring-2 ci-ring-gray-50 ${color}`} />
}

// Font Awesome user-group (the CTI's group badges) and users (its Queues page).
const GROUP_ICON = { box: '0 0 576 512', d: 'M64 128a112 112 0 1 1 224 0 112 112 0 1 1 -224 0zM0 464c0-97.2 78.8-176 176-176s176 78.8 176 176l0 6c0 23.2-18.8 42-42 42L42 512c-23.2 0-42-18.8-42-42l0-6zM432 64a96 96 0 1 1 0 192 96 96 0 1 1 0-192zm0 240c79.5 0 144 64.5 144 144l0 22.4c0 23-18.6 41.6-41.6 41.6l-144.8 0c6.6-12.5 10.4-26.8 10.4-42l0-6c0-51.5-17.4-98.9-46.5-136.7 22.6-14.7 49.6-23.3 78.5-23.3z' }
const QUEUE_ICON = { box: '0 0 640 512', d: 'M320 16a104 104 0 1 1 0 208 104 104 0 1 1 0-208zM96 88a72 72 0 1 1 0 144 72 72 0 1 1 0-144zM0 416c0-70.7 57.3-128 128-128 12.8 0 25.2 1.9 36.9 5.4-32.9 36.8-52.9 85.4-52.9 138.6l0 16c0 11.4 2.4 22.2 6.7 32L32 480c-17.7 0-32-14.3-32-32l0-32zm521.3 64c4.3-9.8 6.7-20.6 6.7-32l0-16c0-53.2-20-101.8-52.9-138.6 11.7-3.5 24.1-5.4 36.9-5.4 70.7 0 128 57.3 128 128l0 32c0 17.7-14.3 32-32 32l-86.7 0zM472 160a72 72 0 1 1 144 0 72 72 0 1 1 -144 0zM160 432c0-88.4 71.6-160 160-160s160 71.6 160 160l0 16c0 17.7-14.3 32-32 32l-256 0c-17.7 0-32-14.3-32-32l0-16z' }
const BLUE = 'ci-bg-blue-100 ci-text-blue-800 dark:ci-bg-blue-700 dark:ci-text-blue-100'
const PURPLE = 'ci-bg-iconSecondary dark:ci-bg-iconSecondaryDark ci-text-white'
const QUEUE_PREFIX = 'Queue - '

/** A group: a CTI operator group (cti-…) in the CTI's group badge blue, a queue's chat ("Queue - …") with the Queues icon, any other group on the island's purple.
 *  head: a chat head, where groups side by side must differ: its initials (two letters of a one-word name), the icon small in the corner. */
export function GroupAvatar({ peer = '', name, size = 40, avatar, head = false }: { peer?: string; name: string; size?: number; avatar?: string; head?: boolean }) {
  const style = { width: size, height: size, fontSize: size / 2.8 }
  const queue = name.startsWith(QUEUE_PREFIX)
  const color = peer.startsWith('cti-') ? BLUE : PURPLE
  const icon = queue ? QUEUE_ICON : GROUP_ICON
  const words = (queue ? name.slice(QUEUE_PREFIX.length) : name).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const face = avatar ? (
    <img src={avatar} alt={name} style={style} draggable={false} className="ci-rounded-full ci-object-cover ci-shrink-0" />
  ) : head ? (
    <div role="img" aria-label={name} style={style} className={`ci-rounded-full ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-font-medium ${color}`}>
      {words.length === 1 ? words[0].slice(0, 2).toUpperCase() : initials(words.join(' ') || 'G')}
    </div>
  ) : (
    <div role="img" aria-label={name} style={style} className={`ci-rounded-full ci-shrink-0 ci-flex ci-items-center ci-justify-center ${color}`}>
      <svg width={size * 0.45} height={size * 0.4} viewBox={icon.box} fill="currentColor" aria-hidden="true"><path d={icon.d} /></svg>
    </div>
  )
  if (!head) return face
  return (
    <span className="ci-relative ci-block">
      {face}
      <span className={`ci-absolute ci--bottom-0.5 ci--right-0.5 ci-w-4 ci-h-4 ci-rounded-full ci-flex ci-items-center ci-justify-center ci-ring-2 ci-ring-gray-50 dark:ci-ring-gray-950 ${color}`}>
        <svg width="10" height="9" viewBox={icon.box} fill="currentColor" aria-hidden="true"><path d={icon.d} /></svg>
      </span>
    </span>
  )
}
