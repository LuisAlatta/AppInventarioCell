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
import { BadgeCheck, Grid3X3, List, MapPin, RefreshCw, ShieldAlert, Sparkles, type LucideIcon } from 'lucide-react'
import { api } from '../api/cliente'
import { ErrorEnPantalla, Esqueleto, Vacio } from '../componentes/Estados'
import { Miniatura, RenglonProducto } from '../componentes/FichaProducto'
import { IconoUbicacion } from '../componentes/IconoUbicacion'
import { Marco } from '../componentes/Marco'
import { useUbicacion } from '../contexto/Ubicacion'
import type { ProductoConStock } from '@compartido/tipos'
import { guardarBusquedas, guardarOrdenFiltrosEquipo, guardarVistaBusqueda, leerBusquedas, leerOrdenFiltrosEquipo, leerVistaBusqueda, recordarBusqueda, type FiltroEquipoRapido, type PreferenciasVistaBusqueda } from '../lib/inventario'

/** Espera antes de consultar. Corto para que se sienta inmediato. */
const MS_ESPERA = 120

export function Buscar() {
  const navegar = useNavigate()
  const { activa, ubicaciones } = useUbicacion()
  const [parametros, setParametros] = useSearchParams()
  const q = parametros.get('q') ?? ''
  const valorListaBlanca = parametros.get('listaBlanca')
  const listaBlanca: 'registered' | 'not_registered' | undefined = valorListaBlanca === 'registered' || valorListaBlanca === 'not_registered' ? valorListaBlanca : undefined
  const valorCondicion = parametros.get('condicion')
  const condicion: 'new' | 'used' | undefined = valorCondicion === 'new' || valorCondicion === 'used' ? valorCondicion : undefined
  const ubicacionElegida = ubicaciones.find((ubicacion) => ubicacion.id === parametros.get('ubicacion')) ?? activa
  const [recientes, setRecientes] = useState(leerBusquedas)
  const [vista, setVista] = useState<PreferenciasVistaBusqueda>(leerVistaBusqueda)
  const [ordenFiltros, setOrdenFiltros] = useState<FiltroEquipoRapido[]>(leerOrdenFiltrosEquipo)
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
    queryKey: ['buscar', consulta, ubicacionElegida?.id, listaBlanca, condicion],
    queryFn: ({ signal }) => api.buscar(consulta, signal, { ubicacionId: ubicacionElegida?.id, listaBlanca: listaBlanca ?? undefined, condicion: condicion ?? undefined }),
    // Conserva la lista anterior mientras llega la nueva, para que no parpadee.
    placeholderData: (previas, anterior) => anterior && anterior.queryKey[2] === ubicacionElegida?.id && anterior.queryKey[3] === listaBlanca && anterior.queryKey[4] === condicion ? keepPreviousData(previas) : undefined,
  })

  const productos = resultados.data?.productos ?? []
  const buscando = consulta.trim().length > 0
  const hayFiltros = listaBlanca !== undefined || condicion !== undefined
  const etiquetaResultados = resultados.isFetching || texto !== consulta ? 'Buscando…' : resultados.isSuccess ? `${productos.length}${productos.length === 50 ? ' primeros' : ''} resultados` : ''
  const usarFiltro = (filtroRapido: FiltroEquipoRapido): void => {
    const nuevoOrden = [filtroRapido, ...ordenFiltros.filter((actual) => actual !== filtroRapido)]
    setOrdenFiltros(nuevoOrden)
    guardarOrdenFiltrosEquipo(nuevoOrden)
    if (filtroRapido === 'registered' || filtroRapido === 'not_registered') {
      cambiarFiltro(setParametros, 'listaBlanca', listaBlanca === filtroRapido ? null : filtroRapido)
    } else {
      cambiarFiltro(setParametros, 'condicion', condicion === filtroRapido ? null : filtroRapido)
    }
  }

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

        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filtros rápidos de equipos">
          {ordenFiltros.map((filtroRapido) => <FiltroRapido key={filtroRapido} activo={filtroRapido === listaBlanca || filtroRapido === condicion} texto={NOMBRE_FILTRO[filtroRapido]} icono={ICONO_FILTRO[filtroRapido]} onClick={() => usarFiltro(filtroRapido)} tono={TONO_FILTRO[filtroRapido]} />)}
        </div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filtrar existencias por local">
          {ubicaciones.filter((ubicacion) => ubicacion.activa).map((ubicacion) => <FiltroLocal key={ubicacion.id} ubicacion={ubicacion} activo={ubicacion.id === ubicacionElegida?.id} onClick={() => cambiarFiltro(setParametros, 'ubicacion', ubicacion.id)} />)}
        </div>
        <div role="status" className="flex min-h-6 items-center gap-2 px-1 text-[0.75rem] text-tinta-suave">
          <span className="flex min-w-0 flex-1 items-center gap-1 truncate" title={`Mostrando existencias en ${ubicacionElegida?.nombre ?? 'todas las ubicaciones'}`}><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{ubicacionElegida?.nombre ?? 'Todas las ubicaciones'}</span>
          {etiquetaResultados !== '' && <span className="shrink-0">{etiquetaResultados}</span>}
          {!buscando && !hayFiltros && <span className="shrink-0 text-etiqueta text-tinta-tenue uppercase">Últimos productos</span>}
        </div>

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
        {resultados.isError && (
          <ErrorEnPantalla
            mensaje="No se pudo buscar. Revisa la conexión."
            onReintentar={() => void resultados.refetch()}
          />
        )}

        {resultados.isPending && <Esqueleto filas={4} />}

        {resultados.isSuccess && productos.length === 0 && (
          <Vacio
            titulo={buscando ? 'Nada con esa búsqueda' : hayFiltros ? 'No hay equipos con estos filtros' : 'Todavía no hay productos'}
            detalle={
              hayFiltros ? 'Quita un filtro o cambia la ubicación de arriba.' : buscando
                ? 'Prueba con menos palabras, o escanea el codigo del producto.'
                : 'Escanea el codigo de un producto para darlo de alta.'
            }
            accion={hayFiltros ? { texto: 'Quitar filtros', onClick: () => setParametros({ q: texto }, { replace: true }) } : { texto: 'Escanear un código', onClick: () => navegar('/escanear') }}
          />
        )}

        {productos.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1"><p className="text-etiqueta text-tinta-tenue uppercase">{vista.modo === 'lista' ? 'Lista' : `${vista.columnas} columnas`}</p><button type="button" aria-expanded={opcionesVista} onClick={() => setOpcionesVista(!opcionesVista)} className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-[0.8125rem] font-semibold text-accion active:bg-accion-tenue"><IconoVista /><span>Vista</span></button></div>
            {opcionesVista && <ControlesVista vista={vista} onChange={(nueva) => { setVista(nueva); guardarVistaBusqueda(nueva) }} />}
            {vista.modo === 'lista' ? <ul className={`flex flex-col gap-2 ${resultados.isPlaceholderData ? 'pointer-events-none opacity-60' : ''}`} aria-busy={resultados.isFetching}>{productos.map((producto) => <li key={producto.id}><RenglonProducto producto={producto} coincidencia={producto.coincidencia} ubicacionId={ubicacionElegida?.id} onClick={() => abrirProducto(producto.id, resultados.isPlaceholderData, texto, consulta, recientes, navegar, setRecientes)} /></li>)}</ul> : <ul className={`grid gap-2 ${vista.columnas === 1 ? 'grid-cols-1' : vista.columnas === 2 ? 'grid-cols-2' : 'grid-cols-3'} ${resultados.isPlaceholderData ? 'pointer-events-none opacity-60' : ''}`} aria-busy={resultados.isFetching}>{productos.map((producto) => <li key={producto.id}><TarjetaBusqueda producto={producto} imagen={vista.imagen} ubicacionId={ubicacionElegida?.id} onClick={() => abrirProducto(producto.id, resultados.isPlaceholderData, texto, consulta, recientes, navegar, setRecientes)} /></li>)}</ul>}
          </>
        )}
      </div>
    </Marco>
  )
}

function cambiarFiltro(setParametros: ReturnType<typeof useSearchParams>[1], clave: string, valor: string | null) { setParametros(previos => { const nuevos = new URLSearchParams(previos); if (valor === null) nuevos.delete(clave); else nuevos.set(clave, valor); return nuevos }, { replace: true }) }

function abrirProducto(id: string, pendiente: boolean, texto: string, consulta: string, recientes: string[], navegar: ReturnType<typeof useNavigate>, setRecientes: (v: string[]) => void) { if (pendiente || texto !== consulta) return; const nuevas = recordarBusqueda(recientes, consulta); guardarBusquedas(nuevas); setRecientes(nuevas); navegar(`/producto/${id}`) }

const NOMBRE_FILTRO: Record<FiltroEquipoRapido, string> = { registered: 'Registrados', not_registered: 'No registrados', new: 'Nuevos', used: 'Segunda mano' }
const TONO_FILTRO: Record<FiltroEquipoRapido, 'exito' | 'falta' | 'accion' | 'alerta'> = { registered: 'exito', not_registered: 'falta', new: 'accion', used: 'alerta' }
const ICONO_FILTRO = { registered: BadgeCheck, not_registered: ShieldAlert, new: Sparkles, used: RefreshCw } as const

function FiltroRapido({ activo, texto, onClick, tono, icono: Icono }: { activo: boolean; texto: string; onClick: () => void; tono: 'exito' | 'falta' | 'accion' | 'alerta'; icono?: LucideIcon }) { const activoClase = tono === 'exito' ? 'border-exito bg-exito-tenue text-exito' : tono === 'falta' ? 'border-falta bg-falta-tenue text-falta' : tono === 'alerta' ? 'border-alerta bg-alerta-tenue text-alerta' : 'border-accion bg-accion-tenue text-accion'; return <button type="button" aria-pressed={activo} onClick={onClick} className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-semibold transition ${activo ? activoClase : 'border-borde bg-superficie text-tinta-suave'}`}>{Icono !== undefined && <Icono aria-hidden="true" className="size-4" strokeWidth={2} />}{texto}</button> }

function FiltroLocal({ ubicacion, activo, onClick }: { ubicacion: ReturnType<typeof useUbicacion>['ubicaciones'][number]; activo: boolean; onClick: () => void }) {
  const color = ubicacion.color ?? '#315DB8'
  return <button type="button" aria-pressed={activo} onClick={onClick} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-semibold transition" style={{ borderColor: color, backgroundColor: activo ? `${color}1f` : undefined, color }}><IconoUbicacion icono={ubicacion.icono} tipo={ubicacion.tipo} className="size-4" /><span>{ubicacion.nombre}</span></button>
}

function ControlesVista({ vista, onChange }: { vista: PreferenciasVistaBusqueda; onChange: (vista: PreferenciasVistaBusqueda) => void }) { return <div className="rounded-2xl border border-borde bg-superficie p-3"><div className="grid grid-cols-2 gap-2"><FiltroRapido activo={vista.modo === 'lista'} texto="Lista" icono={List} onClick={() => onChange({ ...vista, modo: 'lista' })} tono="accion" /><FiltroRapido activo={vista.modo === 'cuadricula'} texto="Cuadrícula" icono={Grid3X3} onClick={() => onChange({ ...vista, modo: 'cuadricula' })} tono="accion" /></div>{vista.modo === 'cuadricula' && <><p className="mt-3 text-[0.75rem] font-semibold text-tinta-suave">Columnas</p><div className="mt-1 grid grid-cols-3 gap-2">{([1, 2, 3] as const).map((columnas) => <FiltroRapido key={columnas} activo={vista.columnas === columnas} texto={`${columnas}`} onClick={() => onChange({ ...vista, columnas })} tono="accion" />)}</div><p className="mt-3 text-[0.75rem] font-semibold text-tinta-suave">Tamaño de imagen</p><div className="mt-1 grid grid-cols-3 gap-2">{(['pequena', 'mediana', 'grande'] as const).map((imagen) => <FiltroRapido key={imagen} activo={vista.imagen === imagen} texto={imagen === 'pequena' ? 'Pequeña' : imagen === 'mediana' ? 'Mediana' : 'Grande'} onClick={() => onChange({ ...vista, imagen })} tono="accion" />)}</div></>}</div> }

function TarjetaBusqueda({ producto, imagen, ubicacionId, onClick }: { producto: ProductoConStock; imagen: PreferenciasVistaBusqueda['imagen']; ubicacionId?: string; onClick: () => void }) { const cantidad = ubicacionId === undefined ? producto.stockTotal : producto.stock.find((fila) => fila.ubicacionId === ubicacionId)?.cantidad ?? 0; const claseImagen = imagen === 'pequena' ? 'scale-75' : imagen === 'grande' ? 'scale-110' : ''; return <button type="button" onClick={onClick} className="flex h-[11.5rem] w-full flex-col overflow-hidden rounded-2xl border border-borde bg-superficie p-2.5 text-left transition active:scale-[0.98] active:bg-papel-hundido"><div className="flex h-[4.75rem] shrink-0 items-center justify-center overflow-hidden"><span className={claseImagen}><Miniatura nombre={producto.nombre} claveImagen={producto.claveImagen} tamano={imagen === 'grande' ? 'grande' : 'normal'} /></span></div><p className="mt-2 line-clamp-2 min-h-[2.25rem] overflow-hidden break-words text-[0.8125rem] leading-snug font-semibold">{producto.nombre}</p><p className="mt-auto cifras text-[1.125rem] font-semibold text-accion">{cantidad}</p></button> }

function IconoVista() { return <Grid3X3 className="size-4" strokeWidth={1.8} aria-hidden="true" /> }
