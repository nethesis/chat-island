import type { Theme } from './theme'
// Stand-alone build: mounts a ChatIsland on every <div class="chat-island" data-config="...">.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatIsland } from './ChatIsland'

document.querySelectorAll<HTMLElement>('.chat-island').forEach((div) => {
  createRoot(div).render(
    <React.StrictMode>
      <ChatIsland dataConfig={div.dataset.config ?? ''} position={div.dataset.position === 'bottom-left' ? 'bottom-left' : 'bottom-right'} theme={div.dataset.theme as Theme | undefined} serviceWorker={div.dataset.serviceWorker} />
    </React.StrictMode>,
  )
})
