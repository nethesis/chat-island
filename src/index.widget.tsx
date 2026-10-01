import type { Theme } from './theme'
// Stand-alone build: mounts a ChatIsland on every <div class="chat-island" data-config="...">.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatIsland } from './ChatIsland'

document.querySelectorAll<HTMLElement>('.chat-island').forEach((div) => {
  const d = div.dataset
  createRoot(div).render(
    <React.StrictMode>
      <ChatIsland
        dataConfig={d.config ?? ''}
        position={d.position === 'bottom-left' ? 'bottom-left' : 'bottom-right'}
        theme={d.theme as Theme | undefined}
        serviceWorker={d.serviceWorker}
        newChatButton={d.newChatButton !== 'false'}
        notifications={d.notifications === 'auto' ? 'auto' : 'click'}
      />
    </React.StrictMode>,
  )
})
