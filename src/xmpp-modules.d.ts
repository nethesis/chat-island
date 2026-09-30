// Minimal typings for the parts of @xmpp/client and ltx elements the island uses.
declare module '@xmpp/xml' {
  export interface Element {
    name: string
    attrs: Record<string, string>
    children: (Element | string)[]
    is(name: string, xmlns?: string): boolean
    getChild(name: string, xmlns?: string): Element | undefined
    getChildText(name: string, xmlns?: string): string | null
    getChildren(name: string, xmlns?: string): Element[]
    getChildByAttr(attr: string, value: string, xmlns?: string, recursive?: boolean): Element | undefined
    text(): string
  }
  export default function xml(name: string, attrs?: Record<string, string>, ...children: (Element | string)[]): Element
}
declare module '@xmpp/client' {
  import type { Element } from '@xmpp/xml'
  export interface Client {
    start(): Promise<unknown>
    stop(): Promise<unknown>
    send(stanza: Element): Promise<void>
    on(event: 'stanza', handler: (stanza: Element) => void): this
    on(event: 'status', handler: (status: string) => void): this
    on(event: 'error', handler: (err: Error) => void): this
    on(event: 'online' | 'offline', handler: () => void): this
    iqCaller: { request(stanza: Element, timeout?: number): Promise<Element> }
  }
  export function client(options: { service: string; domain: string; username: string; password: string; resource?: string }): Client
  export function xml(name: string, attrs?: Record<string, string>, ...children: (Element | string)[]): Element
}
