import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import names from '../emoji-names'
import { Icon } from './Button'

/** Dependency-free emoji picker by category, for the composer and reactions. */
const CATEGORIES: { label: string; icon: string; emojis: string }[] = [
  {
    label: 'Emoji.Smileys',
    icon: '😀',
    emojis:
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖',
  },
  {
    label: 'Emoji.Gestures',
    icon: '👍',
    emojis: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 👀 🧠 🙋 🙆 🙅 🤷 🤦 🙇',
  },
  {
    label: 'Emoji.Hearts and symbols',
    icon: '❤️',
    emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ✅ ❌ ⚠️ ❓ ❗ ➕ ➖ 🆗 🆕 🔴 🟢 🟡 🔵',
  },
  {
    label: 'Emoji.Celebrations',
    icon: '🎉',
    emojis: '🎉 🎊 🎈 🎁 🎂 🍰 🥂 🍾 🍻 🍺 🍷 🏆 🥇 🥈 🥉 🏅 🎯 🎮 ⚽ 🏀 🎾 🚴 🏃 🎵 🎶 📸 🎬',
  },
  {
    label: 'Emoji.Work',
    icon: '💼',
    emojis: '💼 📞 ☎️ 📱 💻 🖥️ ⌨️ 🖨️ 📧 📨 📩 📅 📆 🗓️ 📌 📍 📎 ✂️ 📝 ✏️ 📁 📂 🗂️ 📊 📈 📉 🔒 🔓 🔑 🔧 🛠️ ⚙️ 💡 🔋 ⏰ ⏳ ⌛ 🧾 💶 💰',
  },
  {
    label: 'Emoji.Food and places',
    icon: '☕',
    emojis: '☕ 🍵 🥤 🍕 🍔 🍟 🌭 🥪 🌮 🍝 🍣 🍩 🍪 🍫 🍎 🍌 🍓 🥐 🚗 🚕 🚌 🚆 ✈️ 🚀 🏠 🏢 🏖️ 🌍 ☀️ 🌤️ 🌧️ ⛈️ ❄️ ⚡ 🌈 🌙',
  },
]

// Accents aside, so "felicita" finds "felicità".
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const ALL = [...new Set(CATEGORIES.flatMap((c) => c.emojis.split(' ')))].map((e) => ({ e, words: fold(names[e] ?? '') }))

/** Emojis whose English or Italian names hold every word typed, those with a word starting by it first. */
function find(query: string) {
  const q = fold(query).split(/\s+/).filter(Boolean)
  const hits = ALL.filter((x) => q.every((w) => x.words.includes(w)))
  const starts = (x: (typeof ALL)[number]) => x.words.split('|').some((n) => n.split(' ').some((p) => p.startsWith(q[0])))
  return [...hits.filter(starts), ...hits.filter((x) => !starts(x))].map((x) => x.e)
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export function EmojiPicker({ onPick, onClose, className = '' }: { onPick: (emoji: string) => void; onClose: () => void; className?: string }) {
  const [tab, setTab] = useState(0)
  const [query, setQuery] = useState('')
  const shown = query.trim() ? find(query) : CATEGORIES[tab].emojis.split(' ')
  const box = useRef<HTMLDivElement>(null)

  // A click elsewhere, or Escape, closes it.
  useEffect(() => {
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', esc, true)
    }
  }, [onClose])

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={t('Common.Emoji')}
      className={`ci-z-30 ci-w-[21rem] ci-max-w-full ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600 ci-select-none ${className}`}
    >
      <div className="ci-flex ci-items-center ci-gap-2 ci-mx-2 ci-mt-2 ci-px-3 ci-h-9 ci-rounded-full ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-border ci-border-solid ci-border-gray-200 dark:ci-border-gray-700 focus-within:ci-ring-2 focus-within:ci-ring-gray-400 dark:focus-within:ci-ring-gray-500 ci-text-gray-500 dark:ci-text-gray-400">
        {Icon.search}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter takes the first match.
          onKeyDown={(e) => e.key === 'Enter' && shown[0] && query.trim() && (e.preventDefault(), onPick(shown[0]))}
          placeholder={t('Emoji.Search emojis')}
          aria-label={t('Emoji.Search emojis')}
          className="ci-flex-1 ci-min-w-0 ci-bg-transparent ci-border-0 ci-outline-none ci-text-sm ci-text-gray-900 dark:ci-text-white"
        />
      </div>
      <div className="ci-flex ci-gap-1 ci-px-2 ci-pt-2 ci-border-b ci-border-gray-300 dark:ci-border-gray-700">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.label}
            type="button"
            title={t(c.label)}
            aria-label={t(c.label)}
            onClick={() => (setTab(i), setQuery(''))}
            style={{ fontSize: 20, lineHeight: '28px' }}
            className={`ci-flex-1 ci-pb-1.5 ci-border-0 ci-bg-transparent ci-border-b-2 ci-border-solid ${i === tab && !query.trim() ? 'ci-border-iconSecondary dark:ci-border-iconSecondaryDark' : 'ci-border-transparent ci-opacity-60 hover:ci-opacity-100'}`}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="ci-grid ci-grid-cols-7 ci-content-start ci-gap-1 ci-p-2 ci-h-64 ci-overflow-y-auto">
        {!shown.length && <p className="ci-col-span-7 ci-m-0 ci-py-6 ci-text-center ci-text-sm ci-text-gray-500 dark:ci-text-gray-400">{t('Chat.No results')}</p>}
        {shown.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            title={query.trim() ? names[e]?.split('|')[0] : undefined}
            style={{ fontSize: 26, lineHeight: '36px' }}
            className="ci-h-10 ci-w-10 ci-flex ci-items-center ci-justify-center ci-rounded-lg ci-border-0 ci-bg-transparent hover:ci-bg-gray-200 dark:hover:ci-bg-gray-800"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
