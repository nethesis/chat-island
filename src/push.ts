// Web Push for closed tabs: subscribe with the gateway's VAPID key, enable the returned node (XEP-0357).
import type { Config } from './types'

const urlB64ToUint8Array = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

let listening = false
/** The service worker tells the page which conversation was clicked: one listener per page, however often push is registered. */
function listenToWorker() {
  if (listening) return
  listening = true
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'chat-island-open' && typeof e.data.username === 'string') window.dispatchEvent(new CustomEvent('chat-island-open', { detail: { username: e.data.username } }))
  })
}

/** Returns the push node to enable on XMPP, or null when push is unavailable or denied. */
export async function registerWebPush(cfg: Config, serviceWorkerUrl: string): Promise<{ node: string; service: string } | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('push not supported by this browser')
  if (Notification.permission === 'denied') return null
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return null
  const base = `https://${cfg.host}/chat-gw`
  const vr = await fetch(`${base}/push/vapid`)
  if (!vr.ok) throw new Error(`vapid: HTTP ${vr.status}`)
  const vapid = await vr.json()
  const reg = await navigator.serviceWorker.register(serviceWorkerUrl)
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapid.publicKey) }))
  // Register on every connection: the gateway keeps one node per endpoint, and a
  // subscription the push service has dropped gets re-created this way.
  const r = await fetch(`${base}/push/web`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` }, body: JSON.stringify(sub.toJSON()) })
  if (!r.ok) throw new Error(`push/web: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`)
  const out = await r.json()
  listenToWorker()
  return { node: out.node, service: out.service }
}
