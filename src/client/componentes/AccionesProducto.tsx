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
import { useQueryClient } from '@tanstack/react-query'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoNota, SelectorCantidad } from './Campo'
import { DesgloseStock, Miniatura } from './FichaProducto'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { dinero, numero } from '../lib/formato'
import { avisarError } from '../lib/retroalimentacion'
import { SugerenciaReposicion } from './SugerenciaReposicion'

type Modo = 'rápido' | 'entrada' | 'venta' | 'merma' | 'ajuste'

interface AccionesProductoProps {
  producto: ProductoConStock
  /** Se llama después de cualquier movimiento aplicado o deshecho. */
  onCambio?: () => void
  /** Se llama al terminar, para cerrar la hoja que lo contiene. */
  onListo?: () => void
}

export function AccionesProducto({ producto, onCambio, onListo }: AccionesProductoProps) {
  const { activa } = useUbicacion()
  const avisos = useAvisos()
  const cliente = useQueryClient()

  const [modo, setModo] = useState<Modo>('rápido')
  const [cantidad, setCantidad] = useState(1)
  const [nota, setNota] = useState('')
  const [signo, setSigno] = useState<1 | -1>(1)
  const [errorNota, setErrorNota] = useState<string | undefined>(undefined)
  const [enviando, setEnviando] = useState(false)

  const enUbicacion =
    activa === null
      ? 0
      : (producto.stock.find((s) => s.ubicacionId === activa.id)?.cantidad ?? 0)

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
    accion: () => Promise<{ movimiento: { id: string } }>,
    textoExito: string,
  ): Promise<void> => {
    setEnviando(true)
    try {
      const { movimiento } = await accion()

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
      onListo?.()
    } catch (causa) {
      avisarError()
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo registrar')
    } finally {
      setEnviando(false)
    }
  }

  if (activa === null) {
    return <p className="py-4 text-tinta-tenue">Primero crea una ubicación.</p>
  }

  const entrada = (piezas: number): Promise<void> =>
    aplicar(
      () => api.entrada({ productoId: producto.id, ubicacionId: activa.id, cantidad: piezas }),
      `+${numero(piezas)} en ${activa.nombre}`,
    )

  const venta = (piezas: number): Promise<void> =>
    aplicar(
      () => api.venta({ productoId: producto.id, ubicacionId: activa.id, cantidad: piezas }),
      `Venta de ${numero(piezas)} en ${activa.nombre}`,
    )

  const conMotivo = async (tipo: 'merma' | 'ajuste'): Promise<void> => {
    const motivo = nota.trim()
    if (motivo.length < 3) {
      setErrorNota('Explica el motivo en pocas palabras')
      return
    }
    setErrorNota(undefined)

    if (tipo === 'merma') {
      await aplicar(
        () =>
          api.merma({
            productoId: producto.id,
            ubicacionId: activa.id,
            cantidad,
            nota: motivo,
          }),
        `Merma de ${numero(cantidad)} registrada`,
      )
      return
    }

    await aplicar(
      () =>
        api.ajuste({
          productoId: producto.id,
          ubicacionId: activa.id,
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
          <p className="text-[0.875rem] text-tinta-suave">En {activa.nombre}: entrada → {numero(enUbicacion + 1)} piezas{enUbicacion > 0 ? ` · venta → ${numero(enUbicacion - 1)}` : ' · sin stock para vender'}.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Boton tono="exito" onClick={() => void entrada(1)} disabled={enviando}>
              + 1 entrada
            </Boton>
            <Boton
              tono="peligro"
              onClick={() => void venta(1)}
              disabled={enviando || enUbicacion < 1}
            >
              − 1 venta
            </Boton>
          </div>

          <SugerenciaReposicion producto={producto} />

          <div className="grid grid-cols-2 gap-2.5">
            <Boton tono="contorno" onClick={() => setModo('entrada')} disabled={enviando}>
              Entrada…
            </Boton>
            <Boton
              tono="contorno"
              onClick={() => setModo('venta')}
              disabled={enviando || enUbicacion < 1}
            >
              Venta…
            </Boton>
          </div>

          <div className="flex flex-col gap-2">
            <DesgloseStock producto={producto} ubicacionActivaId={activa.id} />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModo('merma')}
                disabled={enviando || enUbicacion < 1}
                className="flex-1 rounded-xl px-3 py-3 text-[0.9375rem] font-medium text-tinta-suave transition active:bg-papel-hundido disabled:opacity-40"
              >
                Registrar merma
              </button>
              <button
                type="button"
                onClick={() => setModo('ajuste')}
                disabled={enviando}
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
          <p role="status" className="rounded-xl bg-accion-tenue p-3 text-[0.9375rem]">En {activa.nombre}: {numero(enUbicacion)} → <strong>{numero(enUbicacion + (modo === 'entrada' ? cantidad : -cantidad))} piezas</strong></p>
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
                Hay {numero(enUbicacion)} en {activa.nombre}
              </p>
            )}
          </div>

          <div className="grid grid-cols-[1fr_2fr] gap-2.5">
            <Boton tono="contorno" onClick={() => setModo('rápido')} disabled={enviando}>
              Cancelar
            </Boton>
            <Boton
              tono={modo === 'entrada' ? 'exito' : 'peligro'}
              cargando={enviando}
              onClick={() => void (modo === 'entrada' ? entrada(cantidad) : venta(cantidad))}
            >
              {modo === 'entrada' ? 'Registrar entrada' : 'Registrar venta'}
            </Boton>
          </div>
        </div>
      )}

      {(modo === 'merma' || modo === 'ajuste') && (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-xl bg-accion-tenue p-3 text-[0.9375rem]">En {activa.nombre}: {numero(enUbicacion)} → <strong>{numero(enUbicacion + cantidad * (modo === 'merma' ? -1 : signo))} piezas</strong></p>
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

          <div className="flex flex-col gap-2">
            <p className="text-[0.8125rem] font-medium text-tinta-suave">Cuántas piezas</p>
            <SelectorCantidad
              valor={cantidad}
              onCambio={setCantidad}
              maximo={modo === 'merma' || signo === -1 ? Math.max(1, enUbicacion) : undefined}
            />
          </div>

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
    </div>
  )
}
