/**
 * Ficha de Producto rediseñada desde cero.
 *
 * Estructura limpia, ágil y simétrica:
 * 1. Tarjeta principal (Hero) con miniatura grande, datos esenciales y KPIs financieros/stock.
 * 2. Barra de acciones rápidas (Vender, Mover/Ajustar, + Registrar IMEI).
 * 3. Navegación por pestañas (Existencias y Equipos, Detalles y Fotos, Historial).
 * 4. Gestión integral de unidades físicas con búsqueda interna de IMEI.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Camera,
  Check,
  Copy,
  Edit3,
  History,
  ImageUp,
  Info,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { ErrorDeApi, api, urlDeImagen } from '../api/cliente'
import { AccionesProducto } from '../componentes/AccionesProducto'
import { SugerenciaReposicion } from '../componentes/SugerenciaReposicion'
import { Boton } from '../componentes/Boton'
import { ErrorEnPantalla, Esqueleto, Vacio } from '../componentes/Estados'
import { DesgloseStock, Miniatura } from '../componentes/FichaProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { CampoSelect, CampoTexto } from '../componentes/Campo'
import { CampoMarcaPredictivo } from '../componentes/CampoMarcaPredictivo'
import { Confirmacion } from '../componentes/Confirmacion'
import { Marco } from '../componentes/Marco'
import { ModalRecorteImagen } from '../componentes/ModalRecorteImagen'
import { IconoUbicacion } from '../componentes/IconoUbicacion'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { NOMBRE_MOVIMIENTO, cuandoFue, dinero, fechaLarga, numero } from '../lib/formato'
import { prepararFoto } from '../lib/imagen'
import { leerCodigoDeFoto } from '../escaner/lecturaCodigo'
import { verificarImeiEnBd } from '../lib/validacionImei'
import {
  OPCIONES_ALMACENAMIENTO,
  OPCIONES_COLOR,
  OPCIONES_RAM,
  actualizarNombreConVariantes,
  normalizarAlmacenamiento,
  normalizarColor,
  normalizarRam,
} from '@compartido/variantes'
import type { Equipo, ProductoConStock } from '@compartido/tipos'

type PestanaProducto = 'equipos' | 'detalles' | 'historial'

export function Producto() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const [parametros] = useSearchParams()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { activa, ubicaciones } = useUbicacion()

  const ubicacionDeVenta =
    ubicaciones.find((u) => u.id === parametros.get('ubicacion')) ?? activa
  const abrirVenta = parametros.get('accion') === 'venta'

  // Estados de navegación y hojas inferiores
  const [pestanaActiva, setPestanaActiva] = useState<PestanaProducto>('equipos')
  const [acciones, setAcciones] = useState(abrirVenta)
  const [modoAcciones, setModoAcciones] = useState<'rápido' | 'venta'>(
    abrirVenta ? 'venta' : 'rápido',
  )
  const [altaEquipo, setAltaEquipo] = useState(false)
  const [equipoParaEditar, setEquipoParaEditar] = useState<Equipo | null>(null)
  const [equipoParaEliminar, setEquipoParaEliminar] = useState<Equipo | null>(null)
  const [administrar, setAdministrar] = useState(false)
  const [accionProducto, setAccionProducto] = useState<'desactivar' | 'eliminar' | null>(null)
  const [imagenPorQuitar, setImagenPorQuitar] = useState<{ id: string; clave: string } | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [fotoParaRecortar, setFotoParaRecortar] = useState<File | null>(null)
  const [filtroImei, setFiltroImei] = useState('')
  const [copiadoImei, setCopiadoImei] = useState<string | null>(null)

  const refFotos = useRef<HTMLInputElement>(null)
  const refCamara = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (abrirVenta) {
      setModoAcciones('venta')
      setAcciones(true)
    }
  }, [abrirVenta, id])

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

  const equipos = useQuery({
    queryKey: ['equipos', id],
    queryFn: () => api.equiposDeProducto(id, true),
    enabled: id !== '',
  })

  const galeria = useQuery({
    queryKey: ['imagenes', id],
    queryFn: () => api.imagenesDeProducto(id),
    enabled: id !== '',
  })

  const copiarTexto = async (texto: string, clave: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoImei(clave)
      avisos.exito('Copiado al portapapeles')
      setTimeout(() => setCopiadoImei(null), 1800)
    } catch {
      avisos.error('No se pudo copiar')
    }
  }

  const deshacer = async (movimientoId: string): Promise<void> => {
    try {
      await api.deshacer(movimientoId)
      avisos.información('Movimiento deshecho')
      void cliente.invalidateQueries({ queryKey: ['producto', id] })
      void cliente.invalidateQueries({ queryKey: ['movimientos', id] })
      void cliente.invalidateQueries({ queryKey: ['movimientos'] })
      void cliente.invalidateQueries({ queryKey: ['inicio'] })
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo deshacer')
    }
  }

  const listaEquipos = equipos.data?.equipos ?? []

  // Equipos filtrados por el buscador interno de IMEI
  const equiposFiltrados = useMemo(() => {
    const q = filtroImei.trim().toLowerCase()
    if (!q) return listaEquipos
    return listaEquipos.filter((eq) => {
      const imei1 = (eq.imei1 ?? '').toLowerCase()
      const imei2 = (eq.imei2 ?? '').toLowerCase()
      const color = (eq.color ?? '').toLowerCase()
      return imei1.includes(q) || imei2.includes(q) || color.includes(q)
    })
  }, [listaEquipos, filtroImei])

  if (producto.isPending) {
    return (
      <Marco titulo="Producto" atras>
        <Esqueleto filas={5} />
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
  const margenPorcentaje =
    ficha.precioCosto > 0 ? Math.round((margen / ficha.precioCosto) * 100) : null

  return (
    <Marco titulo={ficha.nombre} atras>
      <div className="flex flex-col gap-4">
        {/* =================================================================== */}
        {/* 1. TARJETA HERO DEL PRODUCTO CON MÉTRICAS INTEGRADAS               */}
        {/* =================================================================== */}
        <section className="flex flex-col rounded-2xl border border-borde bg-superficie p-3.5 shadow-2xs">
          <div className="flex items-start gap-3.5">
            {/* Miniatura grande vertical */}
            <div className="shrink-0">
              <Miniatura
                nombre={ficha.nombre}
                claveImagen={ficha.claveImagen}
                tamano="grande"
                forma="vertical"
              />
            </div>

            {/* Información principal */}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-1.5">
                <h1 className="text-[1.125rem] font-bold leading-snug text-tinta line-clamp-2">
                  {ficha.nombre}
                </h1>

                {/* Acciones de administración */}
                <div className="flex items-center gap-1 shrink-0 -mr-1">
                  <button
                    type="button"
                    aria-label={`Editar ficha de ${ficha.nombre}`}
                    title="Editar producto"
                    onClick={() => setAdministrar(true)}
                    className="inline-flex size-9 items-center justify-center rounded-xl text-tinta-suave hover:bg-papel-hundido hover:text-accion active:scale-95 transition"
                  >
                    <Edit3 className="size-4.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar ${ficha.nombre}`}
                    title="Eliminar producto"
                    onClick={() => setAccionProducto('eliminar')}
                    className="inline-flex size-9 items-center justify-center rounded-xl text-tinta-suave hover:bg-falta-tenue hover:text-falta active:scale-95 transition"
                  >
                    <Trash2 className="size-4.5" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Marca, modelo y categoría */}
              <p className="text-[0.8125rem] font-medium text-tinta-suave truncate">
                {[ficha.marca, ficha.modelo, ficha.categoriaNombre]
                  .filter(Boolean)
                  .join(' · ') || 'Sin clasificar'}
              </p>

              {/* Chips de variantes: RAM, Almacenamiento, Color */}
              {(ficha.ram || ficha.almacenamiento || ficha.color) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  {ficha.ram && (
                    <span className="rounded-lg border border-borde/70 bg-papel-hundido px-2 py-0.5 text-[0.6875rem] font-bold text-tinta">
                      {ficha.ram} RAM
                    </span>
                  )}
                  {ficha.almacenamiento && (
                    <span className="rounded-lg border border-borde/70 bg-papel-hundido px-2 py-0.5 text-[0.6875rem] font-bold text-tinta">
                      {ficha.almacenamiento}
                    </span>
                  )}
                  {ficha.color && (
                    <span className="rounded-lg border border-borde/70 bg-papel-hundido px-2 py-0.5 text-[0.6875rem] font-bold text-tinta">
                      {ficha.color}
                    </span>
                  )}
                </div>
              )}

              {/* Código de barras con botón copiar */}
              {ficha.codigo && (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="cifras text-[0.75rem] font-medium text-tinta-tenue">
                    {ficha.codigo}
                  </span>
                  <button
                    type="button"
                    title="Copiar código"
                    onClick={() => copiarTexto(ficha.codigo, 'codigo')}
                    className="inline-flex size-5 items-center justify-center text-tinta-tenue hover:text-tinta active:scale-90"
                  >
                    {copiadoImei === 'codigo' ? (
                      <Check className="size-3 text-exito" strokeWidth={2.5} />
                    ) : (
                      <Copy className="size-3" strokeWidth={2} />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Fila de KPIs Financieros y Stock */}
          <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-borde/70 pt-3">
            {/* Existencias */}
            <div className="flex flex-col justify-center rounded-xl bg-papel-hundido p-2.5 text-center">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-tinta-suave">
                Existencias
              </span>
              <div className="mt-0.5 flex items-center justify-center gap-1">
                {bajoMinimo && (
                  <AlertTriangle className="size-4 shrink-0 text-alerta" strokeWidth={2.5} />
                )}
                <span
                  className={`cifras text-[1.25rem] font-extrabold leading-none ${
                    bajoMinimo ? 'text-alerta' : 'text-tinta'
                  }`}
                >
                  {numero(ficha.stockTotal)}
                </span>
              </div>
              <span className="text-[0.625rem] font-medium text-tinta-tenue mt-0.5">
                {bajoMinimo ? `Mínimo: ${ficha.stockMinimo}` : 'unidades'}
              </span>
            </div>

            {/* Precio Venta */}
            <div className="flex flex-col justify-center rounded-xl bg-papel-hundido p-2.5 text-center">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-tinta-suave">
                Precio Venta
              </span>
              <span className="cifras mt-0.5 text-[1.125rem] font-extrabold leading-tight text-accion">
                {dinero(ficha.precioVenta)}
              </span>
              <span className="text-[0.625rem] font-medium text-tinta-tenue mt-0.5">por unidad</span>
            </div>

            {/* Margen */}
            <div className="flex flex-col justify-center rounded-xl bg-papel-hundido p-2.5 text-center">
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-tinta-suave">
                Margen
              </span>
              <span
                className={`cifras mt-0.5 text-[1.125rem] font-extrabold leading-tight ${
                  margen < 0 ? 'text-falta' : 'text-exito'
                }`}
              >
                {dinero(margen)}
              </span>
              <span className="text-[0.625rem] font-medium text-tinta-tenue mt-0.5">
                {margenPorcentaje !== null ? `${margenPorcentaje}% rentabilidad` : 'ganancia'}
              </span>
            </div>
          </div>
        </section>

        {/* Alerta de Stock Mínimo */}
        {bajoMinimo && (
          <div className="flex items-center gap-2.5 rounded-xl border border-alerta/40 bg-alerta-tenue px-3.5 py-2.5 text-[0.875rem] text-tinta">
            <AlertTriangle className="size-5 shrink-0 text-alerta" strokeWidth={2} />
            <p className="flex-1 leading-tight font-medium">
              Stock bajo mínimo: quedan <strong>{numero(ficha.stockTotal)}</strong> unidades de las{' '}
              {numero(ficha.stockMinimo)} requeridas.
            </p>
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. BARRA DE ACCIONES RÁPIDAS PRINCIPALES                           */}
        {/* =================================================================== */}
        <div className="grid grid-cols-3 gap-2">
          {/* Botón Venta Rápida */}
          <button
            type="button"
            onClick={() => {
              setModoAcciones('venta')
              setAcciones(true)
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accion px-3 text-[0.875rem] font-bold text-white shadow-xs transition active:scale-[0.98] active:bg-accion-viva"
          >
            <ShoppingBag className="size-4.5 shrink-0" strokeWidth={2} />
            <span>Vender</span>
          </button>

          {/* Botón Mover / Ajustar */}
          <button
            type="button"
            onClick={() => {
              setModoAcciones('rápido')
              setAcciones(true)
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-borde-fuerte bg-superficie px-3 text-[0.875rem] font-semibold text-tinta transition active:scale-[0.98] active:bg-papel-hundido"
          >
            <ArrowLeftRight className="size-4.5 shrink-0 text-tinta-suave" strokeWidth={2} />
            <span>Mover</span>
          </button>

          {/* Botón Registrar Equipo */}
          <button
            type="button"
            onClick={() => setAltaEquipo(true)}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-accion/40 bg-accion-tenue px-3 text-[0.875rem] font-bold text-accion transition active:scale-[0.98] hover:bg-accion-tenue/80"
          >
            <Plus className="size-4.5 shrink-0" strokeWidth={2.5} />
            <span>+ Equipo</span>
          </button>
        </div>

        {/* Sugerencia de reposición automática si aplica */}
        <SugerenciaReposicion producto={ficha} />

        {/* =================================================================== */}
        {/* 3. NAVEGACIÓN POR PESTAÑAS (Segmented Control Simétrico)          */}
        {/* =================================================================== */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-papel-hundido p-1 border border-borde">
          <button
            type="button"
            onClick={() => setPestanaActiva('equipos')}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-[0.8125rem] font-bold transition leading-none ${
              pestanaActiva === 'equipos'
                ? 'bg-superficie text-accion shadow-2xs'
                : 'text-tinta-suave hover:text-tinta'
            }`}
          >
            <Smartphone className="size-4 shrink-0" strokeWidth={2} />
            <span>Equipos ({listaEquipos.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setPestanaActiva('detalles')}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-[0.8125rem] font-bold transition leading-none ${
              pestanaActiva === 'detalles'
                ? 'bg-superficie text-accion shadow-2xs'
                : 'text-tinta-suave hover:text-tinta'
            }`}
          >
            <Info className="size-4 shrink-0" strokeWidth={2} />
            <span>Detalles</span>
          </button>

          <button
            type="button"
            onClick={() => setPestanaActiva('historial')}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-[0.8125rem] font-bold transition leading-none ${
              pestanaActiva === 'historial'
                ? 'bg-superficie text-accion shadow-2xs'
                : 'text-tinta-suave hover:text-tinta'
            }`}
          >
            <History className="size-4 shrink-0" strokeWidth={2} />
            <span>Historial</span>
          </button>
        </div>

        {/* =================================================================== */}
        {/* 4. CONTENIDO DE LAS PESTAÑAS                                      */}
        {/* =================================================================== */}

        {/* PESTAÑA 1: EXISTENCIAS Y EQUIPOS INDIVIDUALES */}
        {pestanaActiva === 'equipos' && (
          <div className="flex flex-col gap-4">
            {/* Desglose por tienda */}
            <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-tinta">
                  <MapPin className="size-4 text-accion" strokeWidth={2} />
                  Stock por ubicación
                </span>
                <span className="text-[0.75rem] font-medium text-tinta-suave">
                  {ficha.stock.length} {ficha.stock.length === 1 ? 'sede' : 'sedes'}
                </span>
              </div>
              <DesgloseStock producto={ficha} ubicacionActivaId={ubicacionDeVenta?.id} />
            </section>

            {/* Listado de unidades físicas (Equipos por IMEI) */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[0.875rem] font-bold text-tinta">
                  <Smartphone className="size-4 text-accion" strokeWidth={2} />
                  Unidades físicas con IMEI
                </span>
                <button
                  type="button"
                  onClick={() => setAltaEquipo(true)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-accion-tenue px-3 text-[0.8125rem] font-bold text-accion active:scale-95 transition"
                >
                  <Plus className="size-3.5" strokeWidth={2.5} />
                  <span>Nuevo equipo</span>
                </button>
              </div>

              {/* Buscador interno si hay más de 2 equipos */}
              {listaEquipos.length > 2 && (
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3 size-4 text-tinta-tenue select-none" />
                  <input
                    type="text"
                    value={filtroImei}
                    onChange={(e) => setFiltroImei(e.target.value)}
                    placeholder="Filtrar por IMEI o variante…"
                    className="min-h-10 w-full rounded-xl border border-borde bg-superficie pl-9 pr-8 text-[0.8125rem] text-tinta placeholder:text-tinta-tenue focus:border-accion focus:outline-none"
                  />
                  {filtroImei && (
                    <button
                      type="button"
                      onClick={() => setFiltroImei('')}
                      className="absolute right-2 text-tinta-tenue hover:text-tinta p-1"
                    >
                      <X className="size-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              )}

              {equipos.isPending && <Esqueleto filas={3} />}

              {equipos.isSuccess && listaEquipos.length === 0 && (
                <Vacio
                  titulo="Sin equipos registrados"
                  detalle="Este producto tiene existencias registradas a nivel global, pero ninguna unidad física con IMEI asignado."
                  accion={{
                    texto: 'Registrar primer equipo',
                    onClick: () => setAltaEquipo(true),
                  }}
                />
              )}

              {equipos.isSuccess && listaEquipos.length > 0 && equiposFiltrados.length === 0 && (
                <div className="rounded-xl border border-borde bg-superficie p-6 text-center text-tinta-suave text-[0.875rem]">
                  No hay equipos que coincidan con &quot;{filtroImei}&quot;.
                </div>
              )}

              {equipos.isSuccess && equiposFiltrados.length > 0 && (
                <ul className="flex flex-col gap-2.5">
                  {equiposFiltrados.map((equipo) => {
                    const imeiPrincipal = equipo.imei1 ?? equipo.imei2 ?? 'Sin IMEI'
                    return (
                      <li
                        key={equipo.id}
                        className={`rounded-2xl border p-3 transition shadow-2xs ${
                          equipo.activo
                            ? 'border-borde bg-superficie'
                            : 'border-borde/60 bg-papel-hundido opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {/* IMEI 1 con botón copiar */}
                            <div className="flex items-center gap-2">
                              <span className="cifras text-[0.9375rem] font-bold text-tinta tracking-wide">
                                {imeiPrincipal}
                              </span>
                              {equipo.imei1 && (
                                <button
                                  type="button"
                                  title="Copiar IMEI 1"
                                  onClick={() => copiarTexto(equipo.imei1!, `imei1-${equipo.id}`)}
                                  className="inline-flex size-6 items-center justify-center rounded-lg text-tinta-tenue hover:bg-papel-hundido hover:text-tinta active:scale-90"
                                >
                                  {copiadoImei === `imei1-${equipo.id}` ? (
                                    <Check className="size-3.5 text-exito" strokeWidth={2.5} />
                                  ) : (
                                    <Copy className="size-3.5" strokeWidth={2} />
                                  )}
                                </button>
                              )}
                            </div>

                            {/* IMEI 2 si existe */}
                            {equipo.imei2 && (
                              <div className="flex items-center gap-1.5 mt-0.5 text-[0.75rem] text-tinta-suave">
                                <span className="font-semibold text-tinta-tenue">IMEI 2:</span>
                                <span className="cifras">{equipo.imei2}</span>
                                <button
                                  type="button"
                                  title="Copiar IMEI 2"
                                  onClick={() => copiarTexto(equipo.imei2!, `imei2-${equipo.id}`)}
                                  className="inline-flex size-5 items-center justify-center text-tinta-tenue hover:text-tinta active:scale-90"
                                >
                                  {copiadoImei === `imei2-${equipo.id}` ? (
                                    <Check className="size-3 text-exito" strokeWidth={2.5} />
                                  ) : (
                                    <Copy className="size-3" strokeWidth={2} />
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Variantes específicas del equipo */}
                            {(equipo.ram ||
                              equipo.almacenamiento ||
                              equipo.color ||
                              ficha.ram ||
                              ficha.almacenamiento ||
                              ficha.color) && (
                              <p className="mt-1 text-[0.75rem] font-medium text-tinta-suave">
                                {[
                                  equipo.ram ?? ficha.ram,
                                  equipo.almacenamiento ?? ficha.almacenamiento,
                                  equipo.color ?? ficha.color,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            )}

                            {/* Notas del equipo */}
                            {equipo.notas && (
                              <p className="mt-1 text-[0.75rem] text-tinta-suave italic">
                                {equipo.notas}
                              </p>
                            )}

                            <p
                              className="mt-1 text-[0.6875rem] text-tinta-tenue"
                              title={fechaLarga(equipo.creadoEn)}
                            >
                              Ingreso: {fechaLarga(equipo.creadoEn)}
                            </p>
                          </div>

                          {/* Badges de estado */}
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {!equipo.activo && (
                              <span className="rounded-md bg-papel-hundido px-2 py-0.5 text-[0.6875rem] font-bold text-tinta-suave">
                                Retirado
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.6875rem] font-bold ${
                                equipo.listaBlanca === 'registered'
                                  ? 'bg-exito-tenue text-exito'
                                  : 'bg-falta-tenue text-falta'
                              }`}
                            >
                              {equipo.listaBlanca === 'registered' ? (
                                <BadgeCheck className="size-3" strokeWidth={2.5} />
                              ) : (
                                <ShieldAlert className="size-3" strokeWidth={2.5} />
                              )}
                              <span>{equipo.listaBlanca === 'registered' ? 'Registrado' : 'No registrado'}</span>
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.6875rem] font-bold ${
                                equipo.condicion === 'new'
                                  ? 'bg-accion-tenue text-accion'
                                  : 'bg-alerta-tenue text-alerta'
                              }`}
                            >
                              {equipo.condicion === 'new' ? (
                                <Sparkles className="size-3" strokeWidth={2.5} />
                              ) : (
                                <RefreshCw className="size-3" strokeWidth={2.5} />
                              )}
                              <span>{equipo.condicion === 'new' ? 'Nuevo' : 'Segunda mano'}</span>
                            </span>
                          </div>
                        </div>

                        {/* Botones de acción del equipo */}
                        <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-borde/60 pt-2">
                          <button
                            type="button"
                            onClick={() => setEquipoParaEditar(equipo)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-accion/30 bg-accion-tenue px-2.5 text-[0.75rem] font-bold text-accion transition active:scale-95 hover:bg-accion-tenue/80"
                            title="Editar datos de esta unidad"
                          >
                            <Pencil className="size-3.5" strokeWidth={2.2} />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEquipoParaEliminar(equipo)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-falta/30 bg-falta-tenue px-2.5 text-[0.75rem] font-bold text-falta transition active:scale-95 hover:bg-falta-tenue/80"
                            title="Eliminar esta unidad"
                          >
                            <Trash2 className="size-3.5" strokeWidth={2.2} />
                            <span>Eliminar</span>
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* PESTAÑA 2: DETALLES, FOTOS Y ADMINISTRACIÓN */}
        {pestanaActiva === 'detalles' && (
          <div className="flex flex-col gap-4">
            {/* Galería de fotos */}
            <section className="flex flex-col gap-2.5 rounded-2xl border border-borde bg-superficie p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-tinta">
                  <Camera className="size-4 text-accion" strokeWidth={2} />
                  Galería de fotos
                </span>
                <span className="text-[0.75rem] font-semibold text-tinta-tenue">
                  {galeria.data?.imagenes.length ?? 0}/5 fotos
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(galeria.data?.imagenes ?? []).map((imagen) => (
                  <div
                    key={imagen.id}
                    className="relative aspect-square overflow-hidden rounded-xl border border-borde bg-papel-hundido group"
                  >
                    <img
                      src={urlDeImagen(imagen.clave) ?? ''}
                      alt={`Foto ${imagen.posicion + 1} de ${ficha.nombre}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar foto ${imagen.posicion + 1}`}
                      onClick={() => setImagenPorQuitar(imagen)}
                      className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-tinta/80 text-white transition active:scale-90 hover:bg-falta"
                    >
                      <X className="size-3.5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}

                {(galeria.data?.imagenes.length ?? 0) < 5 && (
                  <>
                    <button
                      type="button"
                      disabled={subiendoImagen}
                      onClick={() => refCamara.current?.click()}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-accion/40 bg-accion-tenue p-2 text-center text-[0.75rem] font-bold text-accion transition active:scale-95 disabled:opacity-50 hover:bg-accion-tenue/80"
                    >
                      <Camera className="size-5" strokeWidth={2} />
                      <span>Cámara</span>
                    </button>
                    <button
                      type="button"
                      disabled={subiendoImagen}
                      onClick={() => refFotos.current?.click()}
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-borde bg-papel-hundido p-2 text-center text-[0.75rem] font-bold text-tinta-suave transition active:scale-95 disabled:opacity-50 hover:bg-superficie"
                    >
                      <ImageUp className="size-5" strokeWidth={2} />
                      <span>Galería</span>
                    </button>
                  </>
                )}
              </div>

              <input
                ref={refCamara}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0]
                  e.target.value = ''
                  if (archivo) setFotoParaRecortar(archivo)
                }}
              />

              <input
                ref={refFotos}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const archivos = e.target.files
                  e.target.value = ''
                  if (!archivos || archivos.length === 0) return
                  if (archivos.length === 1 && archivos[0]) {
                    setFotoParaRecortar(archivos[0])
                    return
                  }
                  void (async () => {
                    setSubiendoImagen(true)
                    try {
                      const disponibles = 5 - (galeria.data?.imagenes.length ?? 0)
                      const lista = Array.from(archivos).slice(0, disponibles)
                      for (const archivo of lista) {
                        const preparada = await prepararFoto(archivo)
                        await api.agregarImagenProducto(ficha.id, preparada.archivo)
                      }
                      void cliente.invalidateQueries({ queryKey: ['imagenes', id] })
                      void cliente.invalidateQueries({ queryKey: ['producto', id] })
                      avisos.exito(
                        lista.length === 1 ? 'Foto agregada' : `${lista.length} fotos agregadas`,
                      )
                    } catch (causa) {
                      avisos.error(
                        causa instanceof ErrorDeApi ? causa.message : 'No se pudo agregar la foto',
                      )
                    } finally {
                      setSubiendoImagen(false)
                    }
                  })()
                }}
              />
            </section>

            {/* Precios detallados */}
            <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3.5 shadow-2xs">
              <span className="text-[0.8125rem] font-bold text-tinta">Estructura de precios</span>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col rounded-xl border border-borde bg-papel-hundido p-3">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-tinta-suave">
                    Precio Costo
                  </span>
                  <span className="cifras mt-0.5 text-[1.125rem] font-bold text-tinta">
                    {dinero(ficha.precioCosto)}
                  </span>
                </div>
                <div className="flex flex-col rounded-xl border border-borde bg-papel-hundido p-3">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-tinta-suave">
                    Precio Venta
                  </span>
                  <span className="cifras mt-0.5 text-[1.125rem] font-bold text-accion">
                    {dinero(ficha.precioVenta)}
                  </span>
                </div>
              </div>
            </section>

            {/* Notas del producto */}
            {ficha.notas && (
              <section className="flex flex-col gap-1.5 rounded-2xl border border-borde bg-superficie p-3.5 shadow-2xs">
                <span className="text-[0.8125rem] font-bold text-tinta">Notas u observaciones</span>
                <p className="text-[0.875rem] text-tinta-suave leading-relaxed">{ficha.notas}</p>
              </section>
            )}

            {/* Opciones avanzadas de administración */}
            <div className="flex flex-col gap-2 pt-2 border-t border-borde">
              <button
                type="button"
                onClick={() => setAdministrar(true)}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-borde-fuerte bg-superficie text-[0.875rem] font-bold text-tinta transition active:bg-papel-hundido"
              >
                <Edit3 className="size-4 text-accion" strokeWidth={2} />
                <span>Modificar datos de la ficha</span>
              </button>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: HISTORIAL DE MOVIMIENTOS */}
        {pestanaActiva === 'historial' && (
          <div className="flex flex-col gap-3">
            <span className="text-[0.875rem] font-bold text-tinta">
              Historial de movimientos y trazabilidad
            </span>

            {movimientos.isPending && <Esqueleto filas={4} />}

            {movimientos.isSuccess && movimientos.data.movimientos.length === 0 && (
              <Vacio
                titulo="Sin movimientos registrados"
                detalle="Aún no se ha realizado ninguna venta, entrada o traspaso de este producto."
              />
            )}

            {movimientos.isSuccess && movimientos.data.movimientos.length > 0 && (
              <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie shadow-2xs">
                {movimientos.data.movimientos.map((movimiento) => {
                  const entra = movimiento.ubicacionDestinoId !== null
                  const revertido = movimiento.revertidoEn !== null

                  return (
                    <li key={movimiento.id} className="flex items-center gap-3 px-3.5 py-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="text-[0.875rem] font-bold text-tinta flex items-center gap-2">
                          <span>{NOMBRE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo}</span>
                          {revertido && (
                            <span className="rounded-md bg-papel-hundido px-1.5 py-0.5 text-[0.625rem] font-bold text-tinta-tenue">
                              Deshecho
                            </span>
                          )}
                        </p>

                        <p className="text-[0.75rem] text-tinta-suave">
                          {[movimiento.ubicacionOrigenNombre, movimiento.ubicacionDestinoNombre]
                            .filter(Boolean)
                            .join(' → ')}
                        </p>

                        {movimiento.nota && (
                          <p className="text-[0.75rem] text-tinta-suave italic">
                            {movimiento.nota}
                          </p>
                        )}

                        <p
                          className="text-[0.6875rem] text-tinta-tenue mt-0.5"
                          title={fechaLarga(movimiento.creadoEn)}
                        >
                          {cuandoFue(movimiento.creadoEn)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`cifras text-[1rem] font-bold ${
                            revertido
                              ? 'text-tinta-tenue line-through'
                              : entra
                                ? 'text-exito'
                                : 'text-falta'
                          }`}
                        >
                          {entra ? '+' : '−'}
                          {numero(movimiento.cantidad)}
                        </span>

                        {!revertido && (
                          <button
                            type="button"
                            onClick={() => void deshacer(movimiento.id)}
                            className="min-h-7 px-2 text-[0.75rem] font-bold text-accion hover:underline"
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
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 5. HOJAS INFERIORES Y MODALES                                      */}
      {/* =================================================================== */}

      {/* Hoja de Ventas y Movimientos */}
      <HojaInferior
        abierta={acciones}
        onCerrar={() => setAcciones(false)}
        titulo={modoAcciones === 'venta' ? `Vender · ${ficha.nombre}` : 'Registrar'}
      >
        <AccionesProducto
          key={`${ficha.id}-${ubicacionDeVenta?.id ?? 'sin-ubicacion'}-${modoAcciones}`}
          producto={ficha}
          ubicacionSeleccionada={ubicacionDeVenta}
          modoInicial={modoAcciones}
          onCambio={() => {
            void cliente.invalidateQueries({ queryKey: ['movimientos', id] })
            void cliente.invalidateQueries({ queryKey: ['movimientos'] })
          }}
          onListo={() => setAcciones(false)}
        />
      </HojaInferior>

      {/* Hoja de Registro de Nuevo Equipo */}
      <HojaInferior
        abierta={altaEquipo}
        onCerrar={() => setAltaEquipo(false)}
        titulo={`Registrar equipo · ${ficha.nombre}`}
      >
        <FormularioAltaEquipo
          producto={ficha}
          onListo={() => {
            setAltaEquipo(false)
            void cliente.invalidateQueries({ queryKey: ['equipos', id] })
            void cliente.invalidateQueries({ queryKey: ['producto', id] })
            void cliente.invalidateQueries({ queryKey: ['movimientos', id] })
            void cliente.invalidateQueries({ queryKey: ['movimientos'] })
            void cliente.invalidateQueries({ queryKey: ['inicio'] })
          }}
        />
      </HojaInferior>

      {/* Hoja de Edición de Equipo */}
      <HojaInferior
        abierta={equipoParaEditar !== null}
        onCerrar={() => setEquipoParaEditar(null)}
        titulo={`Editar equipo · ${ficha.nombre}`}
      >
        {equipoParaEditar !== null && (
          <FormularioEdicionEquipo
            equipo={equipoParaEditar}
            producto={ficha}
            onListo={() => {
              setEquipoParaEditar(null)
              void cliente.invalidateQueries({ queryKey: ['equipos', id] })
              void cliente.invalidateQueries({ queryKey: ['producto', id] })
              void cliente.invalidateQueries({ queryKey: ['buscar'] })
              void cliente.invalidateQueries({ queryKey: ['inicio'] })
            }}
          />
        )}
      </HojaInferior>

      {/* Hoja de Administración de Ficha de Producto */}
      <HojaInferior
        abierta={administrar}
        onCerrar={() => setAdministrar(false)}
        titulo={`Editar producto · ${ficha.nombre}`}
      >
        <FormularioEdicionProducto
          producto={ficha}
          onCerrar={() => setAdministrar(false)}
          onDesactivar={() => setAccionProducto('desactivar')}
          onEliminar={() => setAccionProducto('eliminar')}
          onGuardado={() => {
            setAdministrar(false)
            void cliente.invalidateQueries({ queryKey: ['producto', id] })
            void cliente.invalidateQueries({ queryKey: ['buscar'] })
            void cliente.invalidateQueries({ queryKey: ['inicio'] })
          }}
        />
      </HojaInferior>

      {/* Confirmación para quitar foto */}
      <Confirmacion
        abierta={imagenPorQuitar !== null}
        titulo={`¿Quitar foto de ${ficha.nombre}?`}
        detalle={`La imagen se eliminará definitivamente de ${ficha.nombre}. Esta acción no se puede deshacer.`}
        confirmar="Quitar foto"
        peligro
        onCancelar={() => setImagenPorQuitar(null)}
        onConfirmar={() => {
          if (imagenPorQuitar === null) return
          void (async () => {
            try {
              await api.quitarImagenProducto(ficha.id, imagenPorQuitar.id)
              void cliente.invalidateQueries({ queryKey: ['imagenes', id] })
              void cliente.invalidateQueries({ queryKey: ['producto', id] })
              avisos.exito('Foto eliminada')
            } catch (causa) {
              avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo quitar la foto')
            } finally {
              setImagenPorQuitar(null)
            }
          })()
        }}
      />

      {/* Confirmación para eliminar equipo */}
      <Confirmacion
        abierta={equipoParaEliminar !== null}
        titulo={`¿Eliminar unidad física (${equipoParaEliminar?.imei1 ?? equipoParaEliminar?.imei2 ?? 'Sin IMEI'})?`}
        detalle="Esta unidad física se eliminará del inventario y se descontará del stock. Esta acción no se puede deshacer."
        confirmar="Eliminar equipo"
        peligro
        onCancelar={() => setEquipoParaEliminar(null)}
        onConfirmar={() => {
          if (equipoParaEliminar === null) return
          void (async () => {
            try {
              await api.eliminarEquipo(equipoParaEliminar.id)
              avisos.exito('Equipo eliminado del inventario')
              void cliente.invalidateQueries({ queryKey: ['equipos', id] })
              void cliente.invalidateQueries({ queryKey: ['producto', id] })
              void cliente.invalidateQueries({ queryKey: ['buscar'] })
              void cliente.invalidateQueries({ queryKey: ['inicio'] })
            } catch (causa) {
              avisos.error(
                causa instanceof ErrorDeApi ? causa.message : 'No se pudo eliminar el equipo',
              )
            } finally {
              setEquipoParaEliminar(null)
            }
          })()
        }}
      />

      {/* Confirmación para desactivar o eliminar producto */}
      <Confirmacion
        abierta={accionProducto !== null}
        titulo={
          accionProducto === 'eliminar'
            ? `¿Eliminar ${ficha.nombre}?`
            : `¿Desactivar ${ficha.nombre}?`
        }
        detalle={
          accionProducto === 'eliminar'
            ? `Se eliminará definitivamente ${ficha.nombre} y todos sus registros asociados (equipos, historial y stock). Ya no aparecerá en el inventario ni en las búsquedas.`
            : `${ficha.nombre} dejará de aparecer en las búsquedas y se conservará su historial.`
        }
        confirmar={accionProducto === 'eliminar' ? 'Eliminar definitivamente' : 'Desactivar'}
        peligro
        onCancelar={() => setAccionProducto(null)}
        onConfirmar={() => {
          if (accionProducto === null) return
          void (async () => {
            try {
              if (accionProducto === 'eliminar') {
                await api.eliminarProducto(ficha.id)
                avisos.exito(`${ficha.nombre} eliminado definitivamente`)
                void cliente.invalidateQueries({ queryKey: ['buscar'] })
                void cliente.invalidateQueries({ queryKey: ['inicio'] })
                navegar('/buscar')
              } else {
                await api.actualizarProducto(ficha.id, { activo: false })
                avisos.exito(`${ficha.nombre} desactivado`)
                setAdministrar(false)
                void cliente.invalidateQueries({ queryKey: ['producto', id] })
                void cliente.invalidateQueries({ queryKey: ['buscar'] })
                void cliente.invalidateQueries({ queryKey: ['inicio'] })
              }
            } catch (causa) {
              avisos.error(
                causa instanceof ErrorDeApi ? causa.message : 'No se pudo guardar el cambio',
              )
            } finally {
              setAccionProducto(null)
            }
          })()
        }}
      />

      {/* Modal de recorte de foto de producto */}
      <ModalRecorteImagen
        abierto={fotoParaRecortar !== null}
        archivo={fotoParaRecortar}
        titulo={`Foto de ${ficha.nombre}`}
        subtitulo="Puedes recortar el encuadre o usar la foto completa"
        onConfirmar={(resultado) => {
          setFotoParaRecortar(null)
          void (async () => {
            setSubiendoImagen(true)
            try {
              const preparada = await prepararFoto(resultado)
              await api.agregarImagenProducto(ficha.id, preparada.archivo)
              void cliente.invalidateQueries({ queryKey: ['imagenes', id] })
              void cliente.invalidateQueries({ queryKey: ['producto', id] })
              avisos.exito('Foto agregada')
            } catch (causa) {
              avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo agregar la foto')
            } finally {
              setSubiendoImagen(false)
            }
          })()
        }}
        onCancelar={() => setFotoParaRecortar(null)}
      />
    </Marco>
  )
}

/** Formulario para dar de alta una nueva unidad física (equipo) */
function FormularioAltaEquipo({
  producto,
  onListo,
}: {
  producto: ProductoConStock
  onListo: () => void
}) {
  const avisos = useAvisos()
  const { activa, ubicaciones } = useUbicacion()
  const [ubicacionId, setUbicacionId] = useState<string>(
    () => activa?.id ?? ubicaciones.find((u) => u.activa)?.id ?? '',
  )
  const [imei1, setImei1] = useState('')
  const [imei2, setImei2] = useState('')
  const [ram, setRam] = useState(producto.ram ?? '')
  const [almacenamiento, setAlmacenamiento] = useState(producto.almacenamiento ?? '')
  const [color, setColor] = useState(producto.color ?? '')
  const [errorImei1, setErrorImei1] = useState<string | undefined>()
  const [errorImei2, setErrorImei2] = useState<string | undefined>()
  const [listaBlanca, setListaBlanca] = useState<'registered' | 'not_registered'>('not_registered')
  const [condicion, setCondicion] = useState<'new' | 'used'>('new')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [recorteImei, setRecorteImei] = useState<{
    tipo: 'imei1' | 'imei2'
    archivo: File | Blob
  } | null>(null)
  const [leyendoFotoImei, setLeyendoFotoImei] = useState<'imei1' | 'imei2' | null>(null)
  const refCamaraImei1 = useRef<HTMLInputElement>(null)
  const refGaleriaImei1 = useRef<HTMLInputElement>(null)
  const refCamaraImei2 = useRef<HTMLInputElement>(null)
  const refGaleriaImei2 = useRef<HTMLInputElement>(null)

  const ubi = ubicaciones.find((u) => u.id === ubicacionId && u.activa) ?? activa

  const procesarFotoImei = async (tipo: 'imei1' | 'imei2', blob: Blob) => {
    setLeyendoFotoImei(tipo)
    try {
      const valor = await leerCodigoDeFoto(blob)
      if (!valor) {
        avisos.error('No se encontró un código legible en esa foto')
        return
      }
      if (tipo === 'imei1') cambiarImei1(valor)
      else cambiarImei2(valor)
    } catch {
      avisos.error('No se pudo procesar la foto')
    } finally {
      setLeyendoFotoImei(null)
    }
  }

  useEffect(() => {
    let cancelado = false
    const temporizador = window.setTimeout(async () => {
      const v1 = imei1.trim()
      const v2 = imei2.trim()

      if (v1 !== '' && v2 !== '' && v1 === v2) {
        setErrorImei2('IMEI 1 e IMEI 2 deben ser distintos')
        return
      }

      if (v1.length > 0 && v1.length <= 25) {
        const existe = await verificarImeiEnBd(v1)
        if (!cancelado && existe) setErrorImei1('Este IMEI ya está registrado en el inventario')
      }

      if (v2.length > 0 && v2.length <= 25) {
        const existe = await verificarImeiEnBd(v2)
        if (!cancelado && existe) setErrorImei2('Este IMEI ya está registrado en el inventario')
      }
    }, 300)

    return () => {
      cancelado = true
      window.clearTimeout(temporizador)
    }
  }, [imei1, imei2])

  const cambiarImei1 = (valorRaw: string) => {
    const val = valorRaw.slice(0, 25)
    setImei1(val)
    if (val.length > 25) setErrorImei1('El IMEI no puede tener más de 25 caracteres')
    else setErrorImei1(undefined)
  }

  const cambiarImei2 = (valorRaw: string) => {
    const val = valorRaw.slice(0, 25)
    setImei2(val)
    if (val.length > 25) setErrorImei2('El IMEI no puede tener más de 25 caracteres')
    else if (imei1 !== '' && val === imei1) setErrorImei2('IMEI 1 e IMEI 2 deben ser distintos')
    else setErrorImei2(undefined)
  }

  const guardar = async (): Promise<void> => {
    if (ubi === null) {
      avisos.error('Elige una ubicación antes de registrar el equipo')
      return
    }
    if (errorImei1 || errorImei2) {
      avisos.error(errorImei1 ?? errorImei2 ?? 'Revisa los IMEI ingresados')
      return
    }
    setEnviando(true)
    try {
      const ramFinal = ram.trim() === '' ? null : normalizarRam(ram)
      const almacenamientoFinal =
        almacenamiento.trim() === '' ? null : normalizarAlmacenamiento(almacenamiento)
      const colorFinal = color.trim() === '' ? null : normalizarColor(color)

      if (
        ramFinal !== (producto.ram ?? null) ||
        almacenamientoFinal !== (producto.almacenamiento ?? null) ||
        colorFinal !== (producto.color ?? null)
      ) {
        await api.actualizarProducto(producto.id, {
          ram: ramFinal,
          almacenamiento: almacenamientoFinal,
          color: colorFinal,
        })
      }

      await api.registrarEquipos({
        productoId: producto.id,
        ubicacionId: ubi.id,
        equipos: [
          {
            imei1: imei1.trim() || null,
            imei2: imei2.trim() || null,
            listaBlanca,
            condicion,
            notas: notas.trim() || null,
          },
        ],
      })
      avisos.exito(`${producto.nombre} registrado en ${ubi.nombre}`)
      onListo()
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo registrar el equipo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-3">
      {/* Selector de tienda o almacén */}
      <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3">
        <label className="text-[0.8125rem] font-bold text-tinta-suave">
          ¿En qué tienda o almacén entrará este equipo?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ubicaciones
            .filter((u) => u.activa)
            .map((u) => {
              const elegida = u.id === (ubi?.id ?? '')
              const color = u.color ?? '#315DB8'
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUbicacionId(u.id)}
                  aria-pressed={elegida}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-center text-[0.8125rem] font-bold transition leading-none active:scale-[0.98] ${
                    elegida
                      ? 'border-transparent shadow-xs'
                      : 'border-borde bg-papel text-tinta-suave hover:border-borde-fuerte'
                  }`}
                  style={
                    elegida
                      ? { backgroundColor: `${color}1f`, borderColor: color, color }
                      : undefined
                  }
                >
                  <IconoUbicacion icono={u.icono} tipo={u.tipo} className="size-4 shrink-0" />
                  <span className="truncate">{u.nombre}</span>
                </button>
              )
            })}
        </div>
      </section>

      {/* Inputs de IMEI 1 y 2 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-bold text-tinta-suave">IMEI 1</label>
          <div className="flex items-center gap-1.5">
            <input
              value={imei1}
              aria-invalid={errorImei1 !== undefined}
              onChange={(e) => cambiarImei1(e.target.value)}
              className={`min-w-0 flex-1 rounded-xl border bg-superficie px-3.5 py-3 text-[1rem] text-tinta placeholder:text-tinta-tenue focus:border-accion focus:ring-2 focus:ring-accion/15 focus:outline-none ${
                errorImei1 === undefined ? 'border-borde' : 'border-falta'
              }`}
              inputMode="text"
              placeholder="Hasta 25 caracteres"
              autoFocus
            />
            <input
              ref={refCamaraImei1}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei1', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Tomar foto de IMEI 1"
              title="Tomar foto con cámara"
              disabled={leyendoFotoImei !== null}
              onClick={() => refCamaraImei1.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
            >
              <Camera className="size-5" strokeWidth={2} />
            </button>
            <input
              ref={refGaleriaImei1}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei1', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Subir foto de IMEI 1"
              title="Subir foto de galería"
              disabled={leyendoFotoImei !== null}
              onClick={() => refGaleriaImei1.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei1' && (
            <p className="text-[0.75rem] font-medium text-accion animate-pulse">
              Leyendo foto de IMEI 1…
            </p>
          )}
          {errorImei1 !== undefined && (
            <p className="text-[0.75rem] font-medium text-falta">{errorImei1}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-bold text-tinta-suave">IMEI 2 (Opcional)</label>
          <div className="flex items-center gap-1.5">
            <input
              value={imei2}
              aria-invalid={errorImei2 !== undefined}
              onChange={(e) => cambiarImei2(e.target.value)}
              className={`min-w-0 flex-1 rounded-xl border bg-superficie px-3.5 py-3 text-[1rem] text-tinta placeholder:text-tinta-tenue focus:border-accion focus:ring-2 focus:ring-accion/15 focus:outline-none ${
                errorImei2 === undefined ? 'border-borde' : 'border-falta'
              }`}
              inputMode="text"
              placeholder="Opcional (hasta 25 caracteres)"
            />
            <input
              ref={refCamaraImei2}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei2', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Tomar foto de IMEI 2"
              title="Tomar foto con cámara"
              disabled={leyendoFotoImei !== null}
              onClick={() => refCamaraImei2.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
            >
              <Camera className="size-5" strokeWidth={2} />
            </button>
            <input
              ref={refGaleriaImei2}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei2', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Subir foto de IMEI 2"
              title="Subir foto de galería"
              disabled={leyendoFotoImei !== null}
              onClick={() => refGaleriaImei2.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei2' && (
            <p className="text-[0.75rem] font-medium text-accion animate-pulse">
              Leyendo foto de IMEI 2…
            </p>
          )}
          {errorImei2 !== undefined && (
            <p className="text-[0.75rem] font-medium text-falta">{errorImei2}</p>
          )}
        </div>
      </div>

      {/* Fila simétrica con los 3 desplegables: RAM, Almacenamiento y Color */}
      <div className="grid grid-cols-3 gap-2 w-full">
        <CampoSelect
          etiqueta="RAM"
          value={ram}
          onChange={(e) => setRam(e.target.value)}
          opciones={OPCIONES_RAM}
          placeholder="-"
        />
        <CampoSelect
          etiqueta="Almacenamiento"
          value={almacenamiento}
          onChange={(e) => setAlmacenamiento(e.target.value)}
          opciones={OPCIONES_ALMACENAMIENTO}
          placeholder="-"
        />
        <CampoSelect
          etiqueta="Color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          opciones={OPCIONES_COLOR}
          placeholder="-"
        />
      </div>

      <SelectorEquipo
        etiqueta="Lista blanca"
        valor={listaBlanca}
        opciones={[
          ['registered', 'Registrado'],
          ['not_registered', 'No registrado'],
        ]}
        onChange={setListaBlanca}
      />

      <SelectorEquipo
        etiqueta="Condición"
        valor={condicion}
        opciones={[
          ['new', 'Nuevo'],
          ['used', 'Segunda mano'],
        ]}
        onChange={setCondicion}
      />

      <CampoTexto
        etiqueta="Nota u observación"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Opcional"
      />

      <Boton ancho cargando={enviando} onClick={() => void guardar()}>
        Guardar equipo
      </Boton>

      <ModalRecorteImagen
        abierto={recorteImei !== null}
        archivo={recorteImei?.archivo ?? null}
        titulo={recorteImei?.tipo === 'imei1' ? 'Recortar IMEI 1' : 'Recortar IMEI 2'}
        subtitulo="Enfoca los dígitos del código o usa la foto completa"
        onConfirmar={(resultado) => {
          const tipo = recorteImei?.tipo
          setRecorteImei(null)
          if (tipo) void procesarFotoImei(tipo, resultado)
        }}
        onCancelar={() => setRecorteImei(null)}
      />
    </div>
  )
}

/** Formulario para editar un equipo individual (IMEI, Modelo, Marca, Variantes) */
function FormularioEdicionEquipo({
  equipo,
  producto,
  onListo,
}: {
  equipo: Equipo
  producto?: ProductoConStock
  onListo: () => void
}) {
  const avisos = useAvisos()
  const [imei1, setImei1] = useState(equipo.imei1 ?? '')
  const [imei2, setImei2] = useState(equipo.imei2 ?? '')
  const [errorImei1, setErrorImei1] = useState<string | undefined>()
  const [errorImei2, setErrorImei2] = useState<string | undefined>()
  const [modelo, setModelo] = useState(producto?.modelo ?? producto?.nombre ?? '')
  const [marca, setMarca] = useState(producto?.marca ?? '')
  const [ram, setRam] = useState(equipo.ram ?? producto?.ram ?? '')
  const [almacenamiento, setAlmacenamiento] = useState(
    equipo.almacenamiento ?? producto?.almacenamiento ?? '',
  )
  const [color, setColor] = useState(equipo.color ?? producto?.color ?? '')
  const [listaBlanca, setListaBlanca] = useState<'registered' | 'not_registered'>(
    equipo.listaBlanca,
  )
  const [notas, setNotas] = useState(equipo.notas ?? '')
  const [enviando, setEnviando] = useState(false)
  const [recorteImei, setRecorteImei] = useState<{
    tipo: 'imei1' | 'imei2'
    archivo: File | Blob
  } | null>(null)
  const [leyendoFotoImei, setLeyendoFotoImei] = useState<'imei1' | 'imei2' | null>(null)
  const refCamaraImei1 = useRef<HTMLInputElement>(null)
  const refGaleriaImei1 = useRef<HTMLInputElement>(null)
  const refCamaraImei2 = useRef<HTMLInputElement>(null)
  const refGaleriaImei2 = useRef<HTMLInputElement>(null)

  const procesarFotoImei = async (tipo: 'imei1' | 'imei2', blob: Blob) => {
    setLeyendoFotoImei(tipo)
    try {
      const valor = await leerCodigoDeFoto(blob)
      if (!valor) {
        avisos.error('No se encontró un código legible en esa foto')
        return
      }
      if (tipo === 'imei1') cambiarImei1(valor)
      else cambiarImei2(valor)
    } catch {
      avisos.error('No se pudo procesar la foto')
    } finally {
      setLeyendoFotoImei(null)
    }
  }

  useEffect(() => {
    let cancelado = false
    const temporizador = window.setTimeout(async () => {
      const v1 = imei1.trim()
      const v2 = imei2.trim()

      if (v1 !== '' && v2 !== '' && v1 === v2) {
        setErrorImei2('IMEI 1 e IMEI 2 deben ser distintos')
        return
      }

      if (v1.length > 0 && v1.length <= 25 && v1 !== equipo.imei1) {
        const existe = await verificarImeiEnBd(v1)
        if (!cancelado && existe) setErrorImei1('Este IMEI ya está registrado en el inventario')
      }

      if (v2.length > 0 && v2.length <= 25 && v2 !== equipo.imei2) {
        const existe = await verificarImeiEnBd(v2)
        if (!cancelado && existe) setErrorImei2('Este IMEI ya está registrado en el inventario')
      }
    }, 300)

    return () => {
      cancelado = true
      window.clearTimeout(temporizador)
    }
  }, [imei1, imei2, equipo.imei1, equipo.imei2])

  const cambiarImei1 = (valorRaw: string) => {
    const val = valorRaw.slice(0, 25)
    setImei1(val)
    if (val.length > 25) setErrorImei1('El IMEI no puede tener más de 25 caracteres')
    else setErrorImei1(undefined)
  }

  const cambiarImei2 = (valorRaw: string) => {
    const val = valorRaw.slice(0, 25)
    setImei2(val)
    if (val.length > 25) setErrorImei2('El IMEI no puede tener más de 25 caracteres')
    else if (imei1 !== '' && val === imei1) setErrorImei2('IMEI 1 e IMEI 2 deben ser distintos')
    else setErrorImei2(undefined)
  }

  const guardar = async (): Promise<void> => {
    if (errorImei1 || errorImei2) {
      avisos.error(errorImei1 ?? errorImei2 ?? 'Revisa los IMEI ingresados')
      return
    }
    setEnviando(true)
    try {
      const ramFinal = ram.trim() === '' ? null : normalizarRam(ram)
      const almacenamientoFinal =
        almacenamiento.trim() === '' ? null : normalizarAlmacenamiento(almacenamiento)
      const colorFinal = color.trim() === '' ? null : normalizarColor(color)

      if (producto && (modelo.trim() || marca.trim())) {
        const base = modelo.trim() || producto.modelo || producto.nombre
        const partesNombre: string[] = []
        if (marca.trim()) partesNombre.push(marca.trim())
        partesNombre.push(base)
        const nombreFinal = partesNombre.join(' ')

        await api.actualizarProducto(producto.id, {
          nombre: nombreFinal,
          modelo: modelo.trim() || null,
          marca: marca.trim() || null,
          ram: ramFinal,
          almacenamiento: almacenamientoFinal,
          color: colorFinal,
        })
      }

      await api.actualizarEquipo(equipo.id, {
        imei1: imei1.trim() || null,
        imei2: imei2.trim() || null,
        ram: ramFinal,
        almacenamiento: almacenamientoFinal,
        color: colorFinal,
        listaBlanca,
        notas: notas.trim() || null,
      })
      avisos.exito('Equipo actualizado')
      onListo()
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo actualizar el equipo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-3">
      {/* IMEIs */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-bold text-tinta-suave">IMEI 1</label>
          <div className="flex items-center gap-1.5">
            <input
              value={imei1}
              aria-invalid={errorImei1 !== undefined}
              onChange={(e) => cambiarImei1(e.target.value)}
              className={`min-w-0 flex-1 rounded-xl border bg-superficie px-3.5 py-3 text-[1rem] text-tinta placeholder:text-tinta-tenue focus:border-accion focus:ring-2 focus:ring-accion/15 focus:outline-none ${
                errorImei1 === undefined ? 'border-borde' : 'border-falta'
              }`}
              inputMode="text"
              placeholder="Hasta 25 caracteres"
            />
            <input
              ref={refCamaraImei1}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei1', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Tomar foto de IMEI 1"
              title="Tomar foto con cámara"
              disabled={leyendoFotoImei !== null}
              onClick={() => refCamaraImei1.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
            >
              <Camera className="size-5" strokeWidth={2} />
            </button>
            <input
              ref={refGaleriaImei1}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei1', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Subir foto de IMEI 1"
              title="Subir foto de galería"
              disabled={leyendoFotoImei !== null}
              onClick={() => refGaleriaImei1.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei1' && (
            <p className="text-[0.75rem] font-medium text-accion animate-pulse">
              Leyendo foto de IMEI 1…
            </p>
          )}
          {errorImei1 !== undefined && (
            <p className="text-[0.75rem] font-medium text-falta">{errorImei1}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-bold text-tinta-suave">IMEI 2 (Opcional)</label>
          <div className="flex items-center gap-1.5">
            <input
              value={imei2}
              aria-invalid={errorImei2 !== undefined}
              onChange={(e) => cambiarImei2(e.target.value)}
              className={`min-w-0 flex-1 rounded-xl border bg-superficie px-3.5 py-3 text-[1rem] text-tinta placeholder:text-tinta-tenue focus:border-accion focus:ring-2 focus:ring-accion/15 focus:outline-none ${
                errorImei2 === undefined ? 'border-borde' : 'border-falta'
              }`}
              inputMode="text"
              placeholder="Opcional (hasta 25 caracteres)"
            />
            <input
              ref={refCamaraImei2}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei2', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Tomar foto de IMEI 2"
              title="Tomar foto con cámara"
              disabled={leyendoFotoImei !== null}
              onClick={() => refCamaraImei2.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
            >
              <Camera className="size-5" strokeWidth={2} />
            </button>
            <input
              ref={refGaleriaImei2}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0]
                if (a) setRecorteImei({ tipo: 'imei2', archivo: a })
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Subir foto de IMEI 2"
              title="Subir foto de galería"
              disabled={leyendoFotoImei !== null}
              onClick={() => refGaleriaImei2.current?.click()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei2' && (
            <p className="text-[0.75rem] font-medium text-accion animate-pulse">
              Leyendo foto de IMEI 2…
            </p>
          )}
          {errorImei2 !== undefined && (
            <p className="text-[0.75rem] font-medium text-falta">{errorImei2}</p>
          )}
        </div>
      </div>

      <CampoTexto
        etiqueta="Modelo"
        value={modelo}
        onChange={(e) => setModelo(e.target.value)}
        placeholder="Modelo del equipo"
        autoComplete="off"
      />

      {/* Fila simétrica con los 3 desplegables: RAM, Almacenamiento y Color */}
      <div className="grid grid-cols-3 gap-2 w-full">
        <CampoSelect
          etiqueta="RAM"
          value={ram}
          onChange={(e) => setRam(e.target.value)}
          opciones={OPCIONES_RAM}
          placeholder="-"
        />
        <CampoSelect
          etiqueta="Almacenamiento"
          value={almacenamiento}
          onChange={(e) => setAlmacenamiento(e.target.value)}
          opciones={OPCIONES_ALMACENAMIENTO}
          placeholder="-"
        />
        <CampoSelect
          etiqueta="Color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          opciones={OPCIONES_COLOR}
          placeholder="-"
        />
      </div>

      <CampoMarcaPredictivo value={marca} onChange={setMarca} placeholder="" />

      <SelectorEquipo
        etiqueta="Lista blanca"
        valor={listaBlanca}
        opciones={[
          ['registered', 'Registrado'],
          ['not_registered', 'No registrado'],
        ]}
        onChange={setListaBlanca}
      />

      <CampoTexto
        etiqueta="Nota u observación"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Opcional"
      />

      <Boton ancho cargando={enviando} onClick={() => void guardar()}>
        Guardar cambios de equipo
      </Boton>

      <ModalRecorteImagen
        abierto={recorteImei !== null}
        archivo={recorteImei?.archivo ?? null}
        titulo={recorteImei?.tipo === 'imei1' ? 'Recortar IMEI 1' : 'Recortar IMEI 2'}
        subtitulo="Enfoca los dígitos del código o usa la foto completa"
        onConfirmar={(resultado) => {
          const tipo = recorteImei?.tipo
          setRecorteImei(null)
          if (tipo) void procesarFotoImei(tipo, resultado)
        }}
        onCancelar={() => setRecorteImei(null)}
      />
    </div>
  )
}

/** Formulario para editar la ficha global del producto */
function FormularioEdicionProducto({
  producto,
  onCerrar,
  onDesactivar,
  onEliminar,
  onGuardado,
}: {
  producto: ProductoConStock
  onCerrar: () => void
  onDesactivar: () => void
  onEliminar: () => void
  onGuardado: () => void
}) {
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const [nombre, setNombre] = useState(producto.nombre)
  const [marca, setMarca] = useState(producto.marca ?? '')
  const [modelo, setModelo] = useState(producto.modelo ?? '')
  const [ram, setRam] = useState(producto.ram ?? '')
  const [almacenamiento, setAlmacenamiento] = useState(producto.almacenamiento ?? '')
  const [color, setColor] = useState(producto.color ?? '')
  const [venta, setVenta] = useState(String(producto.precioVenta || ''))
  const [costo, setCosto] = useState(String(producto.precioCosto || ''))
  const [minimo, setMinimo] = useState(String(producto.stockMinimo || ''))
  const [notas, setNotas] = useState(producto.notas ?? '')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const numeroSeguro = (valor: string) => {
    const n = Number(valor.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  const actualizarVariante = (cambio: {
    ram?: string
    almacenamiento?: string
    color?: string
  }) => {
    const nuevaRam = cambio.ram !== undefined ? cambio.ram : ram
    const nuevoAlmacenamiento =
      cambio.almacenamiento !== undefined ? cambio.almacenamiento : almacenamiento
    const nuevoColor = cambio.color !== undefined ? cambio.color : color

    if (cambio.ram !== undefined) setRam(cambio.ram)
    if (cambio.almacenamiento !== undefined) setAlmacenamiento(cambio.almacenamiento)
    if (cambio.color !== undefined) setColor(cambio.color)

    const rFinal = nuevaRam.trim() === '' ? null : normalizarRam(nuevaRam)
    const aFinal =
      nuevoAlmacenamiento.trim() === '' ? null : normalizarAlmacenamiento(nuevoAlmacenamiento)
    const cFinal = nuevoColor.trim() === '' ? null : normalizarColor(nuevoColor)

    setNombre((prev) =>
      actualizarNombreConVariantes(prev, {
        ramAnterior: producto.ram,
        ramNueva: rFinal,
        almacenamientoAnterior: producto.almacenamiento,
        almacenamientoNuevo: aFinal,
        colorAnterior: producto.color,
        colorNuevo: cFinal,
      }),
    )
  }

  const guardar = async () => {
    if (!nombre.trim()) {
      avisos.error('Escribe el nombre del producto')
      return
    }
    setEnviando(true)
    try {
      const ramFinal = ram.trim() === '' ? null : normalizarRam(ram)
      const almacenamientoFinal =
        almacenamiento.trim() === '' ? null : normalizarAlmacenamiento(almacenamiento)
      const colorFinal = color.trim() === '' ? null : normalizarColor(color)

      await api.actualizarProducto(producto.id, {
        nombre: nombre.trim(),
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        ram: ramFinal,
        almacenamiento: almacenamientoFinal,
        color: colorFinal,
        precioVenta: numeroSeguro(venta),
        precioCosto: numeroSeguro(costo),
        stockMinimo: Math.trunc(numeroSeguro(minimo)),
        notas: notas.trim() || null,
      })
      avisos.exito(`${nombre.trim()} actualizado`)
      void cliente.invalidateQueries({ queryKey: ['marcas'] })
      onGuardado()
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo actualizar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-3">
      <CampoTexto
        etiqueta="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <CampoMarcaPredictivo value={marca} onChange={setMarca} />
        <CampoTexto etiqueta="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
      </div>

      {/* Fila simétrica con los 3 desplegables: RAM, Almacenamiento y Color */}
      <div className="grid grid-cols-3 gap-2 w-full">
        <CampoSelect
          etiqueta="RAM"
          value={ram}
          onChange={(e) => actualizarVariante({ ram: e.target.value })}
          opciones={OPCIONES_RAM}
          placeholder="-"
        />
        <CampoSelect
          etiqueta="Almacenamiento"
          value={almacenamiento}
          onChange={(e) => actualizarVariante({ almacenamiento: e.target.value })}
          opciones={OPCIONES_ALMACENAMIENTO}
          placeholder="-"
        />
        <CampoSelect
          etiqueta="Color"
          value={color}
          onChange={(e) => actualizarVariante({ color: e.target.value })}
          opciones={OPCIONES_COLOR}
          placeholder="-"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto
          etiqueta="Precio venta"
          value={venta}
          onChange={(e) => setVenta(e.target.value)}
          inputMode="decimal"
          sufijo="S/"
        />
        <CampoTexto
          etiqueta="Costo"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          inputMode="decimal"
          sufijo="S/"
        />
      </div>

      <CampoTexto
        etiqueta="Stock mínimo"
        value={minimo}
        onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ''))}
        inputMode="numeric"
      />
      <CampoTexto
        etiqueta="Notas u observaciones"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-2 mt-1">
        <Boton tono="contorno" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton cargando={enviando} onClick={() => setConfirmando(true)}>
          Guardar cambios
        </Boton>
      </div>

      <div className="mt-2 border-t border-borde pt-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onDesactivar}
          className="min-h-11 w-full rounded-xl text-[0.875rem] font-bold text-alerta active:bg-alerta-tenue transition"
        >
          Desactivar producto
        </button>
        <button
          type="button"
          onClick={onEliminar}
          className="min-h-11 w-full rounded-xl text-[0.875rem] font-bold text-falta active:bg-falta-tenue transition"
        >
          Eliminar producto definitivamente
        </button>
      </div>

      <Confirmacion
        abierta={confirmando}
        titulo={`¿Guardar cambios de ${nombre.trim() || producto.nombre}?`}
        detalle={`Confirma la edición de ${nombre.trim() || producto.nombre}.`}
        confirmar="Guardar cambios"
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => {
          setConfirmando(false)
          void guardar()
        }}
      />
    </div>
  )
}

/** Selector genérico de opciones para equipos (Lista Blanca / Condición) */
function SelectorEquipo<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string
  valor: T
  opciones: readonly (readonly [T, string])[]
  onChange: (valor: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <span className="text-[0.8125rem] font-bold text-tinta-suave">{etiqueta}</span>
      <div className="grid grid-cols-2 gap-2 w-full">
        {opciones.map(([id, texto]) => {
          const seleccionado = valor === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={seleccionado}
              onClick={() => onChange(id)}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-[0.9375rem] font-bold tracking-wide transition leading-none active:scale-[0.98] ${
                seleccionado
                  ? 'border-accion bg-accion text-white shadow-xs'
                  : 'border-borde bg-white text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
              }`}
            >
              <span>{texto}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
