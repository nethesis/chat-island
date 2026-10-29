// The page of a person outside the PBX, served by the chat gateway at /chat-gw/g/<token>.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Guest } from './Guest'

createRoot(document.getElementById('guest')!).render(
  <React.StrictMode>
    <Guest />
  </React.StrictMode>,
)
