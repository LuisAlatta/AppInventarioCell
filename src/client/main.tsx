import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './estilos.css'

const raiz = document.getElementById('raiz')
if (raiz === null) throw new Error('Falta el elemento #raiz en index.html')

// Al abrir la app instalada se consulta enseguida si hay una version nueva.
// Asi una pantalla que quede abierta en iOS no conserva indefinidamente el
// JavaScript precargado por la PWA.
registerSW({
  immediate: true,
  onRegisteredSW: (_urlDelWorker, registro) => {
    void registro?.update()
  },
})

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
