// Host <-> island window CustomEvents, like phone-island; the list is in README.md.
import type { Contact, ConversationSummary, Message, Status } from './types'

export function emit(name: 'chat-island-unread', detail: { total: number }): void
export function emit(name: 'chat-island-message', detail: Message & { peer: string }): void
export function emit(name: 'chat-island-status', detail: { status: Status; error?: string }): void
export function emit(name: 'chat-island-error', detail: { scope: string; message: string }): void
export function emit(name: 'chat-island-push', detail: { enabled: boolean }): void
export function emit(name: 'chat-island-conversations', detail: { conversations: ConversationSummary[] }): void
export function emit(name: 'chat-island-call', detail: { username: string; number: string }): void
export function emit(
  name: 'chat-island-notify',
  detail: { peer: string; name: string; body: string; kind: 'chat' | 'group'; author: string; text: string; attachment: boolean; avatar?: string; ts: number },
): void
export function emit(name: 'chat-island-theme-change', detail: { theme: 'light' | 'dark' | 'system' }): void
export function emit(name: 'chat-island-pin', detail: { pinned: boolean }): void
export function emit(name: 'chat-island-window', detail: { open: string | null; picker: boolean }): void
export function emit(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function listen<T>(name: string, handler: (detail: T) => void): () => void {
  const h = (e: Event) => handler((e as CustomEvent<T>).detail)
  window.addEventListener(name, h)
  return () => window.removeEventListener(name, h)
}

export type ContactsEvent = { contacts: Contact[] }
