/**
 * Traspaso de mercancía entre ubicaciones.
 *
 * Se arma una lista y se confirma al final, en lugar de enviar cada renglon al
 * tocarlo. Dos razones:
 *
 *   - Un traspaso a medias es peor que ninguno: dejaría mercancía que salio del
 *     almacen y nunca llego a la sucursal. Enviando todo junto, si algo falla no
 *     se mueve nada.
 *   - Se puede revisar antes de confirmar. Al repartir veinte productos, el
 *     error se ve en la lista, no después en el reporte.
 *
 * Todos los renglones quedan agrupados con un mismo identificador de lote, y
 * por eso el reparto entero se puede deshacer de un toque.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { SelectorCantidad } from '../componentes/Campo'
import { CapturaProducto } from '../componentes/CapturaProducto'
import { Vacio } from '../componentes/Estados'
import { Miniatura } from '../componentes/FichaProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { numero } from '../lib/formato'
import { avisarError } from '../lib/retroalimentacion'

interface Renglon {
  producto: ProductoConStock
  cantidad: number
}

export function Traspaso() {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { ubicaciones, activa } = useUbicacion()

  // El origen arranca en la ubicacion activa, que es donde esta parada la
  // persona y de donde va a sacar la mercancía.
  const [origenId, setOrigenId] = useState<string>(activa?.id ?? '')
  const [destinoId, setDestinoId] = useState<string>('')
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [capturando, setCapturando] = useState(false)
  const [ajustando, setAjustando] = useState<Renglon | null>(null)
  const [enviando, setEnviando] = useState(false)

  const origen = ubicaciones.find((u) => u.id === origenId) ?? null
  const destino = ubicaciones.find((u) => u.id === destinoId) ?? null

  const totalPiezas = useMemo(
    () => renglones.reduce((suma, r) => suma + r.cantidad, 0),
    [renglones],
  )

  const disponible = (producto: ProductoConStock): number =>
    producto.stock.find((s) => s.ubicacionId === origenId)?.cantidad ?? 0

  /**
   * Agrega un producto, o suma uno si ya estaba en la lista.
   *
   * Escanear dos veces la misma caja es normal al repartir, y crear dos
   * renglones del mismo producto confundiria al revisar la lista.
   */
  const agregar = (producto: ProductoConStock): void => {
    const hay = disponible(producto)

    setRenglones((previos) => {
      const indice = previos.findIndex((r) => r.producto.id === producto.id)

      if (indice === -1) {
        if (hay < 1) {
          avisarError()
          avisos.error(`No hay ${producto.nombre} en ${origen?.nombre ?? 'el origen'}`)
          return previos
        }
        return [...previos, { producto, cantidad: 1 }]
      }

      const actual = previos[indice]
      if (actual === undefined) return previos

      if (actual.cantidad + 1 > hay) {
        avisarError()
        avisos.error(`Solo hay ${numero(hay)} de ${producto.nombre}`)
        return previos
      }

      const copia = [...previos]
      copia[indice] = { ...actual, cantidad: actual.cantidad + 1 }
      return copia
    })
  }

  const quitar = (productoId: string): void => {
    setRenglones((previos) => previos.filter((r) => r.producto.id !== productoId))
  }

  const fijarCantidad = (productoId: string, cantidad: number): void => {
    setRenglones((previos) =>
      previos.map((r) => (r.producto.id === productoId ? { ...r, cantidad } : r)),
    )
  }

  const confirmar = async (): Promise<void> => {
    if (origen === null || destino === null || renglones.length === 0) return

    setEnviando(true)
    try {
      const { loteId, renglones: cuántos } = await api.traspaso({
        origenId: origen.id,
        destinoId: destino.id,
        renglones: renglones.map((r) => ({ productoId: r.producto.id, cantidad: r.cantidad })),
      })

      avisos.exito(
        `${numero(cuántos)} productos enviados a ${destino.nombre}`,
        async () => {
          try {
            await api.deshacerLote(loteId)
            avisos.información('Traspaso deshecho')
            void cliente.invalidateQueries()
          } catch (causa) {
            avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo deshacer')
          }
        },
      )

      void cliente.invalidateQueries()
      setRenglones([])
      navegar('/')
    } catch (causa) {
      avisarError()
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo hacer el traspaso')
    } finally {
      setEnviando(false)
    }
  }

  const listo = origen !== null && destino !== null && renglones.length > 0

  return (
    <Marco titulo="Traspaso" atras sinUbicacion>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <SelectorRuta
            etiqueta="Sale de"
            ubicaciones={ubicaciones}
            valor={origenId}
            excluir={destinoId}
            onCambio={(id) => {
              setOrigenId(id)
              // Las cantidades dependian del stock del origen anterior, así
              // que la lista deja de ser valida.
              setRenglones([])
            }}
          />

          <div className="flex justify-center text-tinta-tenue" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5" fill="none">
              <path
                d="M12 4v16M12 20l-5-5M12 20l5-5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <SelectorRuta
            etiqueta="Llega a"
            ubicaciones={ubicaciones}
            valor={destinoId}
            excluir={origenId}
            onCambio={setDestinoId}
          />
        </section>

        {origen !== null && destino !== null && (
          <>
            <Boton tono="suave" ancho onClick={() => setCapturando(true)}>
              Agregar productos
            </Boton>

            {renglones.length === 0 ? (
              <Vacio
                titulo="Sin productos todavía"
                detalle={`Escanea o busca lo que va de ${origen.nombre} a ${destino.nombre}.`}
              />
            ) : (
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-etiqueta text-tinta-tenue uppercase">
                    {numero(renglones.length)} productos
                  </span>
                  <span className="cifras text-[0.9375rem] font-semibold">
                    {numero(totalPiezas)} piezas
                  </span>
                </div>

                <ul className="flex flex-col gap-2">
                  {renglones.map((renglon) => (
                    <li
                      key={renglon.producto.id}
                      className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3"
                    >
                      <Miniatura
                        nombre={renglon.producto.nombre}
                        claveImagen={renglon.producto.claveImagen}
                      />

                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="truncate text-[0.9375rem] font-semibold">
                          {renglon.producto.nombre}
                        </p>
                        <p className="text-[0.8125rem] text-tinta-tenue">
                          Hay {numero(disponible(renglon.producto))} en {origen.nombre}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setAjustando(renglon)}
                        className="cifras flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-papel-hundido px-3 text-[1.125rem] font-semibold"
                      >
                        {numero(renglon.cantidad)}
                        <svg viewBox="0 0 24 24" className="size-4 text-tinta-tenue" fill="none">
                          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        aria-label={`Quitar ${renglon.producto.nombre}`}
                        onClick={() => quitar(renglon.producto.id)}
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-tinta-tenue transition active:bg-papel-hundido"
                      >
                        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                          <path
                            d="M6 6l12 12M18 6L6 18"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {listo && (
        <div className="area-segura-abajo fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-papel/95 px-3 pt-3 backdrop-blur-md">
          <div className="mx-auto w-full max-w-lg">
            <Boton ancho cargando={enviando} onClick={() => void confirmar()}>
              Enviar {numero(totalPiezas)} piezas a {destino.nombre}
            </Boton>
          </div>
        </div>
      )}

      <HojaInferior
        abierta={capturando}
        onCerrar={() => setCapturando(false)}
        titulo="Agregar al traspaso"
      >
        <div className="-mx-5 flex h-[65vh] flex-col">
          <CapturaProducto
            onElegido={agregar}
            indicacion={
              renglones.length === 0
                ? 'Apunta al codigo de barras'
                : `${numero(totalPiezas)} piezas agregadas`
            }
          />
        </div>
      </HojaInferior>

      <HojaInferior
        abierta={ajustando !== null}
        onCerrar={() => setAjustando(null)}
        titulo={ajustando?.producto.nombre}
      >
        {ajustando !== null && (
          <div className="flex flex-col gap-4 pb-3">
            <p className="text-[0.9375rem] text-tinta-tenue">
              Hay {numero(disponible(ajustando.producto))} en {origen?.nombre}
            </p>

            <SelectorCantidad
              valor={ajustando.cantidad}
              maximo={Math.max(1, disponible(ajustando.producto))}
              onCambio={(valor) => {
                fijarCantidad(ajustando.producto.id, valor)
                setAjustando({ ...ajustando, cantidad: valor })
              }}
            />

            <Boton ancho onClick={() => setAjustando(null)}>
              Listo
            </Boton>
          </div>
        )}
      </HojaInferior>
    </Marco>
  )
}

function SelectorRuta({
  etiqueta,
  ubicaciones,
  valor,
  excluir,
  onCambio,
}: {
  etiqueta: string
  ubicaciones: { id: string; nombre: string; tipo: string; icono: string | null }[]
  valor: string
  excluir: string
  onCambio: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-etiqueta text-tinta-tenue uppercase">{etiqueta}</span>

      <div className="flex flex-col gap-1.5">
        {ubicaciones
          .filter((u) => u.id !== excluir)
          .map((ubicacion) => {
            const elegida = ubicacion.id === valor

            return (
              <button
                key={ubicacion.id}
                type="button"
                onClick={() => onCambio(ubicacion.id)}
                className={[
                  'flex min-h-toque items-center gap-3 rounded-xl border px-4 text-left transition',
                  elegida
                    ? 'border-accion bg-accion-tenue'
                    : 'border-borde bg-superficie active:bg-papel-hundido',
                ].join(' ')}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {ubicacion.icono ?? (ubicacion.tipo === 'warehouse' ? '🏭' : '🏬')}
                </span>
                <span className="min-w-0 flex-1 truncate text-[1rem] font-medium">
                  {ubicacion.nombre}
                </span>
                {elegida && (
                  <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-accion" aria-hidden="true" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )
          })}
      </div>
    </div>
  )
}
