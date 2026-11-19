import type { Theme } from './theme'
// Stand-alone build: mounts a ChatIsland on every <div class="chat-island" data-config="...">.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ChatIsland } from './ChatIsland'

document.querySelectorAll<HTMLElement>('.chat-island').forEach((div) => {
  const d = div.dataset
  const root = createRoot(div)
  const render = () => root.render(
    <React.StrictMode>
      <ChatIsland
        dataConfig={d.config ?? ''}
        position={d.position === 'bottom-left' ? 'bottom-left' : 'bottom-right'}
        theme={d.theme as Theme | undefined}
        serviceWorker={d.serviceWorker}
        newChatButton={d.newChatButton !== 'false'}
        notifications={d.notifications === 'auto' ? 'auto' : 'click'}
        // Hosts without React (WebTop): the pinned panel, the language, the density, the accent and the dock size.
        pinnable={d.pinnable === 'true'}
        language={d.language}
        density={d.density === 'compact' ? 'compact' : undefined}
        accent={d.accent === 'blue' || d.accent === 'orange' ? d.accent : undefined}
        maxHeads={Number(d.maxHeads) || undefined}
      />
    </React.StrictMode>,
  )
  render()
  // A new token in data-config reconnects the island in place.
  new MutationObserver(render).observe(div, { attributes: true, attributeFilter: ['data-config', 'data-language', 'data-density'] })
})
