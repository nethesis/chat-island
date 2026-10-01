# NethVoice Chat Island

A fully standalone chat component for NethVoice: one-to-one and group chats, attachments, voice notes, reactions, replies and notifications.

It runs in [NethVoice CTI](https://github.com/nethesis/nethvoice-cti), in [NethLink](https://github.com/NethServer/nethlink) and in any web page, and talks to the per-tenant XMPP server of [ns8-nethvoice](https://github.com/nethesis/ns8-nethvoice) with the user's CTI token.

**[Try the live demo](https://nethesis.github.io/chat-island/)**

## Builds

Available as component on `npm`

[![npm](https://img.shields.io/npm/dw/@nethesis/chat-island?label=npm&color=red&style=for-the-badge)](https://www.npmjs.com/package/@nethesis/chat-island)

Available as widget on `jsDelivr`

[![jsdelivr-js](https://img.shields.io/jsdelivr/npm/hw/@nethesis/chat-island?label=jsdelivr-js&style=for-the-badge)](https://cdn.jsdelivr.net/npm/@nethesis/chat-island@latest/dist-widget/index.widget.js)
[![jsdelivr-css](https://img.shields.io/jsdelivr/npm/hw/@nethesis/chat-island?label=jsdelivr-css&color=blue&style=for-the-badge)](https://cdn.jsdelivr.net/npm/@nethesis/chat-island@latest/dist-widget/index.widget.css)

## Use it as a React component

```sh
npm install @nethesis/chat-island
```

```tsx
import { ChatIsland } from '@nethesis/chat-island'
import '@nethesis/chat-island/dist/index.css'

<ChatIsland dataConfig={btoa(`${ctiHost}:${username}:${ctiToken}`)} serviceWorker="/chat-island-sw.js" />
```

| Prop | Default | |
| --- | --- | --- |
| `dataConfig` | | Base64 of `<cti_host>:<cti_username>:<cti_token>` |
| `theme` | host's `dark` class | `light`, `dark` or `system` |
| `position` | `bottom-right` | or `bottom-left` |
| `serviceWorker` | | URL of `chat-island-sw.js` on the host: notifications with the tab closed |
| `notifications` | `click` | `auto` asks for permission once online |
| `newChatButton` | `true` | `false` when the host has its own list |
| `maxHeads` | `5` | chat heads kept in the dock |
| `sound` | `true` | chime for a message not in view |
| `drag` / `onDragStart` | `true` | off, or the host moves its own window (NethLink) |

`contactsFromOperators(operators, avatars, me)` turns the CTI operators into the contacts the island takes with `chat-island-contacts`.

## Integrate in any template

The widget works in any HTML page, CMS or server-rendered application, without React. You need:

1. the CDN CSS file;
2. the CDN JavaScript bundle;
3. an element with class `chat-island` and a Base64 config token in `data-config`;
4. optionally, a script of yours that sends commands and listens to the island's browser events.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@nethesis/chat-island@latest/dist-widget/index.widget.css" />
  </head>
  <body>
    <div class="chat-island" data-config="YOUR_BASE64_CONFIG_TOKEN" data-theme="system"></div>

    <script src="https://cdn.jsdelivr.net/npm/@nethesis/chat-island@latest/dist-widget/index.widget.js"></script>
    <script>
      window.addEventListener('chat-island-unread', (e) => (document.title = `(${e.detail.total}) My page`))
      // open the chat with an operator
      window.dispatchEvent(new CustomEvent('chat-island-open', { detail: { username: 'mario' } }))
    </script>
  </body>
</html>
```

The widget mounts on the `.chat-island` elements present when its script runs. Attributes:

| Attribute | |
| --- | --- |
| `data-config` | Base64 config token (required) |
| `data-theme` | `light`, `dark` or `system` |
| `data-position` | `bottom-right` or `bottom-left` |
| `data-service-worker` | URL of `chat-island-sw.js`, served by your site (same origin) |
| `data-notifications` | `auto` to ask for permission once online |
| `data-new-chat-button` | `false` to hide the new chat button |

### Base64 config token

```text
<cti_host>:<cti_username>:<cti_token>
```

The CTI token comes from the NethVoice middleware login:

```sh
TOKEN=$(curl -s -X POST https://cti.example.com/api/login \
  -H 'Content-Type: application/json' -d '{"username":"mario","password":"..."}' | jq -r .token)
echo -n "cti.example.com:mario:$TOKEN" | base64 -w0
```

The chat must be on in NethVoice and the user's CTI profile must have the Chat permission. With two-factor authentication, use a token from a QR code login.

A complete example page is in `widget-example/`; the live demo is `index.html`.

## Events

| Event | Direction | Detail |
| --- | --- | --- |
| `chat-island-open` | in | `{ username }` operator or group address |
| `chat-island-close` | in | |
| `chat-island-new` | in | open the new chat panel |
| `chat-island-delete` | in | `{ username }` purge a conversation, leave or destroy a group |
| `chat-island-send` | in | `{ username, text }` send a text to an operator or group |
| `chat-island-group-create` | in | `{ name, members }` create a group with these usernames and open it |
| `chat-island-contacts` | in | `{ contacts }` names, avatars, presence, number |
| `chat-island-conversations-request` | in | ask for the list |
| `chat-island-theme-change` | in | `{ theme }` light, dark or system, remembered |
| `chat-island-conversations` | out | `{ conversations }` newest first |
| `chat-island-unread` | out | `{ total }` |
| `chat-island-message` | out | every new message |
| `chat-island-status` | out | `{ status }` connecting, online, offline, error, unauthorized |
| `chat-island-error` | out | `{ scope, message }` |
| `chat-island-push` | out | `{ enabled }` |
| `chat-island-call` | out | `{ username, number }` |
| `chat-island-notify` | out | `{ peer, name, body, kind, author, text, attachment, avatar, ts }` message not in view |

## Integrate in an existing app

An app with its own users (WebTop, an intranet) embeds the widget and builds its view on the events:

1. log the user in on the CTI (`/api/login`, or a QR code token with two-factor authentication) and pass `<cti_host>:<username>:<token>` as `data-config`;
2. on `chat-island-status` `unauthorized`, log in again and set the new token in `data-config`: the island reconnects in place;
3. keep its conversation list with `chat-island-conversations-request` / `chat-island-conversations`, badges with `chat-island-unread`;
4. drive the island with `chat-island-open`, `chat-island-close`, `chat-island-send`, `chat-island-group-create`, `chat-island-delete`; `newChatButton: false` hides the island's own entry point;
5. serve `chat-island-sw.js` from its own origin for notifications with the tab closed.

```js
const send = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }))
window.addEventListener('chat-island-conversations', (e) => render(e.detail.conversations))
send('chat-island-conversations-request')
send('chat-island-group-create', { name: 'Support', members: ['mario', 'anna'] })
send('chat-island-send', { username: 'mario', text: 'Ciao!' })
```

## Live demo

`index.html` is published on [GitHub Pages](https://nethesis.github.io/chat-island/) by `.github/workflows/pages.yml` at every push to `main`, with the widget built from the same commit. It logs in with NethVoice credentials (or a token), mounts the widget and shows its events.

```sh
npm install
npm run build:widget
python3 -m http.server   # then open http://localhost:8000/
```

## Develop

```sh
npm install
npm run dev
npm run build && npm run build:widget
```

A tag publishes the package to npm; jsDelivr serves the widget from it.
