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
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react'
import type { Equipo, ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { SelectorCantidad } from '../componentes/Campo'
import { CapturaProducto } from '../componentes/CapturaProducto'
import { Vacio, Esqueleto, ErrorEnPantalla } from '../componentes/Estados'
import { Miniatura } from '../componentes/FichaProducto'
import { IconoUbicacion } from '../componentes/IconoUbicacion'
import { HojaInferior } from '../componentes/HojaInferior'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { numero } from '../lib/formato'
import { avisarError } from '../lib/retroalimentacion'

interface Renglon {
  producto: ProductoConStock
  cantidad: number
  equipos: Equipo[]
}

export function Traspaso() {
  const [parametros] = useSearchParams()
  const productoId = parametros.get('producto') ?? ''
  const origenId = parametros.get('origen') ?? ''
  const destinoId = parametros.get('destino') ?? ''
  const producto = useQuery({ queryKey: ['producto', productoId], queryFn: () => api.producto(productoId), enabled: !!productoId, staleTime: 0 })
  if (!productoId) return <FormularioTraspaso />
  if (producto.isPending) return <Marco titulo="Preparar traspaso" atras sinUbicacion><Esqueleto filas={3} /></Marco>
  if (!producto.data) return <Marco titulo="Preparar traspaso" atras sinUbicacion><ErrorEnPantalla mensaje="No se pudo comprobar el stock." onReintentar={() => void producto.refetch()} /></Marco>
  return <TraspasoSugerido key={parametros.toString()} ficha={producto.data.producto} origenId={origenId} destinoId={destinoId} />
}

function TraspasoSugerido({ ficha, origenId, destinoId }: { ficha: ProductoConStock; origenId: string; destinoId: string }) {
  const { ubicaciones } = useUbicacion()
  // El borrador se inicializa una vez; una recarga de stock no descarta lo que se está preparando.
  const [preparado] = useState(() => {
    const disponible = ficha.stock.find(s => s.ubicacionId === origenId)?.cantidad ?? 0
    const actual = ficha.stock.find(s => s.ubicacionId === destinoId)?.cantidad ?? 0
    const cantidad = Math.min(disponible - ficha.stockMinimo, Math.max(1, ficha.stockMinimo) - actual)
    if (!ficha.activo || cantidad < 1 || origenId === destinoId || !ubicaciones.some(u => u.id === origenId) || !ubicaciones.some(u => u.id === destinoId)) return null
    return { origenId, destinoId, renglon: { producto: ficha, cantidad, equipos: [] } }
  })
  if (!preparado) {
    return <Marco titulo="Preparar traspaso" atras sinUbicacion><Vacio titulo="La sugerencia ya no está disponible" detalle="Las existencias cambiaron. Vuelve al producto para revisar el stock actual." /></Marco>
  }
  return <FormularioTraspaso preparado={preparado} />
}

function FormularioTraspaso({ preparado }: { preparado?: { origenId: string; destinoId: string; renglon: Renglon } }) {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { ubicaciones, activa } = useUbicacion()

  // El origen arranca en la ubicacion activa, que es donde esta parada la
  // persona y de donde va a sacar la mercancía.
  const [origenId, setOrigenId] = useState<string>(preparado?.origenId ?? activa?.id ?? '')
  const [destinoId, setDestinoId] = useState<string>(preparado?.destinoId ?? '')
  const [renglones, setRenglones] = useState<Renglon[]>(preparado ? [preparado.renglon] : [])
  const [capturando, setCapturando] = useState(false)
  const [seleccionando, setSeleccionando] = useState<ProductoConStock | null>(null)
  const [idsEquipos, setIdsEquipos] = useState<string[]>([])
  const [cantidadSinImei, setCantidadSinImei] = useState(1)
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

  const equiposSeleccion = useQuery({
    queryKey: ['equipos', seleccionando?.id],
    queryFn: () => api.equiposDeProducto(seleccionando?.id ?? '', true),
    enabled: seleccionando !== null,
  })

  const equiposDeOrigen = (equiposSeleccion.data?.equipos ?? []).filter((equipo) => equipo.ubicacionId === origenId && equipo.activo)
  const modeloConImei = (equiposSeleccion.data?.equipos.length ?? 0) > 0

  const abrirSelectorEquipos = (producto: ProductoConStock): void => {
    const hay = disponible(producto)
    if (hay < 1) {
      avisarError()
      avisos.error(`No hay ${producto.nombre} en ${origen?.nombre ?? 'el origen'}`)
      return
    }
    const actual = renglones.find((renglon) => renglon.producto.id === producto.id)
    setIdsEquipos(actual?.equipos.map((equipo) => equipo.id) ?? [])
    setCantidadSinImei(actual?.cantidad ?? 1)
    setCapturando(false)
    setSeleccionando(producto)
  }

  const guardarEquiposElegidos = (): void => {
    if (seleccionando === null) return

    if (equiposDeOrigen.length === 0) {
      if (modeloConImei) {
        avisos.error(`No hay IMEI disponibles de ${seleccionando.nombre} en ${origen?.nombre ?? 'el origen'}`)
        return
      }
      setRenglones((previos) => {
        const indice = previos.findIndex((renglon) => renglon.producto.id === seleccionando.id)
        if (indice === -1) return [...previos, { producto: seleccionando, cantidad: cantidadSinImei, equipos: [] }]
        return previos.map((renglon) => renglon.producto.id === seleccionando.id ? { ...renglon, cantidad: cantidadSinImei, equipos: [] } : renglon)
      })
      setSeleccionando(null)
      return
    }

    const seleccionados = equiposDeOrigen.filter((equipo) => idsEquipos.includes(equipo.id))
    if (seleccionados.length === 0) {
      avisos.error(`Elige al menos un equipo de ${seleccionando.nombre}`)
      return
    }

    setRenglones((previos) => {
      const sinActual = previos.filter((renglon) => renglon.producto.id !== seleccionando.id)
      return [...sinActual, { producto: seleccionando, cantidad: seleccionados.length, equipos: seleccionados }]
    })
    setSeleccionando(null)
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
        renglones: renglones.map((r) => ({ productoId: r.producto.id, cantidad: r.cantidad, ...(r.equipos.length > 0 ? { equipoIds: r.equipos.map((equipo) => equipo.id) } : {}) })),
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
                          {origen.nombre}: {numero(disponible(renglon.producto))} → {numero(disponible(renglon.producto) - renglon.cantidad)}
                        </p>
                        <p className="text-[0.8125rem] text-tinta-suave">{destino.nombre}: {numero(renglon.producto.stock.find(s => s.ubicacionId === destinoId)?.cantidad ?? 0)} → {numero((renglon.producto.stock.find(s => s.ubicacionId === destinoId)?.cantidad ?? 0) + renglon.cantidad)}</p>
                        {renglon.equipos.length > 0 && <p className="mt-1 line-clamp-2 text-[0.75rem] font-medium text-accion">{numero(renglon.equipos.length)} equipos: {renglon.equipos.map((equipo) => equipo.imei1 ?? equipo.imei2 ?? 'Sin IMEI').join(' · ')}</p>}
                      </div>

                      <button
                        type="button"
                        aria-label={renglon.equipos.length > 0 ? `Elegir equipos de ${renglon.producto.nombre}` : `Cantidad de ${renglon.producto.nombre}`}
                        onClick={() => renglon.equipos.length > 0 ? abrirSelectorEquipos(renglon.producto) : setAjustando(renglon)}
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
        <section className="rounded-2xl border border-accion/25 bg-accion-tenue p-3">
          <p className="mb-2 px-1 text-[0.8125rem] text-tinta-suave">Revisa los equipos elegidos y confirma el envío.</p>
          <Boton ancho cargando={enviando} onClick={() => void confirmar()}>
            Confirmar traspaso · Enviar {numero(totalPiezas)} piezas a {destino.nombre}
          </Boton>
        </section>
      )}

      <HojaInferior
        abierta={capturando}
        onCerrar={() => setCapturando(false)}
        titulo="Agregar al traspaso"
      >
        <div className="-mx-5 flex h-[65vh] flex-col">
          <CapturaProducto
            onElegido={abrirSelectorEquipos}
            ubicacionId={origen?.id}
            indicacion={
              renglones.length === 0
                ? 'Apunta al codigo de barras'
                : `${numero(totalPiezas)} piezas agregadas`
            }
          />
        </div>
      </HojaInferior>

      <HojaInferior
        abierta={seleccionando !== null}
        onCerrar={() => setSeleccionando(null)}
        onVolver={() => {
          setSeleccionando(null)
          setCapturando(true)
        }}
        etiquetaVolver="Volver a buscar modelos"
        titulo={seleccionando === null ? 'Elegir equipos' : `Elegir · ${seleccionando.nombre}`}
      >
        {seleccionando !== null && (
          <SelectorEquipos
            producto={seleccionando}
            equipos={equiposDeOrigen}
            modeloConImei={modeloConImei}
            cargando={equiposSeleccion.isPending}
            idsSeleccionados={idsEquipos}
            cantidadSinImei={cantidadSinImei}
            disponible={disponible(seleccionando)}
            onCambiarSeleccion={(equipoId) => setIdsEquipos((previos) => previos.includes(equipoId) ? previos.filter((id) => id !== equipoId) : [...previos, equipoId])}
            onCambiarCantidad={setCantidadSinImei}
            onConfirmar={guardarEquiposElegidos}
          />
        )}
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

function SelectorEquipos({ producto, equipos, modeloConImei, cargando, idsSeleccionados, cantidadSinImei, disponible, onCambiarSeleccion, onCambiarCantidad, onConfirmar }: { producto: ProductoConStock; equipos: Equipo[]; modeloConImei: boolean; cargando: boolean; idsSeleccionados: string[]; cantidadSinImei: number; disponible: number; onCambiarSeleccion: (id: string) => void; onCambiarCantidad: (cantidad: number) => void; onConfirmar: () => void }) {
  if (cargando) return <div className="pb-3"><Esqueleto filas={3} /></div>

  if (equipos.length === 0) {
    if (modeloConImei) return <div className="flex flex-col gap-4 pb-3"><div className="rounded-xl border border-alerta/30 bg-alerta-tenue px-3 py-2.5 text-[0.875rem] text-tinta-suave">Este modelo usa IMEI, pero no tiene unidades disponibles en el origen. No se puede trasladar por cantidad manual.</div></div>
    return <div className="flex flex-col gap-4 pb-3"><div className="rounded-xl bg-papel-hundido px-3 py-2.5 text-[0.875rem] text-tinta-suave">No hay IMEI registrados para este modelo. Indica cuántas piezas vas a trasladar.</div><SelectorCantidad valor={cantidadSinImei} maximo={Math.max(1, disponible)} onCambio={onCambiarCantidad} /><Boton ancho onClick={onConfirmar}>Agregar {numero(cantidadSinImei)} piezas</Boton></div>
  }

  return <div className="flex flex-col gap-3 pb-3"><p className="text-[0.875rem] leading-snug text-tinta-suave">Selecciona las unidades de <strong className="font-semibold text-tinta">{producto.nombre}</strong> que salen en este traspaso.</p><div className="flex items-center justify-between rounded-xl bg-accion-tenue px-3 py-2 text-[0.8125rem] text-accion"><span>{numero(equipos.length)} equipos disponibles</span><span className="font-semibold">{numero(idsSeleccionados.length)} elegidos</span></div>{disponible !== equipos.length && <p className="rounded-xl border border-alerta/30 bg-alerta-tenue px-3 py-2 text-[0.75rem] text-tinta-suave">Hay {numero(disponible)} piezas en stock, pero solo {numero(equipos.length)} IMEI disponibles. Regulariza los IMEI antes de confirmar el traspaso.</p>}<ul className="flex flex-col gap-2">{equipos.map((equipo) => { const elegido = idsSeleccionados.includes(equipo.id); const imei = equipo.imei1 ?? equipo.imei2 ?? 'Sin IMEI registrado'; return <li key={equipo.id}><button type="button" aria-pressed={elegido} onClick={() => onCambiarSeleccion(equipo.id)} className={`flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl border p-3 text-left transition ${elegido ? 'border-accion bg-accion-tenue' : 'border-borde bg-superficie active:bg-papel-hundido'}`}><span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-lg border ${elegido ? 'border-accion bg-accion text-white' : 'border-borde-fuerte text-transparent'}`}><Check className="size-4" strokeWidth={3} /></span><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-papel-hundido text-tinta-suave"><Smartphone className="size-4" strokeWidth={2} /></span><span className="min-w-0 flex-1"><span className="cifras block truncate text-[0.875rem] font-semibold">{imei}</span>{equipo.imei2 !== null && <span className="cifras mt-0.5 block truncate text-[0.6875rem] text-tinta-tenue">IMEI 2 · {equipo.imei2}</span>}<span className="mt-1 flex items-center gap-1 text-[0.6875rem] text-tinta-suave">{equipo.listaBlanca === 'registered' ? <ShieldCheck className="size-3.5 text-exito" strokeWidth={2} /> : <ShieldAlert className="size-3.5 text-falta" strokeWidth={2} />}{equipo.listaBlanca === 'registered' ? 'Registrado' : 'No registrado'} · {equipo.condicion === 'new' ? 'Nuevo' : 'Segunda mano'}</span></span></button></li> })}</ul><Boton ancho disabled={disponible !== equipos.length} onClick={onConfirmar}>Agregar {numero(idsSeleccionados.length)} equipos</Boton></div>
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
  const [abierta, setAbierta] = useState(valor === '')
  const seleccionada = ubicaciones.find(u => u.id === valor)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-etiqueta text-tinta-tenue uppercase">{etiqueta}</span>

      <button type="button" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}
        className="flex min-h-toque items-center justify-between gap-2 rounded-xl border border-borde bg-superficie px-4 py-2 text-left">
        <span className="min-w-0 break-words font-semibold">{seleccionada?.nombre ?? 'Elegir ubicación'}</span>
        <span className="shrink-0 text-[0.8125rem] text-accion">{abierta ? 'Cerrar' : 'Cambiar'}</span>
      </button>

      {abierta && <div className="flex flex-col gap-1.5">
        {ubicaciones
          .filter((u) => u.id !== excluir)
          .map((ubicacion) => {
            const elegida = ubicacion.id === valor

            return (
              <button
                key={ubicacion.id}
                type="button"
                onClick={() => { onCambio(ubicacion.id); setAbierta(false) }}
                aria-pressed={elegida}
                className={[
                  'flex min-h-toque items-center gap-3 rounded-xl border px-4 text-left transition',
                  elegida
                    ? 'border-accion bg-accion-tenue'
                    : 'border-borde bg-superficie active:bg-papel-hundido',
                ].join(' ')}
              >
                <IconoUbicacion icono={ubicacion.icono} tipo={ubicacion.tipo} className="size-5 shrink-0 text-tinta-suave" />
                <span className="min-w-0 flex-1 truncate text-[1rem] font-medium">
                  {ubicacion.nombre}
                </span>
                {elegida && <Check className="size-5 shrink-0 text-accion" strokeWidth={2.5} aria-hidden="true" />}
              </button>
            )
          })}
      </div>}
    </div>
  )
}
