import { createRoot } from 'react-dom/client'
import './estilos.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Falta el elemento #raiz en index.html')

createRoot(raiz).render(<h1 className="p-8 text-2xl">Inventario</h1>)
