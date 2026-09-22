/**
 * Búsqueda de productos en el inventario.
 *
 * Diseño limpio, ágil y simétrico:
 * - Barra de búsqueda con acceso directo a escaneo por cámara/código.
 * - Chips horizontales de acceso rápido (Ubicación, Vendidos, Lista Blanca, Filtros).
 * - Panel inferior (HojaInferior) para filtros avanzados de variantes (RAM, Almacenamiento, Color, Condición).
 * - Conmutador instantáneo de vista (Lista / Cuadrícula).
 * - Resultados en tiempo real sin recargar la pantalla.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  Grid3X3,
  List,
  MapPin,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  ShieldAlert,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { api } from '../api/cliente'
import { ErrorEnPantalla, Esqueleto, Vacio } from '../componentes/Estados'
import { Miniatura, RenglonProducto } from '../componentes/FichaProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { IconoUbicacion } from '../componentes/IconoUbicacion'
import { Marco } from '../componentes/Marco'
import { useUbicacion } from '../contexto/Ubicacion'
import type { ResultadoBusqueda } from '@compartido/tipos'
import {
  OPCIONES_ALMACENAMIENTO,
  OPCIONES_COLOR,
  OPCIONES_RAM,
} from '@compartido/variantes'
import {
  guardarBusquedas,
  guardarVistaBusqueda,
  leerBusquedas,
  leerVistaBusqueda,
  recordarBusqueda,
  type PreferenciasVistaBusqueda,
} from '../lib/inventario'

/** Tiempo de espera antes de consultar para evitar peticiones redundantes */
const MS_ESPERA = 120

export function Buscar() {
  const navegar = useNavigate()
  const { activa, ubicaciones } = useUbicacion()
  const [parametros, setParametros] = useSearchParams()

  const q = parametros.get('q') ?? ''
  const valorListaBlanca = parametros.get('listaBlanca')
  const listaBlanca: 'registered' | 'not_registered' | undefined =
    valorListaBlanca === 'registered' || valorListaBlanca === 'not_registered'
      ? valorListaBlanca
      : undefined

  const valorCondicion = parametros.get('condicion')
  const condicion: 'new' | 'used' | undefined =
    valorCondicion === 'new' || valorCondicion === 'used'
      ? valorCondicion
      : undefined

  const vendidos = parametros.get('vendidos') === '1'
  const ram = parametros.get('ram') ?? ''
  const almacenamiento = parametros.get('almacenamiento') ?? ''
  const color = parametros.get('color') ?? ''

  const ubicacionesActivas = ubicaciones.filter((u) => u.activa)
  const parametroUbicacion = parametros.get('ubicacion')
  const ubicacionElegida =
    parametroUbicacion === 'todas'
      ? undefined
      : (ubicaciones.find((u) => u.id === parametroUbicacion) ?? activa)

  const ubicacionIdFiltro =
    vendidos && !parametros.has('ubicacion') ? undefined : ubicacionElegida?.id
  const filtroStock = vendidos ? 'todos' : 'disponibles'

  const [recientes, setRecientes] = useState(leerBusquedas)
  const [vista, setVista] = useState<PreferenciasVistaBusqueda>(leerVistaBusqueda)
  const [panelFiltrosAbierto, setPanelFiltrosAbierto] = useState(false)
  const [menuUbicacionAbierto, setMenuUbicacionAbierto] = useState(false)

  const [texto, setTexto] = useState(q)
  const [consulta, setConsulta] = useState(q)
  const refCampo = useRef<HTMLInputElement | null>(null)

  // Autofoco al entrar a la pantalla
  useEffect(() => {
    if (!parametros.has('filtro')) {
      refCampo.current?.focus()
    }
  }, [])

  useEffect(() => {
    setTexto(q)
    setConsulta(q)
  }, [q])

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setConsulta(texto)
      if (texto !== q) {
        setParametros(
          (previos) => {
            const nuevos = new URLSearchParams(previos)
            if (texto.trim()) nuevos.set('q', texto)
            else nuevos.delete('q')
            return nuevos
          },
          { replace: true },
        )
      }
    }, MS_ESPERA)
    return () => window.clearTimeout(temporizador)
  }, [texto, q, setParametros])

  const resultados = useQuery({
    queryKey: [
      'buscar',
      consulta,
      ram,
      almacenamiento,
      color,
      ubicacionIdFiltro,
      filtroStock,
      listaBlanca,
      condicion,
      vendidos,
    ],
    queryFn: ({ signal }) =>
      api.buscar(consulta, signal, {
        ram,
        almacenamiento,
        color,
        ubicacionId: ubicacionIdFiltro,
        filtro: filtroStock,
        listaBlanca: listaBlanca ?? undefined,
        condicion: condicion ?? undefined,
        vendidos,
      }),
    placeholderData: (previas, anterior) =>
      anterior &&
      anterior.queryKey[5] === ubicacionIdFiltro &&
      anterior.queryKey[6] === filtroStock &&
      anterior.queryKey[7] === listaBlanca &&
      anterior.queryKey[8] === condicion &&
      anterior.queryKey[9] === vendidos
        ? keepPreviousData(previas)
        : undefined,
  })

  const productos = resultados.data?.productos ?? []
  const buscando =
    consulta.trim().length > 0 ||
    ram !== '' ||
    almacenamiento !== '' ||
    color !== ''
  const hayFiltros =
    listaBlanca !== undefined ||
    condicion !== undefined ||
    vendidos ||
    ram !== '' ||
    almacenamiento !== '' ||
    color !== '' ||
    parametroUbicacion !== null

  // Contabilizar filtros avanzados activos
  const filtrosAvanzadosActivos = [
    ram !== '',
    almacenamiento !== '',
    color !== '',
    condicion !== undefined,
  ].filter(Boolean).length

  const alternarVista = (modo: 'lista' | 'cuadricula') => {
    const nueva = { ...vista, modo }
    setVista(nueva)
    guardarVistaBusqueda(nueva)
  }

  const limpiarTodosLosFiltros = () => {
    setParametros(
      (previos) => {
        const nuevos = new URLSearchParams()
        const textoActual = previos.get('q')
        if (textoActual) nuevos.set('q', textoActual)
        return nuevos
      },
      { replace: true },
    )
  }

  const cambiarUbicacion = (id?: string) => {
    setParametros(
      (previos) => {
        const nuevos = new URLSearchParams(previos)
        if (id) nuevos.set('ubicacion', id)
        else nuevos.set('ubicacion', 'todas')
        return nuevos
      },
      { replace: true },
    )
    setMenuUbicacionAbierto(false)
  }

  const alternarVendidos = () => {
    setParametros(
      (previos) => {
        const nuevos = new URLSearchParams(previos)
        if (vendidos) {
          nuevos.delete('vendidos')
        } else {
          nuevos.set('vendidos', '1')
          nuevos.delete('ubicacion')
        }
        return nuevos
      },
      { replace: true },
    )
  }

  const alternarListaBlanca = (tipo: 'registered' | 'not_registered') => {
    setParametros(
      (previos) => {
        const nuevos = new URLSearchParams(previos)
        if (listaBlanca === tipo) nuevos.delete('listaBlanca')
        else nuevos.set('listaBlanca', tipo)
        return nuevos
      },
      { replace: true },
    )
  }

  return (
    <Marco titulo="Buscar" atras>
      <div className="flex flex-col gap-3">
        {/* =================================================================== */}
        {/* 1. BARRA DE BÚSQUEDA Y ESCANEO DIRECTO                             */}
        {/* =================================================================== */}
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3.5 size-5 text-tinta-tenue select-none"
            aria-hidden="true"
            strokeWidth={2}
          />

          <input
            ref={refCampo}
            type="search"
            value={texto}
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const nuevas = recordarBusqueda(recientes, texto)
                setRecientes(nuevas)
                guardarBusquedas(nuevas)
                refCampo.current?.blur()
              }
            }}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar modelo, marca o IMEI..."
            aria-label="Buscar productos"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-h-12 w-full rounded-2xl border border-borde bg-superficie pl-11 pr-22 text-[0.9375rem] text-tinta placeholder:text-tinta-tenue transition focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15 [&::-webkit-search-cancel-button]:hidden shadow-2xs"
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            {texto.length > 0 && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setTexto('')
                  refCampo.current?.focus()
                }}
                className="inline-flex size-9 items-center justify-center rounded-xl text-tinta-tenue transition active:bg-papel-hundido hover:text-tinta"
              >
                <X className="size-4" strokeWidth={2.5} />
              </button>
            )}

            <button
              type="button"
              aria-label="Escanear código de barras o IMEI"
              title="Abrir escáner"
              onClick={() => navegar('/escanear')}
              className="inline-flex size-9 items-center justify-center rounded-xl bg-papel-hundido text-tinta-suave transition active:scale-95 hover:bg-accion-tenue hover:text-accion"
            >
              <ScanBarcode className="size-4.5" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 2. CHIPS DE FILTRO RÁPIDO HORIZONTALES (Deslizables y compactos)   */}
        {/* =================================================================== */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {/* Selector de Ubicación */}
          <button
            type="button"
            onClick={() => setMenuUbicacionAbierto(true)}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
              parametroUbicacion
                ? 'border-accion bg-accion-tenue text-accion shadow-2xs'
                : 'border-borde bg-superficie text-tinta hover:border-borde-fuerte'
            }`}
          >
            <MapPin className="size-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate max-w-[130px]">
              {parametroUbicacion === 'todas'
                ? 'Todas las sedes'
                : (ubicacionElegida?.nombre ?? 'Ubicación')}
            </span>
            <ChevronDown className="size-3 shrink-0 text-tinta-tenue" />
          </button>

          {/* Toggle Vendidos */}
          <button
            type="button"
            onClick={alternarVendidos}
            aria-pressed={vendidos}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
              vendidos
                ? 'border-falta bg-falta text-white shadow-xs'
                : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte'
            }`}
          >
            <ShoppingBag className="size-3.5 shrink-0" strokeWidth={2} />
            <span>Vendidos</span>
          </button>

          {/* Toggle Registrados (Lista blanca) */}
          <button
            type="button"
            onClick={() => alternarListaBlanca('registered')}
            aria-pressed={listaBlanca === 'registered'}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
              listaBlanca === 'registered'
                ? 'border-exito bg-exito text-white shadow-xs'
                : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte'
            }`}
          >
            <BadgeCheck className="size-3.5 shrink-0" strokeWidth={2} />
            <span>Registrados</span>
          </button>

          {/* Toggle No Registrados */}
          <button
            type="button"
            onClick={() => alternarListaBlanca('not_registered')}
            aria-pressed={listaBlanca === 'not_registered'}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
              listaBlanca === 'not_registered'
                ? 'border-falta bg-falta-tenue text-falta font-bold'
                : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte'
            }`}
          >
            <ShieldAlert className="size-3.5 shrink-0" strokeWidth={2} />
            <span>No registrados</span>
          </button>

          {/* Botón Filtros Avanzados (Abre HojaInferior) */}
          <button
            type="button"
            onClick={() => setPanelFiltrosAbierto(true)}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
              filtrosAvanzadosActivos > 0
                ? 'border-accion bg-accion text-white shadow-xs'
                : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte'
            }`}
          >
            <SlidersHorizontal className="size-3.5 shrink-0" strokeWidth={2} />
            <span>Filtros</span>
            {filtrosAvanzadosActivos > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-white text-[0.625rem] font-bold text-accion">
                {filtrosAvanzadosActivos}
              </span>
            )}
          </button>
        </div>

        {/* =================================================================== */}
        {/* 3. ETIQUETAS DE FILTROS ACTIVOS (Removibles con un toque)          */}
        {/* =================================================================== */}
        {filtrosAvanzadosActivos > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-0.5">
            {ram && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-accion/30 bg-accion-tenue px-2 py-1 text-[0.75rem] font-semibold text-accion">
                RAM: {ram}GB
                <button
                  type="button"
                  onClick={() =>
                    setParametros((prev) => {
                      const n = new URLSearchParams(prev)
                      n.delete('ram')
                      return n
                    }, { replace: true })
                  }
                  className="rounded-full hover:bg-accion/20 p-0.5"
                >
                  <X className="size-3" strokeWidth={2.5} />
                </button>
              </span>
            )}
            {almacenamiento && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-accion/30 bg-accion-tenue px-2 py-1 text-[0.75rem] font-semibold text-accion">
                Alm: {almacenamiento}GB
                <button
                  type="button"
                  onClick={() =>
                    setParametros((prev) => {
                      const n = new URLSearchParams(prev)
                      n.delete('almacenamiento')
                      return n
                    }, { replace: true })
                  }
                  className="rounded-full hover:bg-accion/20 p-0.5"
                >
                  <X className="size-3" strokeWidth={2.5} />
                </button>
              </span>
            )}
            {color && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-accion/30 bg-accion-tenue px-2 py-1 text-[0.75rem] font-semibold text-accion">
                Color: {color}
                <button
                  type="button"
                  onClick={() =>
                    setParametros((prev) => {
                      const n = new URLSearchParams(prev)
                      n.delete('color')
                      return n
                    }, { replace: true })
                  }
                  className="rounded-full hover:bg-accion/20 p-0.5"
                >
                  <X className="size-3" strokeWidth={2.5} />
                </button>
              </span>
            )}
            {condicion && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-accion/30 bg-accion-tenue px-2 py-1 text-[0.75rem] font-semibold text-accion">
                {condicion === 'new' ? 'Nuevo' : 'Segunda mano'}
                <button
                  type="button"
                  onClick={() =>
                    setParametros((prev) => {
                      const n = new URLSearchParams(prev)
                      n.delete('condicion')
                      return n
                    }, { replace: true })
                  }
                  className="rounded-full hover:bg-accion/20 p-0.5"
                >
                  <X className="size-3" strokeWidth={2.5} />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={limpiarTodosLosFiltros}
              className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-tinta-tenue hover:text-falta transition px-1"
            >
              <RotateCcw className="size-3" strokeWidth={2} />
              Limpiar
            </button>
          </div>
        )}

        {/* =================================================================== */}
        {/* 4. RESUMEN DE RESULTADOS Y CONMUTADOR DE VISTA                     */}
        {/* =================================================================== */}
        <div className="flex items-center justify-between px-1 text-[0.8125rem] text-tinta-suave">
          <div className="flex items-center gap-2 truncate">
            {resultados.isFetching || texto !== consulta ? (
              <span className="font-medium text-accion animate-pulse">Buscando productos…</span>
            ) : resultados.isSuccess ? (
              <span className="font-semibold text-tinta">
                {productos.length}{' '}
                <span className="font-normal text-tinta-suave">
                  {productos.length === 1 ? 'producto' : 'productos'}
                  {vendidos ? ' vendidos' : ' en catálogo'}
                </span>
              </span>
            ) : null}
          </div>

          {/* Conmutador de vista Lista / Cuadrícula */}
          {productos.length > 0 && (
            <div className="inline-flex items-center rounded-xl bg-papel-hundido p-1 border border-borde">
              <button
                type="button"
                aria-label="Vista de lista"
                onClick={() => alternarVista('lista')}
                className={`inline-flex size-7 items-center justify-center rounded-lg transition ${
                  vista.modo === 'lista'
                    ? 'bg-white text-accion shadow-2xs'
                    : 'text-tinta-tenue hover:text-tinta'
                }`}
              >
                <List className="size-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Vista de cuadrícula"
                onClick={() => alternarVista('cuadricula')}
                className={`inline-flex size-7 items-center justify-center rounded-lg transition ${
                  vista.modo === 'cuadricula'
                    ? 'bg-white text-accion shadow-2xs'
                    : 'text-tinta-tenue hover:text-tinta'
                }`}
              >
                <Grid3X3 className="size-4" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* 5. BÚSQUEDAS RECIENTES (Cuando el campo está vacío)                */}
        {/* =================================================================== */}
        {!texto && recientes.length > 0 && (
          <section
            aria-label="Búsquedas recientes"
            className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-tinta">
                <Clock className="size-3.5 text-tinta-tenue" strokeWidth={2} />
                Búsquedas recientes
              </span>
              <button
                type="button"
                onClick={() => {
                  setRecientes([])
                  guardarBusquedas([])
                }}
                className="text-[0.75rem] font-semibold text-falta hover:underline"
              >
                Borrar historial
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {recientes.map((reciente) => (
                <button
                  key={reciente}
                  type="button"
                  onClick={() => setTexto(reciente)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-xl bg-papel-hundido px-2.5 text-[0.8125rem] font-medium text-tinta transition active:scale-95 hover:bg-accion-tenue hover:text-accion"
                >
                  <Search className="size-3 text-tinta-tenue" strokeWidth={2} />
                  <span>{reciente}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* 6. ESTADOS DE CARGA, ERROR O VACÍO                                */}
        {/* =================================================================== */}
        {resultados.isError && (
          <ErrorEnPantalla
            mensaje="No se pudo realizar la búsqueda. Comprueba tu conexión."
            onReintentar={() => void resultados.refetch()}
          />
        )}

        {resultados.isPending && <Esqueleto filas={5} />}

        {resultados.isSuccess && productos.length === 0 && (
          <Vacio
            titulo={
              buscando
                ? 'Sin coincidencias'
                : vendidos
                  ? 'No hay ventas registradas'
                  : hayFiltros
                    ? 'Sin resultados con estos filtros'
                    : 'Catálogo vacío'
            }
            detalle={
              vendidos
                ? 'No se encontraron equipos vendidos en la ubicación seleccionada.'
                : hayFiltros
                  ? 'Prueba modificando o eliminando los filtros activos.'
                  : buscando
                    ? 'No encontramos ningún producto que coincida con ese término.'
                    : 'Escanea un código para registrar el primer producto.'
            }
            accion={
              hayFiltros
                ? {
                    texto: 'Limpiar filtros',
                    onClick: limpiarTodosLosFiltros,
                  }
                : {
                    texto: 'Escanear producto',
                    onClick: () => navegar('/escanear'),
                  }
            }
          />
        )}

        {/* =================================================================== */}
        {/* 7. RESULTADOS (Lista o Cuadrícula)                                */}
        {/* =================================================================== */}
        {productos.length > 0 && (
          <>
            {vista.modo === 'lista' ? (
              <ul
                className={`flex flex-col gap-2 ${
                  resultados.isPlaceholderData ? 'pointer-events-none opacity-60' : ''
                }`}
                aria-busy={resultados.isFetching}
              >
                {productos.map((producto) => (
                  <li key={producto.id}>
                    <RenglonProducto
                      producto={producto}
                      coincidencia={producto.coincidencia}
                      ubicacionId={ubicacionIdFiltro}
                      cantidadVisible={producto.equiposCoincidentes}
                      etiquetaCantidad={
                        producto.equiposCoincidentes === undefined
                          ? undefined
                          : vendidos
                            ? 'vendidos'
                            : 'equipos'
                      }
                      onClick={() =>
                        abrirProducto(
                          producto.id,
                          ubicacionIdFiltro,
                          resultados.isPlaceholderData,
                          texto,
                          consulta,
                          recientes,
                          navegar,
                          setRecientes,
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ul
                className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 ${
                  resultados.isPlaceholderData ? 'pointer-events-none opacity-60' : ''
                }`}
                aria-busy={resultados.isFetching}
              >
                {productos.map((producto) => (
                  <li key={producto.id}>
                    <TarjetaBusquedaModerna
                      producto={producto}
                      ubicacionId={ubicacionIdFiltro}
                      onClick={() =>
                        abrirProducto(
                          producto.id,
                          ubicacionIdFiltro,
                          resultados.isPlaceholderData,
                          texto,
                          consulta,
                          recientes,
                          navegar,
                          setRecientes,
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* =================================================================== */}
      {/* 8. MODAL / HOJA DE SELECCIÓN DE UBICACIÓN                           */}
      {/* =================================================================== */}
      <HojaInferior
        abierta={menuUbicacionAbierto}
        onCerrar={() => setMenuUbicacionAbierto(false)}
        titulo="Seleccionar ubicación"
      >
        <div className="flex flex-col gap-2 py-2">
          {/* Opción: Todas las sedes */}
          <button
            type="button"
            onClick={() => cambiarUbicacion(undefined)}
            className={`flex w-full items-center justify-between rounded-xl border p-3.5 transition active:scale-[0.99] ${
              parametroUbicacion === 'todas'
                ? 'border-accion bg-accion-tenue text-accion font-bold'
                : 'border-borde bg-superficie text-tinta hover:bg-papel-hundido'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-papel-hundido text-tinta-suave">
                <MapPin className="size-5" strokeWidth={2} />
              </div>
              <div className="text-left">
                <p className="text-[0.9375rem] font-semibold leading-tight">Todas las sedes</p>
                <p className="text-[0.75rem] font-normal text-tinta-suave">Ver inventario global consolidado</p>
              </div>
            </div>
            {parametroUbicacion === 'todas' && <Check className="size-5 text-accion" strokeWidth={2.5} />}
          </button>

          {/* Opciones individuales */}
          {ubicacionesActivas.map((u) => {
            const seleccionada = parametroUbicacion === u.id || (!parametroUbicacion && u.id === activa?.id)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => cambiarUbicacion(u.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-3.5 transition active:scale-[0.99] ${
                  seleccionada
                    ? 'border-accion bg-accion-tenue text-accion font-bold'
                    : 'border-borde bg-superficie text-tinta hover:bg-papel-hundido'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-9 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: u.color ?? '#315DB8' }}
                  >
                    <IconoUbicacion icono={u.icono} tipo={u.tipo} className="size-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-[0.9375rem] font-semibold leading-tight">{u.nombre}</p>
                    <p className="text-[0.75rem] font-normal text-tinta-suave capitalize">{u.tipo === 'store' ? 'Tienda / Sucursal' : 'Almacén central'}</p>
                  </div>
                </div>
                {seleccionada && <Check className="size-5 text-accion" strokeWidth={2.5} />}
              </button>
            )
          })}
        </div>
      </HojaInferior>

      {/* =================================================================== */}
      {/* 9. HOJA INFERIOR DE FILTROS AVANZADOS (RAM, Alm, Color, Condición)   */}
      {/* =================================================================== */}
      <HojaInferior
        abierta={panelFiltrosAbierto}
        onCerrar={() => setPanelFiltrosAbierto(false)}
        titulo="Filtros de búsqueda"
      >
        <div className="flex flex-col gap-4 py-2">
          {/* Fila simétrica con los 3 desplegables: RAM, Almacenamiento y Color */}
          <div>
            <p className="mb-2 text-[0.8125rem] font-bold text-tinta">Variantes de hardware</p>
            <div className="grid grid-cols-3 gap-2 w-full">
              <SelectorDesplegable
                etiqueta="RAM"
                valor={ram}
                opciones={OPCIONES_RAM}
                onCambiar={(val) =>
                  setParametros(
                    (prev) => {
                      const n = new URLSearchParams(prev)
                      if (val) n.set('ram', val)
                      else n.delete('ram')
                      return n
                    },
                    { replace: true },
                  )
                }
              />
              <SelectorDesplegable
                etiqueta="Almacenamiento"
                valor={almacenamiento}
                opciones={OPCIONES_ALMACENAMIENTO}
                onCambiar={(val) =>
                  setParametros(
                    (prev) => {
                      const n = new URLSearchParams(prev)
                      if (val) n.set('almacenamiento', val)
                      else n.delete('almacenamiento')
                      return n
                    },
                    { replace: true },
                  )
                }
              />
              <SelectorDesplegable
                etiqueta="Color"
                valor={color}
                opciones={OPCIONES_COLOR}
                onCambiar={(val) =>
                  setParametros(
                    (prev) => {
                      const n = new URLSearchParams(prev)
                      if (val) n.set('color', val)
                      else n.delete('color')
                      return n
                    },
                    { replace: true },
                  )
                }
              />
            </div>
          </div>

          {/* Condición de los equipos */}
          <div>
            <p className="mb-2 text-[0.8125rem] font-bold text-tinta">Condición del equipo</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  setParametros(
                    (prev) => {
                      const n = new URLSearchParams(prev)
                      n.delete('condicion')
                      return n
                    },
                    { replace: true },
                  )
                }
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
                  condicion === undefined
                    ? 'border-accion bg-accion-tenue text-accion font-bold'
                    : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() =>
                  setParametros(
                    (prev) => {
                      const n = new URLSearchParams(prev)
                      n.set('condicion', 'new')
                      return n
                    },
                    { replace: true },
                  )
                }
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
                  condicion === 'new'
                    ? 'border-accion bg-accion text-white shadow-xs'
                    : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte'
                }`}
              >
                <Sparkles className="size-3.5 shrink-0" strokeWidth={2} />
                Nuevos
              </button>
              <button
                type="button"
                onClick={() =>
                  setParametros(
                    (prev) => {
                      const n = new URLSearchParams(prev)
                      n.set('condicion', 'used')
                      return n
                    },
                    { replace: true },
                  )
                }
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-[0.8125rem] font-semibold transition leading-none active:scale-95 ${
                  condicion === 'used'
                    ? 'border-alerta bg-alerta text-white shadow-xs'
                    : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte'
                }`}
              >
                <RefreshCw className="size-3.5 shrink-0" strokeWidth={2} />
                Segunda mano
              </button>
            </div>
          </div>

          {/* Botones de acción del panel */}
          <div className="mt-2 flex items-center gap-2 pt-2 border-t border-borde">
            <button
              type="button"
              onClick={() => {
                limpiarTodosLosFiltros()
                setPanelFiltrosAbierto(false)
              }}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-borde-fuerte bg-superficie text-[0.9375rem] font-semibold text-tinta transition active:bg-papel-hundido"
            >
              Restablecer
            </button>
            <button
              type="button"
              onClick={() => setPanelFiltrosAbierto(false)}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-accion text-[0.9375rem] font-semibold text-white shadow-xs transition active:bg-accion-viva"
            >
              Ver resultados
            </button>
          </div>
        </div>
      </HojaInferior>
    </Marco>
  )
}

/** Componente simétrico de selector desplegable para variantes */
function SelectorDesplegable({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  etiqueta: string
  valor: string
  opciones: readonly string[]
  onCambiar: (valor: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 w-full">
      <span className="truncate text-[0.75rem] font-bold text-tinta-suave">{etiqueta}</span>
      <div className="relative flex items-center w-full">
        <select
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          className="min-h-11 w-full appearance-none rounded-xl border border-borde bg-papel px-2.5 pr-7 text-[0.8125rem] font-semibold text-tinta transition cursor-pointer focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15"
        >
          <option value="">Todos</option>
          {opciones.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 text-tinta-tenue select-none">
          <ChevronDown className="size-3.5" strokeWidth={2.5} />
        </span>
      </div>
    </label>
  )
}

/** Tarjeta visual moderna para el modo cuadrícula */
function TarjetaBusquedaModerna({
  producto,
  ubicacionId,
  onClick,
}: {
  producto: ResultadoBusqueda
  ubicacionId?: string
  onClick: () => void
}) {
  const cantidad =
    ubicacionId === undefined
      ? producto.stockTotal
      : (producto.stock.find((fila) => fila.ubicacionId === ubicacionId)?.cantidad ?? 0)
  const cantidadVisible = producto.equiposCoincidentes ?? cantidad

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[13rem] w-full flex-col justify-between overflow-hidden rounded-2xl border border-borde bg-superficie p-3 text-left transition active:scale-[0.98] hover:border-borde-fuerte shadow-2xs group"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden py-1 w-full">
        <Miniatura
          nombre={producto.nombre}
          claveImagen={producto.claveImagen}
          tamano="normal"
          forma="vertical"
        />
      </div>

      <div className="mt-2 flex flex-col gap-1 w-full">
        <div className="flex items-start justify-between gap-1">
          <p
            title={producto.nombre}
            className="min-w-0 flex-1 text-[0.8125rem] leading-snug font-bold text-tinta line-clamp-2 group-hover:text-accion transition-colors"
          >
            {producto.nombre}
          </p>
          <span
            title="Existencias disponibles"
            className="shrink-0 inline-flex items-center justify-center rounded-lg bg-accion-tenue px-2 py-0.5 text-[0.8125rem] font-bold text-accion cifras leading-none"
          >
            {cantidadVisible}
          </span>
        </div>

        {producto.marca && (
          <p className="text-[0.6875rem] font-medium text-tinta-tenue truncate">
            {producto.marca}
          </p>
        )}
      </div>
    </button>
  )
}

/** Navegación a la ficha del producto guardando historial */
function abrirProducto(
  id: string,
  ubicacionId: string | undefined,
  pendiente: boolean,
  texto: string,
  consulta: string,
  recientes: string[],
  navegar: ReturnType<typeof useNavigate>,
  setRecientes: (v: string[]) => void,
) {
  if (pendiente || texto !== consulta) return
  const nuevas = recordarBusqueda(recientes, consulta)
  guardarBusquedas(nuevas)
  setRecientes(nuevas)
  const parametros = new URLSearchParams()
  if (ubicacionId !== undefined) parametros.set('ubicacion', ubicacionId)
  navegar(`/producto/${id}${parametros.size > 0 ? `?${parametros}` : ''}`)
}
