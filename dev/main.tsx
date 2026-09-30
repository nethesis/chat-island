import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatIsland } from '../src'

const log = document.getElementById('log')!
for (const name of ['chat-island-status', 'chat-island-unread', 'chat-island-message', 'chat-island-error', 'chat-island-push', 'chat-island-conversations']) {
  window.addEventListener(name, (e) => {
    log.textContent = `${new Date().toLocaleTimeString()} ${name} ${JSON.stringify((e as CustomEvent).detail)}\n` + log.textContent
  })
}

const form = document.getElementById('f') as HTMLFormElement
const saved = JSON.parse(localStorage.getItem('chat-island-dev') || '{}')
for (const k of ['host', 'username', 'token']) if (saved[k]) (form.elements.namedItem(k) as HTMLInputElement).value = saved[k]

// One React root: mounting twice (auto-mount from localStorage, then the button) must not create two islands.
const root = createRoot(document.getElementById('island')!)
async function mount(host: string, username: string, token: string) {
  localStorage.setItem('chat-island-dev', JSON.stringify({ host, username, token }))
  root.render(
    <React.StrictMode>
      <ChatIsland dataConfig={btoa(`${host}:${username}:${token}`)} serviceWorker="/chat-island-sw.js" />
    </React.StrictMode>,
  )
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const d = new FormData(form)
  const host = String(d.get('host')), username = String(d.get('username'))
  let token = String(d.get('token') || '')
  if (!token) {
    const r = await fetch(`https://${host}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: d.get('password') }) })
    if (!r.ok) return alert(`login failed: HTTP ${r.status}`)
    token = (await r.json()).token
  }
  mount(host, username, token)
})
if (saved.token) mount(saved.host, saved.username, saved.token)

// Host -> island: open a conversation by username, the way nethvoice-cti will from an operator card.
document.getElementById('new')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('chat-island-new')))
const openForm = document.getElementById('open') as HTMLFormElement
openForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const username = String(new FormData(openForm).get('peer') || '').trim()
  if (username) window.dispatchEvent(new CustomEvent('chat-island-open', { detail: { username } }))
})
