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

/** A group: its initials on the island's accent colour, so it never looks like a person. */
export function GroupAvatar({ name, size = 40, avatar }: { name: string; size?: number; avatar?: string }) {
  const style = { width: size, height: size, fontSize: size / 2.8 }
  if (avatar) return <img src={avatar} alt={name} style={style} draggable={false} className="ci-rounded-full ci-object-cover ci-shrink-0" />
  return (
    <div style={style} className="ci-rounded-full ci-shrink-0 ci-flex ci-items-center ci-justify-center ci-font-medium ci-bg-iconSecondary dark:ci-bg-iconSecondaryDark ci-text-white">
      {initials(name || 'G')}
    </div>
  )
}
