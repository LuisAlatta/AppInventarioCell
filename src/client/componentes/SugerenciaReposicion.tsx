import { useNavigate } from 'react-router-dom'
import type { ProductoConStock } from '@compartido/tipos'
import { useUbicacion } from '../contexto/Ubicacion'
import { sugerirReposicion } from '../lib/inventario'
import { numero } from '../lib/formato'

export function SugerenciaReposicion({ producto }: { producto: ProductoConStock }) {
  const { activa } = useUbicacion()
  const navegar = useNavigate()
  if (!activa) return null
  const actual = producto.stock.find(s => s.ubicacionId === activa.id)?.cantidad ?? 0
  if (actual >= Math.max(1, producto.stockMinimo)) return null
  const sugerencia = sugerirReposicion(producto, activa.id)
  const otras = producto.stock.filter(s => s.ubicacionId !== activa.id && s.cantidad > 0)
  return (
    <div className="rounded-xl bg-alerta-tenue p-3 text-[0.875rem] text-tinta">
      <p className="font-semibold">{actual === 0 ? 'Agotado' : 'Stock bajo'} en {activa.nombre}</p>
      {sugerencia ? (
        <>
          <p className="mt-1">Puedes traer {numero(sugerencia.cantidad)} de {sugerencia.origenNombre} sin dejarla bajo el mínimo.</p>
          <button type="button" className="mt-2 min-h-11 w-full rounded-xl border border-accion/30 bg-superficie px-3 py-2 font-semibold text-accion"
            onClick={() => navegar(`/traspaso?${new URLSearchParams({ producto: producto.id, origen: sugerencia.origenId, destino: activa.id })}`)}>
            Preparar traspaso
          </button>
        </>
      ) : (
        <p className="mt-1">{otras.length > 0
          ? `Hay existencias en ${otras.map(s => `${s.ubicacionNombre} (${numero(s.cantidad)})`).join(', ')}, pero sin excedente sobre el mínimo. Revisa antes de repartir.`
          : 'No hay existencias en otras ubicaciones. Registra una entrada cuando llegue mercancía.'}</p>
      )}
    </div>
  )
}
