/**
 * Ficha de un producto: existencias, acciones e historial.
 *
 * El historial esta en la misma pantalla y no detras de una pestana porque es
 * donde se responde la pregunta que trae a la dueña aquí: "por que hay menos
 * de lo que debería".
 */

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorDeApi, api } from '../api/cliente'
import { AccionesProducto } from '../componentes/AccionesProducto'
import { Boton } from '../componentes/Boton'
import { Esqueleto, ErrorEnPantalla, Etiqueta, Vacio } from '../componentes/Estados'
import { DesgloseStock, Miniatura } from '../componentes/FichaProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { NOMBRE_MOVIMIENTO, cuandoFue, dinero, fechaLarga, numero } from '../lib/formato'

export function Producto() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { activa } = useUbicacion()

  const [acciones, setAcciones] = useState(false)

  const producto = useQuery({
    queryKey: ['producto', id],
    queryFn: () => api.producto(id),
    enabled: id !== '',
  })

  const movimientos = useQuery({
    queryKey: ['movimientos', id],
    queryFn: () => api.movimientosDeProducto(id),
    enabled: id !== '',
  })

  const deshacer = async (movimientoId: string): Promise<void> => {
    try {
      await api.deshacer(movimientoId)
      avisos.información('Movimiento deshecho')
      void cliente.invalidateQueries({ queryKey: ['producto', id] })
      void cliente.invalidateQueries({ queryKey: ['movimientos', id] })
      void cliente.invalidateQueries({ queryKey: ['inicio'] })
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo deshacer')
    }
  }

  if (producto.isPending) {
    return (
      <Marco titulo="Producto" atras>
        <Esqueleto filas={4} />
      </Marco>
    )
  }

  if (producto.isError) {
    return (
      <Marco titulo="Producto" atras>
        <ErrorEnPantalla
          mensaje={
            producto.error instanceof ErrorDeApi
              ? producto.error.message
              : 'No se pudo cargar el producto.'
          }
          onReintentar={() => void producto.refetch()}
        />
      </Marco>
    )
  }

  const ficha = producto.data.producto
  const bajoMinimo = ficha.stockMinimo > 0 && ficha.stockTotal < ficha.stockMinimo
  const margen = ficha.precioVenta - ficha.precioCosto

  return (
    <Marco titulo={ficha.nombre} atras>
      <div className="flex flex-col gap-6">
        <section className="flex items-start gap-3.5">
          <Miniatura nombre={ficha.nombre} claveImagen={ficha.claveImagen} tamano="grande" />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-[1.125rem] leading-snug font-semibold">{ficha.nombre}</h2>
            <p className="text-[0.875rem] text-tinta-tenue">
              {[ficha.marca, ficha.modelo, ficha.categoriaNombre]
                .filter((x) => x !== null && x !== '')
                .join(' · ') || 'Sin marca'}
            </p>
            <p className="cifras text-[0.8125rem] text-tinta-tenue">{ficha.codigo}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <span
              className={[
                'cifras text-cifra',
                bajoMinimo ? 'text-alerta' : 'text-tinta',
              ].join(' ')}
            >
              {numero(ficha.stockTotal)}
            </span>
            <span className="text-[0.6875rem] text-tinta-tenue">en total</span>
          </div>
        </section>

        {bajoMinimo && (
          <p className="rounded-xl border border-alerta/30 bg-alerta-tenue px-4 py-3 text-[0.9375rem] text-tinta">
            Por debajo del mínimo de {numero(ficha.stockMinimo)} piezas.
          </p>
        )}

        <Boton ancho onClick={() => setAcciones(true)}>
          Registrar movimiento
        </Boton>

        <section className="flex flex-col gap-2">
          <Etiqueta>Existencias</Etiqueta>
          <DesgloseStock producto={ficha} ubicacionActivaId={activa?.id} />
        </section>

        {(ficha.precioVenta > 0 || ficha.precioCosto > 0) && (
          <section className="flex flex-col gap-2">
            <Etiqueta>Precios</Etiqueta>
            <div className="grid grid-cols-3 gap-2">
              <Dato titulo="Venta" valor={dinero(ficha.precioVenta)} />
              <Dato titulo="Costo" valor={dinero(ficha.precioCosto)} />
              <Dato
                titulo="Margen"
                valor={dinero(margen)}
                tono={margen < 0 ? 'falta' : 'exito'}
              />
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <Etiqueta>Historial</Etiqueta>

          {movimientos.isPending && <Esqueleto filas={3} />}

          {movimientos.isSuccess && movimientos.data.movimientos.length === 0 && (
            <Vacio titulo="Sin movimientos" detalle="Todavía no se ha registrado nada de este producto." />
          )}

          {movimientos.isSuccess && movimientos.data.movimientos.length > 0 && (
            <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
              {movimientos.data.movimientos.map((movimiento) => {
                const entra = movimiento.ubicacionDestinoId !== null
                const revertido = movimiento.revertidoEn !== null

                return (
                  <li key={movimiento.id} className="flex items-center gap-3 px-3.5 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-[0.9375rem] font-medium">
                        {NOMBRE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo}
                        {revertido && (
                          <span className="ml-2 rounded-md bg-papel-hundido px-1.5 py-0.5 text-[0.6875rem] font-semibold text-tinta-tenue">
                            deshecho
                          </span>
                        )}
                      </p>

                      <p className="text-[0.8125rem] text-tinta-tenue">
                        {[movimiento.ubicacionOrigenNombre, movimiento.ubicacionDestinoNombre]
                          .filter((x) => x !== null)
                          .join(' → ')}
                      </p>

                      {movimiento.nota !== null && movimiento.nota !== '' && (
                        <p className="text-[0.8125rem] text-tinta-suave italic">{movimiento.nota}</p>
                      )}

                      <p
                        className="text-[0.75rem] text-tinta-tenue"
                        title={fechaLarga(movimiento.creadoEn)}
                      >
                        {cuandoFue(movimiento.creadoEn)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={[
                          'cifras text-[1.0625rem] font-semibold',
                          revertido
                            ? 'text-tinta-tenue line-through'
                            : entra
                              ? 'text-exito'
                              : 'text-falta',
                        ].join(' ')}
                      >
                        {entra ? '+' : '−'}
                        {numero(movimiento.cantidad)}
                      </span>

                      {!revertido && (
                        <button
                          type="button"
                          onClick={() => void deshacer(movimiento.id)}
                          className="text-[0.8125rem] font-semibold text-accion"
                        >
                          Deshacer
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <HojaInferior abierta={acciones} onCerrar={() => setAcciones(false)} titulo="Registrar">
        <AccionesProducto
          producto={ficha}
          onCambio={() => {
            void cliente.invalidateQueries({ queryKey: ['movimientos', id] })
          }}
          onListo={() => setAcciones(false)}
        />
      </HojaInferior>

      {ficha.notas !== null && ficha.notas !== '' && (
        <p className="mt-4 rounded-xl bg-papel-hundido px-4 py-3 text-[0.9375rem] text-tinta-suave">
          {ficha.notas}
        </p>
      )}

      <button
        type="button"
        onClick={() => navegar('/buscar')}
        className="mt-6 w-full rounded-xl px-4 py-3 text-[0.9375rem] font-semibold text-accion"
      >
        Buscar otro producto
      </button>
    </Marco>
  )
}

function Dato({
  titulo,
  valor,
  tono = 'normal',
}: {
  titulo: string
  valor: string
  tono?: 'normal' | 'exito' | 'falta'
}) {
  const color = tono === 'exito' ? 'text-exito' : tono === 'falta' ? 'text-falta' : 'text-tinta'

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-borde bg-superficie px-3 py-2.5">
      <span className="text-[0.6875rem] font-semibold tracking-wide text-tinta-tenue uppercase">
        {titulo}
      </span>
      <span className={`cifras text-[1rem] font-semibold ${color}`}>{valor}</span>
    </div>
  )
}
