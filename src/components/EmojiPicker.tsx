import { useEffect, useRef, useState } from 'react'

/** Dependency-free emoji picker by category, for the composer and reactions. */
const CATEGORIES: { label: string; icon: string; emojis: string }[] = [
  {
    label: 'Smileys',
    icon: '😀',
    emojis:
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖',
  },
  {
    label: 'Gestures',
    icon: '👍',
    emojis: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 👀 🧠 🙋 🙆 🙅 🤷 🤦 🙇',
  },
  {
    label: 'Hearts and symbols',
    icon: '❤️',
    emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ✅ ❌ ⚠️ ❓ ❗ ➕ ➖ 🆗 🆕 🔴 🟢 🟡 🔵',
  },
  {
    label: 'Celebrations',
    icon: '🎉',
    emojis: '🎉 🎊 🎈 🎁 🎂 🍰 🥂 🍾 🍻 🍺 🍷 🏆 🥇 🥈 🥉 🏅 🎯 🎮 ⚽ 🏀 🎾 🚴 🏃 🎵 🎶 📸 🎬',
  },
  {
    label: 'Work',
    icon: '💼',
    emojis: '💼 📞 ☎️ 📱 💻 🖥️ ⌨️ 🖨️ 📧 📨 📩 📅 📆 🗓️ 📌 📍 📎 ✂️ 📝 ✏️ 📁 📂 🗂️ 📊 📈 📉 🔒 🔓 🔑 🔧 🛠️ ⚙️ 💡 🔋 ⏰ ⏳ ⌛ 🧾 💶 💰',
  },
  {
    label: 'Food and places',
    icon: '☕',
    emojis: '☕ 🍵 🥤 🍕 🍔 🍟 🌭 🥪 🌮 🍝 🍣 🍩 🍪 🍫 🍎 🍌 🍓 🥐 🚗 🚕 🚌 🚆 ✈️ 🚀 🏠 🏢 🏖️ 🌍 ☀️ 🌤️ 🌧️ ⛈️ ❄️ ⚡ 🌈 🌙',
  },
]

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export function EmojiPicker({ onPick, onClose, className = '' }: { onPick: (emoji: string) => void; onClose: () => void; className?: string }) {
  const [tab, setTab] = useState(0)
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
      aria-label="Emoji"
      className={`ci-z-30 ci-w-[21rem] ci-max-w-full ci-rounded-2xl ci-bg-gray-50 dark:ci-bg-gray-950 ci-shadow-2xl ci-ring-1 ci-ring-gray-300 dark:ci-ring-gray-700 ci-select-none ${className}`}
    >
      <div className="ci-flex ci-gap-1 ci-px-2 ci-pt-2 ci-border-b ci-border-gray-300 dark:ci-border-gray-700">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.label}
            type="button"
            title={c.label}
            aria-label={c.label}
            onClick={() => setTab(i)}
            style={{ fontSize: 20, lineHeight: '28px' }}
            className={`ci-flex-1 ci-pb-1.5 ci-border-0 ci-bg-transparent ci-border-b-2 ci-border-solid ${i === tab ? 'ci-border-iconSecondary dark:ci-border-iconSecondaryDark' : 'ci-border-transparent ci-opacity-60 hover:ci-opacity-100'}`}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="ci-grid ci-grid-cols-7 ci-gap-1 ci-p-2 ci-h-64 ci-overflow-y-auto">
        {CATEGORIES[tab].emojis.split(' ').map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
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
