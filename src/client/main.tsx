import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './estilos.css'

// Prevenir zoom por gestos táctiles (pinch-to-zoom) en Safari iOS y Android
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('gesturechange', (e) => e.preventDefault())
document.addEventListener('gestureend', (e) => e.preventDefault())

// Prevenir zoom multi-toque en pantallas táctiles
document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) {
      e.preventDefault()
    }
  },
  { passive: false },
)

// Prevenir zoom de rueda con tecla Ctrl (trackpads en modo móvil)
document.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault()
    }
  },
  { passive: false },
)

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
