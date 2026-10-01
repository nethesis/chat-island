// Host side of the Chat Island widget: mount it with a token, send commands, log its events.
const WIDGET = 'https://cdn.jsdelivr.net/npm/@nethesis/chat-island@latest/dist-widget/index.widget.js'
const send = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }))
const log = (line) => (document.getElementById('log').textContent = `${new Date().toLocaleTimeString()} ${line}\n` + document.getElementById('log').textContent)

// The widget mounts on the .chat-island elements present when its script runs.
document.getElementById('connect').addEventListener('click', () => {
  if (document.querySelector('.chat-island')) return log('already connected: reload to change token')
  const div = document.createElement('div')
  div.className = 'chat-island'
  div.dataset.config = document.getElementById('token').value.trim()
  document.body.appendChild(div)
  const script = document.createElement('script')
  script.src = WIDGET
  document.body.appendChild(script)
})

document.getElementById('new').addEventListener('click', () => send('chat-island-new'))
document.getElementById('open').addEventListener('click', () => send('chat-island-open', { username: document.getElementById('peer').value.trim() }))
let dark = false
document.getElementById('theme').addEventListener('click', () => send('chat-island-theme-change', { theme: (dark = !dark) ? 'dark' : 'light' }))

for (const name of ['chat-island-status', 'chat-island-unread', 'chat-island-notify', 'chat-island-call', 'chat-island-error', 'chat-island-push']) {
  window.addEventListener(name, (e) => log(`${name} ${JSON.stringify(e.detail)}`))
}
