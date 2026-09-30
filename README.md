# chat-island

NethVoice chat widget (XMPP) for nethvoice-cti, NethLink and any web page.

```tsx
import { ChatIsland } from '@nethesis/chat-island'
import '@nethesis/chat-island/dist/index.css'

<ChatIsland dataConfig={btoa(`${ctiHost}:${username}:${jwt}`)} serviceWorker="/chat-island-sw.js" />
```

Serve `dist/chat-island-sw.js` from the host for notifications with the tab closed.

## Events

| Event | Direction | Detail |
| --- | --- | --- |
| `chat-island-open` | in | `{ username }` colleague or group address |
| `chat-island-close` | in | |
| `chat-island-new` | in | open the new chat panel |
| `chat-island-delete` | in | `{ username }` purge a conversation, leave or destroy a group |
| `chat-island-contacts` | in | `{ contacts }` names, avatars, presence, number |
| `chat-island-conversations-request` | in | ask for the list |
| `chat-island-conversations` | out | `{ conversations }` newest first |
| `chat-island-unread` | out | `{ total }` |
| `chat-island-message` | out | every new message |
| `chat-island-status` | out | `{ status }` connecting, online, offline, error, unauthorized |
| `chat-island-error` | out | `{ scope, message }` |
| `chat-island-push` | out | `{ enabled }` |
| `chat-island-call` | out | `{ username, number }` |
| `chat-island-notify` | out | `{ peer, name, body }` message not in view |

## Develop

```sh
npm install
npm run dev
npm run build && npm run build:widget
```

A tag publishes the package to npm.
