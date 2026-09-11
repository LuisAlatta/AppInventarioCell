/**
 * Acciones sobre un producto: entrada, venta, merma y ajuste.
 *
 * Vive en un componente propio porque aparece en dos sitios con el mismo
 * comportamiento: al escanear un codigo y al abrir la ficha del producto. Con
 * dos copias, un arreglo en el escaner no llegaria a la ficha.
 *
 * Las dos acciones frecuentes, entrada y venta, están en botones grandes con la
 * cantidad ya puesta en 1. Registrar una venta suelta es dos toques. Lo raro
 * (merma, ajuste, cantidades grandes) esta un nivel mas abajo, sin estorbar.
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Equipo, ProductoConStock, Ubicacion } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoNota, SelectorCantidad } from './Campo'
import { Confirmacion } from './Confirmacion'
import { DesgloseStock, Miniatura } from './FichaProducto'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { dinero, numero } from '../lib/formato'
import { avisarError } from '../lib/retroalimentacion'
import { SugerenciaReposicion } from './SugerenciaReposicion'

type Modo = 'rápido' | 'entrada' | 'venta' | 'merma' | 'ajuste'

interface AccionesProductoProps {
  producto: ProductoConStock
  /** Local donde se registra el movimiento; Buscar lo fija según su filtro. */
  ubicacionSeleccionada?: Ubicacion | null
  modoInicial?: 'rápido' | 'venta'
  /** Se llama después de cualquier movimiento aplicado o deshecho. */
  onCambio?: () => void
  /** Se llama al terminar, para cerrar la hoja que lo contiene. */
  onListo?: () => void
}

export function AccionesProducto({ producto, ubicacionSeleccionada, modoInicial = 'rápido', onCambio, onListo }: AccionesProductoProps) {
  const { activa } = useUbicacion()
  const ubicacion = ubicacionSeleccionada ?? activa
  const avisos = useAvisos()
  const cliente = useQueryClient()

  const [modo, setModo] = useState<Modo>(modoInicial)
  const [cantidad, setCantidad] = useState(1)
  const [nota, setNota] = useState('')
  const [signo, setSigno] = useState<1 | -1>(1)
  const [equipoElegidoId, setEquipoElegidoId] = useState<string | null>(null)
  const [errorNota, setErrorNota] = useState<string | undefined>(undefined)
  const [enviando, setEnviando] = useState(false)
  const [confirmandoVenta, setConfirmandoVenta] = useState(false)

  const enUbicacion =
    ubicacion === null
      ? 0
      : (producto.stock.find((s) => s.ubicacionId === ubicacion.id)?.cantidad ?? 0)

  const equipos = useQuery({
    queryKey: ['equipos', producto.id, ubicacion?.id],
    queryFn: () => api.equiposDeProducto(producto.id, true),
    enabled: ubicacion !== null,
  })
  const controlaPorImei = (equipos.data?.equipos.length ?? 0) > 0
  const equiposDisponibles = (equipos.data?.equipos ?? []).filter(
    (equipo) => equipo.activo && equipo.ubicacionId === ubicacion?.id,
  )

  const refrescar = (): void => {
    void cliente.invalidateQueries({ queryKey: ['inicio'] })
    void cliente.invalidateQueries({ queryKey: ['producto', producto.id] })
    void cliente.invalidateQueries({ queryKey: ['buscar'] })
    onCambio?.()
  }

  /**
   * Aplica un movimiento y ofrece deshacerlo.
   *
   * El deshacer se ofrece siempre, incluso cuando el movimiento fue correcto:
   * quien acaba de tocar es quien mejor sabe si se equivoco, y buscar el
   * movimiento después para revertirlo cuesta mucho mas.
   */
  const aplicar = async (
    accion: () => Promise<{ movimiento: { id: string } } | { movimientos: { id: string }[] }>,
    textoExito: string,
  ): Promise<void> => {
    setEnviando(true)
    try {
      const resultado = await accion()
      const movimiento = 'movimiento' in resultado ? resultado.movimiento : resultado.movimientos[0]
      if (movimiento === undefined) throw new Error('No se registró ningún movimiento')

      avisos.exito(textoExito, async () => {
        try {
          await api.deshacer(movimiento.id)
          avisos.información('Movimiento deshecho')
          refrescar()
        } catch (causa) {
          avisarError()
          avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo deshacer')
        }
      })

      refrescar()
      setModo('rápido')
      setCantidad(1)
      setNota('')
      setEquipoElegidoId(null)
      onListo?.()
    } catch (causa) {
      avisarError()
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo registrar')
    } finally {
      setEnviando(false)
    }
  }

  if (ubicacion === null) {
    return <p className="py-4 text-tinta-tenue">Primero crea una ubicación.</p>
  }

  const entrada = (piezas: number): Promise<void> =>
    aplicar(
      () => api.entrada({ productoId: producto.id, ubicacionId: ubicacion.id, cantidad: piezas }),
      `+${numero(piezas)} en ${ubicacion.nombre}`,
    )

  const venta = (piezas: number): Promise<void> => {
    if (controlaPorImei && equipoElegidoId === null) {
      avisos.información(`Elige el IMEI de ${producto.nombre} antes de registrar la venta`)
      return Promise.resolve()
    }

    return aplicar(
      () => api.venta({
        productoId: producto.id,
        ubicacionId: ubicacion.id,
        cantidad: controlaPorImei ? 1 : piezas,
        ...(controlaPorImei ? { equipoIds: [equipoElegidoId as string] } : {}),
      }),
      `Venta de ${numero(controlaPorImei ? 1 : piezas)} en ${ubicacion.nombre}`,
    )
  }

  const solicitarVenta = (): void => {
    if (controlaPorImei && equipoElegidoId === null) {
      avisos.información(`Elige el IMEI de ${producto.nombre} antes de marcarlo como vendido`)
      return
    }
    setConfirmandoVenta(true)
  }

  const conMotivo = async (tipo: 'merma' | 'ajuste'): Promise<void> => {
    const motivo = nota.trim()
    if (motivo.length < 3) {
      setErrorNota('Explica el motivo en pocas palabras')
      return
    }
    setErrorNota(undefined)

    if (tipo === 'merma') {
      if (controlaPorImei && equipoElegidoId === null) {
        avisos.información(`Elige el IMEI de ${producto.nombre} antes de registrar la merma`)
        return
      }
      await aplicar(
        () =>
          api.merma({
            productoId: producto.id,
            ubicacionId: ubicacion.id,
            cantidad: controlaPorImei ? 1 : cantidad,
            nota: motivo,
            ...(controlaPorImei ? { equipoIds: [equipoElegidoId as string] } : {}),
          }),
        `Merma de ${numero(controlaPorImei ? 1 : cantidad)} registrada`,
      )
      return
    }

    await aplicar(
      () =>
        api.ajuste({
          productoId: producto.id,
          ubicacionId: ubicacion.id,
          cantidad: cantidad * signo,
          nota: motivo,
        }),
      `Ajuste de ${signo > 0 ? '+' : '−'}${numero(cantidad)} aplicado`,
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-3">
      <div className="flex items-start gap-3">
        <Miniatura nombre={producto.nombre} claveImagen={producto.claveImagen} tamano="grande" />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[1.0625rem] font-semibold leading-snug">{producto.nombre}</p>
          <p className="truncate text-[0.875rem] text-tinta-tenue">
            {[producto.marca, producto.modelo].filter((x) => x !== null && x !== '').join(' · ') ||
              'Sin marca'}
          </p>
          <p className="cifras text-[0.8125rem] text-tinta-tenue">{producto.codigo}</p>
          {producto.precioVenta > 0 && (
            <p className="cifras text-[0.9375rem] font-semibold">{dinero(producto.precioVenta)}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span className="cifras text-cifra text-tinta">{numero(enUbicacion)}</span>
          <span className="text-[0.6875rem] text-tinta-tenue">aquí</span>
        </div>
      </div>

      {modo === 'rápido' && (
        <>
          <p className="text-[0.875rem] text-tinta-suave">En {ubicacion.nombre}: entrada → {numero(enUbicacion + 1)} piezas{enUbicacion > 0 ? ` · venta → ${numero(enUbicacion - 1)}` : ' · sin stock para vender'}.</p>
          {controlaPorImei && <p className="rounded-xl bg-accion-tenue px-3 py-2 text-[0.8125rem] text-accion-viva">Este modelo se controla por IMEI. Elige la unidad física para venderla o registrarla como merma.</p>}
          <div className="grid grid-cols-2 gap-2.5">
            <Boton tono="exito" onClick={() => {
              if (controlaPorImei) avisos.información(`Registra el IMEI de ${producto.nombre} desde la ficha del producto para agregar una unidad`)
              else void entrada(1)
            }} disabled={enviando || equipos.isPending}>
              {controlaPorImei ? 'Registrar IMEI' : '+ 1 entrada'}
            </Boton>
            <Boton
              tono="peligro"
              onClick={() => {
                if (controlaPorImei) setModo('venta')
                else solicitarVenta()
              }}
              disabled={enviando || equipos.isPending || enUbicacion < 1}
            >
              {controlaPorImei ? 'Elegir IMEI' : '− 1 venta'}
            </Boton>
          </div>

          <SugerenciaReposicion producto={producto} />

          <div className="grid grid-cols-2 gap-2.5">
            <Boton tono="contorno" onClick={() => {
              if (controlaPorImei) avisos.información(`Registra el IMEI de ${producto.nombre} desde la ficha del producto para agregar unidades`)
              else setModo('entrada')
            }} disabled={enviando || equipos.isPending}>
              {controlaPorImei ? 'Registrar IMEI' : 'Entrada…'}
            </Boton>
            <Boton
              tono="contorno"
              onClick={() => setModo('venta')}
              disabled={enviando || equipos.isPending || enUbicacion < 1}
            >
              Venta…
            </Boton>
          </div>

          <div className="flex flex-col gap-2">
            <DesgloseStock producto={producto} ubicacionActivaId={ubicacion.id} />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModo('merma')}
                disabled={enviando || equipos.isPending || enUbicacion < 1}
                className="flex-1 rounded-xl px-3 py-3 text-[0.9375rem] font-medium text-tinta-suave transition active:bg-papel-hundido disabled:opacity-40"
              >
                Registrar merma
              </button>
              <button
                type="button"
                onClick={() => {
                  if (controlaPorImei) avisos.información(`Corrige ${producto.nombre} desde sus unidades IMEI para mantener el inventario exacto`)
                  else setModo('ajuste')
                }}
                disabled={enviando || equipos.isPending}
                className="flex-1 rounded-xl px-3 py-3 text-[0.9375rem] font-medium text-tinta-suave transition active:bg-papel-hundido"
              >
                Corregir cantidad
              </button>
            </div>
          </div>
        </>
      )}

      {(modo === 'entrada' || modo === 'venta') && (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-xl bg-accion-tenue p-3 text-[0.9375rem]">En {ubicacion.nombre}: {numero(enUbicacion)} → <strong>{numero(enUbicacion + (modo === 'entrada' ? cantidad : -(controlaPorImei ? 1 : cantidad)))} piezas</strong></p>
          {modo === 'venta' && controlaPorImei ? (
            <SelectorEquipo
              equipos={equiposDisponibles}
              seleccionadoId={equipoElegidoId}
              onSeleccionar={setEquipoElegidoId}
            />
          ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[0.8125rem] font-medium text-tinta-suave">
              {modo === 'entrada' ? 'Piezas que entran' : 'Piezas que salen'}
            </p>
            <SelectorCantidad
              valor={cantidad}
              onCambio={setCantidad}
              maximo={modo === 'venta' ? Math.max(1, enUbicacion) : undefined}
            />
            {modo === 'venta' && (
              <p className="text-[0.8125rem] text-tinta-tenue">
                Hay {numero(enUbicacion)} en {ubicacion.nombre}
              </p>
            )}
          </div>
          )}

          <div className="grid grid-cols-[1fr_2fr] gap-2.5">
            <Boton tono="contorno" onClick={() => setModo('rápido')} disabled={enviando}>
              Cancelar
            </Boton>
            <Boton
              tono={modo === 'entrada' ? 'exito' : 'peligro'}
              cargando={enviando}
              disabled={equipos.isPending || (modo === 'venta' && enUbicacion < 1)}
              onClick={() => {
                if (modo === 'entrada' && controlaPorImei) {
                  avisos.información(`Registra el IMEI de ${producto.nombre} desde la ficha del producto para agregar unidades`)
                  return
                }
                if (modo === 'entrada') void entrada(cantidad)
                else solicitarVenta()
              }}
            >
              {modo === 'entrada' ? 'Registrar entrada' : 'Marcar vendido'}
            </Boton>
          </div>
        </div>
      )}

      {(modo === 'merma' || modo === 'ajuste') && (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-xl bg-accion-tenue p-3 text-[0.9375rem]">En {ubicacion.nombre}: {numero(enUbicacion)} → <strong>{numero(enUbicacion + (modo === 'merma' ? -(controlaPorImei ? 1 : cantidad) : cantidad * signo))} piezas</strong></p>
          {modo === 'ajuste' && (
            <div className="flex gap-2">
              {([1, -1] as const).map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setSigno(valor)}
                  className={[
                    'min-h-toque flex-1 rounded-xl border text-[1rem] font-semibold transition',
                    signo === valor
                      ? 'border-accion bg-accion-tenue text-accion-viva'
                      : 'border-borde bg-superficie text-tinta-suave',
                  ].join(' ')}
                >
                  {valor > 0 ? 'Sobran piezas' : 'Faltan piezas'}
                </button>
              ))}
            </div>
          )}

          {modo === 'merma' && controlaPorImei ? (
            <SelectorEquipo
              equipos={equiposDisponibles}
              seleccionadoId={equipoElegidoId}
              onSeleccionar={setEquipoElegidoId}
            />
          ) : <div className="flex flex-col gap-2">
            <p className="text-[0.8125rem] font-medium text-tinta-suave">Cuántas piezas</p>
            <SelectorCantidad
              valor={cantidad}
              onCambio={setCantidad}
              maximo={modo === 'merma' || signo === -1 ? Math.max(1, enUbicacion) : undefined}
            />
          </div>
          }

          <CampoNota
            etiqueta="Motivo"
            value={nota}
            error={errorNota}
            onChange={(e) => {
              setNota(e.target.value)
              setErrorNota(undefined)
            }}
            placeholder={
              modo === 'merma' ? 'Se rompio al abrir la caja' : 'Se contó mal la semana pasada'
            }
            ayuda="Queda guardado en el historial. Sin motivo, un faltante se vuelve invisible."
          />

          <div className="grid grid-cols-[1fr_2fr] gap-2.5">
            <Boton tono="contorno" onClick={() => setModo('rápido')} disabled={enviando}>
              Cancelar
            </Boton>
            <Boton cargando={enviando} onClick={() => void conMotivo(modo)}>
              {modo === 'merma' ? 'Registrar merma' : 'Aplicar corrección'}
            </Boton>
          </div>
        </div>
      )}
      <Confirmacion
        abierta={confirmandoVenta}
        titulo={`¿Marcar vendido ${producto.nombre}?`}
        detalle={`Se descontará ${numero(controlaPorImei ? 1 : cantidad)} ${controlaPorImei ? 'equipo' : 'pieza(s)'} de ${ubicacion.nombre}${controlaPorImei ? ` · IMEI ${equiposDisponibles.find((equipo) => equipo.id === equipoElegidoId)?.imei1 ?? equiposDisponibles.find((equipo) => equipo.id === equipoElegidoId)?.imei2 ?? ''}` : ''}.`}
        confirmar="Marcar vendido"
        peligro
        onCancelar={() => setConfirmandoVenta(false)}
        onConfirmar={() => { setConfirmandoVenta(false); void venta(cantidad) }}
      />
    </div>
  )
}

function SelectorEquipo({
  equipos,
  seleccionadoId,
  onSeleccionar,
}: {
  equipos: Equipo[]
  seleccionadoId: string | null
  onSeleccionar: (id: string) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[0.8125rem] font-medium text-tinta-suave">Elige el equipo por IMEI</legend>
      {equipos.length === 0 ? (
        <p className="rounded-xl border border-alerta/30 bg-alerta-tenue px-3 py-2 text-[0.8125rem] text-tinta-suave">No hay equipos disponibles en esta ubicación.</p>
      ) : (
        <div className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
          {equipos.map((equipo) => {
            const seleccionado = equipo.id === seleccionadoId
            return (
              <button
                key={equipo.id}
                type="button"
                aria-pressed={seleccionado}
                onClick={() => onSeleccionar(equipo.id)}
                className={[
                  'flex min-h-toque items-center justify-between rounded-xl border px-3 py-2 text-left transition',
                  seleccionado ? 'border-accion bg-accion-tenue' : 'border-borde bg-superficie active:bg-papel-hundido',
                ].join(' ')}
              >
                <span className="min-w-0"><span className="block truncate cifras text-[0.875rem] font-semibold">{equipo.imei1 ?? equipo.imei2 ?? 'Sin IMEI'}</span>{equipo.imei2 !== null && <span className="block truncate cifras text-[0.75rem] text-tinta-tenue">IMEI 2 · {equipo.imei2}</span>}</span>
                <span className="ml-3 shrink-0 text-right text-[0.6875rem] text-tinta-tenue">{equipo.listaBlanca === 'registered' ? 'Registrado' : 'No registrado'}<br />{equipo.condicion === 'new' ? 'Nuevo' : 'Segunda mano'}</span>
              </button>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
