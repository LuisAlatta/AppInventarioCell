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
import { Miniatura, RenglonProducto } from '../componentes/FichaProducto'
import { Marco } from '../componentes/Marco'
import { useUbicacion } from '../contexto/Ubicacion'
import type { FiltroStock, ProductoConStock } from '@compartido/tipos'
import { guardarBusquedas, guardarVistaBusqueda, leerBusquedas, leerVistaBusqueda, recordarBusqueda, type PreferenciasVistaBusqueda } from '../lib/inventario'

/** Espera antes de consultar. Corto para que se sienta inmediato. */
const MS_ESPERA = 120

export function Buscar() {
  const navegar = useNavigate()
  const { activa } = useUbicacion()
  const [parametros, setParametros] = useSearchParams()
  const q = parametros.get('q') ?? ''
  const valorFiltro = parametros.get('filtro')
  const filtro: FiltroStock = valorFiltro === 'bajo' || valorFiltro === 'agotados' || valorFiltro === 'disponibles' ? valorFiltro : 'todos'
  const valorListaBlanca = parametros.get('listaBlanca')
  const listaBlanca: 'registered' | 'not_registered' | undefined = valorListaBlanca === 'registered' || valorListaBlanca === 'not_registered' ? valorListaBlanca : undefined
  const valorCondicion = parametros.get('condicion')
  const condicion: 'new' | 'used' | undefined = valorCondicion === 'new' || valorCondicion === 'used' ? valorCondicion : undefined
  const [recientes, setRecientes] = useState(leerBusquedas)
  const [vista, setVista] = useState<PreferenciasVistaBusqueda>(leerVistaBusqueda)
  const [opcionesVista, setOpcionesVista] = useState(false)

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
    queryKey: ['buscar', consulta, activa?.id, filtro, listaBlanca, condicion],
    queryFn: ({ signal }) => api.buscar(consulta, signal, { ubicacionId: activa?.id, filtro, listaBlanca: listaBlanca ?? undefined, condicion: condicion ?? undefined }),
    // Conserva la lista anterior mientras llega la nueva, para que no parpadee.
    placeholderData: (previas, anterior) => anterior && anterior.queryKey[2] === activa?.id && anterior.queryKey[3] === filtro && anterior.queryKey[4] === listaBlanca && anterior.queryKey[5] === condicion ? keepPreviousData(previas) : undefined,
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
        <div className="grid grid-cols-2 gap-2" aria-label="Filtrar equipos">
          <FiltroRapido activo={listaBlanca === 'registered'} texto="✓ Registrados" onClick={() => cambiarFiltro(setParametros, 'listaBlanca', listaBlanca === 'registered' ? null : 'registered')} tono="exito" />
          <FiltroRapido activo={listaBlanca === 'not_registered'} texto="! No registrados" onClick={() => cambiarFiltro(setParametros, 'listaBlanca', listaBlanca === 'not_registered' ? null : 'not_registered')} tono="falta" />
          <FiltroRapido activo={condicion === 'new'} texto="✦ Nuevos" onClick={() => cambiarFiltro(setParametros, 'condicion', condicion === 'new' ? null : 'new')} tono="accion" />
          <FiltroRapido activo={condicion === 'used'} texto="↺ Segunda mano" onClick={() => cambiarFiltro(setParametros, 'condicion', condicion === 'used' ? null : 'used')} tono="alerta" />
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

            <div className="flex items-center justify-between px-1"><p className="text-etiqueta text-tinta-tenue uppercase">{vista.modo === 'lista' ? 'Lista' : `${vista.columnas} columnas`}</p><button type="button" aria-expanded={opcionesVista} onClick={() => setOpcionesVista(!opcionesVista)} className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-[0.8125rem] font-semibold text-accion active:bg-accion-tenue"><IconoVista /><span>Vista</span></button></div>
            {opcionesVista && <ControlesVista vista={vista} onChange={(nueva) => { setVista(nueva); guardarVistaBusqueda(nueva) }} />}
            {vista.modo === 'lista' ? <ul className={`flex flex-col gap-2 ${resultados.isPlaceholderData ? 'pointer-events-none opacity-60' : ''}`} aria-busy={resultados.isFetching}>{productos.map((producto) => <li key={producto.id}><RenglonProducto producto={producto} coincidencia={producto.coincidencia} ubicacionId={activa?.id} onClick={() => abrirProducto(producto.id, resultados.isPlaceholderData, texto, consulta, recientes, navegar, setRecientes)} /></li>)}</ul> : <ul className={`grid gap-2 ${vista.columnas === 1 ? 'grid-cols-1' : vista.columnas === 2 ? 'grid-cols-2' : 'grid-cols-3'} ${resultados.isPlaceholderData ? 'pointer-events-none opacity-60' : ''}`} aria-busy={resultados.isFetching}>{productos.map((producto) => <li key={producto.id}><TarjetaBusqueda producto={producto} imagen={vista.imagen} ubicacionId={activa?.id} onClick={() => abrirProducto(producto.id, resultados.isPlaceholderData, texto, consulta, recientes, navegar, setRecientes)} /></li>)}</ul>}
          </>
        )}
      </div>
    </Marco>
  )
}

function cambiarFiltro(setParametros: ReturnType<typeof useSearchParams>[1], clave: string, valor: string | null) { setParametros(previos => { const nuevos = new URLSearchParams(previos); if (valor === null) nuevos.delete(clave); else nuevos.set(clave, valor); return nuevos }, { replace: true }) }

function abrirProducto(id: string, pendiente: boolean, texto: string, consulta: string, recientes: string[], navegar: ReturnType<typeof useNavigate>, setRecientes: (v: string[]) => void) { if (pendiente || texto !== consulta) return; const nuevas = recordarBusqueda(recientes, consulta); guardarBusquedas(nuevas); setRecientes(nuevas); navegar(`/producto/${id}`) }

function FiltroRapido({ activo, texto, onClick, tono }: { activo: boolean; texto: string; onClick: () => void; tono: 'exito' | 'falta' | 'accion' | 'alerta' }) { const activoClase = tono === 'exito' ? 'border-exito bg-exito-tenue text-exito' : tono === 'falta' ? 'border-falta bg-falta-tenue text-falta' : tono === 'alerta' ? 'border-alerta bg-alerta-tenue text-alerta' : 'border-accion bg-accion-tenue text-accion'; return <button type="button" aria-pressed={activo} onClick={onClick} className={`min-h-11 rounded-xl border px-2 text-[0.8125rem] font-semibold transition ${activo ? activoClase : 'border-borde bg-superficie text-tinta-suave'}`}>{texto}</button> }

function ControlesVista({ vista, onChange }: { vista: PreferenciasVistaBusqueda; onChange: (vista: PreferenciasVistaBusqueda) => void }) { return <div className="rounded-2xl border border-borde bg-superficie p-3"><div className="grid grid-cols-2 gap-2"><FiltroRapido activo={vista.modo === 'lista'} texto="☰ Lista" onClick={() => onChange({ ...vista, modo: 'lista' })} tono="accion" /><FiltroRapido activo={vista.modo === 'cuadricula'} texto="▦ Cuadrícula" onClick={() => onChange({ ...vista, modo: 'cuadricula' })} tono="accion" /></div>{vista.modo === 'cuadricula' && <><p className="mt-3 text-[0.75rem] font-semibold text-tinta-suave">Columnas</p><div className="mt-1 grid grid-cols-3 gap-2">{([1, 2, 3] as const).map((columnas) => <FiltroRapido key={columnas} activo={vista.columnas === columnas} texto={`${columnas}`} onClick={() => onChange({ ...vista, columnas })} tono="accion" />)}</div><p className="mt-3 text-[0.75rem] font-semibold text-tinta-suave">Tamaño de imagen</p><div className="mt-1 grid grid-cols-3 gap-2">{(['pequena', 'mediana', 'grande'] as const).map((imagen) => <FiltroRapido key={imagen} activo={vista.imagen === imagen} texto={imagen === 'pequena' ? 'Pequeña' : imagen === 'mediana' ? 'Mediana' : 'Grande'} onClick={() => onChange({ ...vista, imagen })} tono="accion" />)}</div></>}</div> }

function TarjetaBusqueda({ producto, imagen, ubicacionId, onClick }: { producto: ProductoConStock; imagen: PreferenciasVistaBusqueda['imagen']; ubicacionId?: string; onClick: () => void }) { const cantidad = ubicacionId === undefined ? producto.stockTotal : producto.stock.find((fila) => fila.ubicacionId === ubicacionId)?.cantidad ?? 0; const claseImagen = imagen === 'pequena' ? 'scale-75 origin-top-left' : imagen === 'grande' ? '' : 'scale-[1.15] origin-top-left'; return <button type="button" onClick={onClick} className="flex min-h-36 w-full flex-col rounded-2xl border border-borde bg-superficie p-2 text-left active:scale-[0.98] active:bg-papel-hundido"><div className={`mb-2 h-16 ${claseImagen}`}><Miniatura nombre={producto.nombre} claveImagen={producto.claveImagen} tamano={imagen === 'grande' ? 'grande' : 'normal'} /></div><p className="line-clamp-2 text-[0.8125rem] leading-snug font-semibold">{producto.nombre}</p><p className="mt-auto pt-1 cifras text-[1.125rem] font-semibold text-accion">{cantidad}</p></button> }

function IconoVista() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8"/><rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8"/></svg> }
