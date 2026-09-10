/**
 * Busqueda de productos.
 *
 * Resultados mientras se escribe, sin boton de buscar. Un boton obliga a un
 * toque extra en la accion que se repite todo el dia.
 *
 * El campo mantiene el foco y los resultados anteriores mientras llega la
 * consulta nueva. Vaciar la lista en cada tecleo produce un parpadeo que hace
 * parecer que la app duda.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import { ErrorEnPantalla, Esqueleto, Vacio } from '../componentes/Estados'
import { RenglonProducto } from '../componentes/FichaProducto'
import { Marco } from '../componentes/Marco'
import { useUbicacion } from '../contexto/Ubicacion'
import type { FiltroStock } from '@compartido/tipos'
import { guardarBusquedas, leerBusquedas, recordarBusqueda } from '../lib/inventario'

/** Espera antes de consultar. Corto para que se sienta inmediato. */
const MS_ESPERA = 120

export function Buscar() {
  const navegar = useNavigate()
  const { activa } = useUbicacion()
  const [parametros, setParametros] = useSearchParams()
  const q = parametros.get('q') ?? ''
  const valorFiltro = parametros.get('filtro')
  const filtro: FiltroStock = valorFiltro === 'bajo' || valorFiltro === 'agotados' || valorFiltro === 'disponibles' ? valorFiltro : 'todos'
  const [recientes, setRecientes] = useState(leerBusquedas)

  const [texto, setTexto] = useState(q)
  const [consulta, setConsulta] = useState(q)
  const refCampo = useRef<HTMLInputElement | null>(null)

  // El teclado se abre solo: quien entra a "Buscar" viene a escribir.
  useEffect(() => {
    if (!parametros.has('filtro')) refCampo.current?.focus()
  }, [])

  useEffect(() => { setTexto(q); setConsulta(q) }, [q])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setConsulta(texto)
      if (texto !== q) setParametros(previos => {
        const nuevos = new URLSearchParams(previos)
        if (texto) nuevos.set('q', texto); else nuevos.delete('q')
        return nuevos
      }, { replace: true })
    }, MS_ESPERA)
    return () => window.clearTimeout(temporizador)
  }, [texto, q, setParametros])

  const resultados = useQuery({
    queryKey: ['buscar', consulta, activa?.id, filtro],
    queryFn: ({ signal }) => api.buscar(consulta, signal, { ubicacionId: activa?.id, filtro }),
    // Conserva la lista anterior mientras llega la nueva, para que no parpadee.
    placeholderData: (previas, anterior) => anterior && anterior.queryKey[2] === activa?.id && anterior.queryKey[3] === filtro ? keepPreviousData(previas) : undefined,
  })

  const productos = resultados.data?.productos ?? []
  const buscando = consulta.trim().length > 0

  return (
    <Marco titulo="Buscar" atras>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-5 text-tinta-tenue"
            aria-hidden="true"
            fill="none"
          >
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
            <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>

          <input
            ref={refCampo}
            type="search"
            value={texto}
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const nuevas = recordarBusqueda(recientes, texto)
                setRecientes(nuevas); guardarBusquedas(nuevas)
                refCampo.current?.blur()
              }
            }}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, marca o código"
            aria-label="Buscar productos"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-h-toque w-full rounded-2xl border border-borde bg-superficie pl-11 pr-11 text-[1rem] text-tinta placeholder:text-tinta-tenue focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15 [&::-webkit-search-cancel-button]:hidden"
          />

          {texto.length > 0 && (
            <button
              type="button"
              aria-label="Limpiar"
              onClick={() => {
                setTexto('')
                refCampo.current?.focus()
              }}
              className="absolute inset-y-0 right-1 my-auto flex size-11 items-center justify-center rounded-lg text-tinta-tenue transition active:bg-papel-hundido"
            >
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2" aria-label="Filtrar por existencias">
          {([['todos', 'Todos'], ['disponibles', 'Disponibles'], ['agotados', 'Agotados'], ['bajo', 'Stock bajo']] as const).map(([valor, nombre]) => (
            <button key={valor} type="button" aria-pressed={filtro === valor}
              onClick={() => setParametros(previos => { const nuevos = new URLSearchParams(previos); nuevos.set('filtro', valor); return nuevos }, { replace: true })}
              className={`min-h-11 rounded-xl border px-3 text-[0.875rem] font-semibold transition ${filtro === valor ? 'border-accion bg-accion-tenue text-accion' : 'border-borde bg-superficie text-tinta-suave'}`}>
              {nombre}
            </button>
          ))}
        </div>
        <p className="text-[0.8125rem] text-tinta-suave">Existencias en {activa?.nombre ?? 'todas las ubicaciones'}. Stock bajo: quedan piezas por debajo del mínimo.</p>

        {!texto && recientes.length > 0 && (
          <section aria-label="Búsquedas recientes" className="flex flex-col gap-1">
            <div className="flex items-center justify-between"><span className="text-[0.875rem] font-semibold">Búsquedas recientes</span>
              <button type="button" className="min-h-11 px-3 text-[0.875rem] text-accion" onClick={() => { setRecientes([]); guardarBusquedas([]) }}>Borrar historial</button>
            </div>
            <div className="flex flex-wrap gap-2">{recientes.map(reciente => (
              <button key={reciente} type="button" onClick={() => setTexto(reciente)} className="min-h-11 max-w-full truncate rounded-xl bg-papel-hundido px-3 text-[0.875rem]">{reciente}</button>
            ))}</div>
          </section>
        )}
        <p role="status" className="text-[0.8125rem] text-tinta-suave">{resultados.isFetching || texto !== consulta ? 'Buscando…' : resultados.isSuccess ? `${productos.length}${productos.length === 50 ? ' primeros' : ''} resultados${productos.length === 50 ? '. Escribe para afinar la búsqueda.' : ''}` : ''}</p>

        {resultados.isError && (
          <ErrorEnPantalla
            mensaje="No se pudo buscar. Revisa la conexión."
            onReintentar={() => void resultados.refetch()}
          />
        )}

        {resultados.isPending && <Esqueleto filas={4} />}

        {resultados.isSuccess && productos.length === 0 && (
          <Vacio
            titulo={buscando ? 'Nada con esa búsqueda' : filtro !== 'todos' ? 'No hay productos con este filtro' : 'Todavía no hay productos'}
            detalle={
              filtro !== 'todos' ? 'Prueba con Todos o cambia la ubicación de arriba.' : buscando
                ? 'Prueba con menos palabras, o escanea el codigo del producto.'
                : 'Escanea el codigo de un producto para darlo de alta.'
            }
            accion={filtro !== 'todos' ? { texto: 'Ver todos', onClick: () => setParametros({ q: texto }, { replace: true }) } : { texto: 'Escanear un código', onClick: () => navegar('/escanear') }}
          />
        )}

        {productos.length > 0 && (
          <>
            {!buscando && filtro === 'todos' && (
              <p className="px-1 text-etiqueta text-tinta-tenue uppercase">Últimos productos</p>
            )}

            <ul className={`flex flex-col gap-2 ${resultados.isPlaceholderData ? 'pointer-events-none opacity-60' : ''}`} aria-busy={resultados.isFetching}>
              {productos.map((producto) => (
                <li key={producto.id}>
                  <RenglonProducto
                    producto={producto}
                    coincidencia={producto.coincidencia}
                    ubicacionId={activa?.id}
                    onClick={() => {
                      if (resultados.isPlaceholderData || texto !== consulta) return
                      const nuevas = recordarBusqueda(recientes, consulta)
                      guardarBusquedas(nuevas)
                      navegar(`/producto/${producto.id}`)
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Marco>
  )
}
