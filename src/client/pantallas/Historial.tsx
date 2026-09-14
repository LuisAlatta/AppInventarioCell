/** Historial completo de la actividad del inventario. */

import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import { Esqueleto, ErrorEnPantalla, Vacio } from '../componentes/Estados'
import { Miniatura } from '../componentes/FichaProducto'
import { Marco } from '../componentes/Marco'
import { NOMBRE_MOVIMIENTO, cuandoFue, numero } from '../lib/formato'

export function Historial() {
  const navegar = useNavigate()
  const historial = useQuery({ queryKey: ['movimientos'], queryFn: () => api.movimientos() })

  return (
    <Marco titulo="Todos los movimientos" atras>
      <div className="flex flex-col gap-3">
        {historial.isPending && <Esqueleto filas={6} />}
        {historial.isError && <ErrorEnPantalla mensaje="No se pudo cargar el historial." onReintentar={() => void historial.refetch()} />}
        {historial.isSuccess && historial.data.movimientos.length === 0 && <Vacio titulo="Aún no hay movimientos" detalle="Las entradas, ventas y traspasos aparecerán aquí." />}
        {historial.isSuccess && historial.data.movimientos.length > 0 && (
          <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            {historial.data.movimientos.map((movimiento) => {
              const entrada = movimiento.ubicacionDestinoId !== null && movimiento.ubicacionOrigenId === null
              const salida = movimiento.ubicacionOrigenId !== null && movimiento.ubicacionDestinoId === null
              const signo = entrada ? '+' : salida ? '−' : '↔'
              const color = entrada ? 'text-exito' : salida ? 'text-falta' : 'text-accion'
              const ubicacion = movimiento.ubicacionDestinoNombre ?? movimiento.ubicacionOrigenNombre ?? ''

              return <li key={movimiento.id}>
                <button type="button" onClick={() => navegar(`/producto/${movimiento.productoId}`)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-papel-hundido">
                  <Miniatura nombre={movimiento.productoNombre} claveImagen={movimiento.claveImagenProducto} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] font-medium">{movimiento.productoNombre}</p>
                    <p className="truncate text-[0.8125rem] text-tinta-tenue">{NOMBRE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo} · {ubicacion} · {cuandoFue(movimiento.creadoEn)}</p>
                  </div>
                  <span className={`cifras shrink-0 text-[1rem] font-semibold ${movimiento.revertidoEn !== null ? 'text-tinta-tenue line-through' : color}`}>{signo}{numero(movimiento.cantidad)}</span>
                </button>
              </li>
            })}
          </ul>
        )}
      </div>
    </Marco>
  )
}
