import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AgrupacionVentas, Equipo, ProductoConStock, ReporteVentas, Ubicacion } from '@compartido/tipos'
import { api, ErrorDeApi } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { CampoTexto, SelectorCantidad } from '../componentes/Campo'
import { ErrorEnPantalla, Esqueleto, Vacio } from '../componentes/Estados'
import { Miniatura } from '../componentes/FichaProducto'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { dinero, numero } from '../lib/formato'
import { estadoEquipoVenta, gananciaDeVenta, importeDesdeCampo, seleccionVentaValida } from '../lib/ventas'

const SIN_VENTAS = 'Todavía no hay ventas con precio final en este período.'
const ERROR_IMPORTE = 'Ingresa un importe entre 0 y 9,999,999.'
const OPCION = 'min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-[0.8125rem] font-semibold transition '
const ELEGIDA = 'border-accion bg-accion-tenue text-accion'
const NORMAL = 'border-borde bg-superficie text-tinta-suave active:bg-papel-hundido'

interface SeleccionVenta { producto: ProductoConStock; equipo: Equipo | null }

export function Ventas() {
  const { activa } = useUbicacion()
  return (
    <Marco titulo="Ventas" atras>
      {activa === null
        ? <ErrorEnPantalla mensaje="Crea una ubicación antes de registrar una venta." />
        : <ContenidoVentas key={activa.id} ubicacion={activa} />}
    </Marco>
  )
}

function ContenidoVentas({ ubicacion }: { ubicacion: Ubicacion }) {
  const [texto, setTexto] = useState('')
  const [consulta, setConsulta] = useState('')
  const [seleccion, setSeleccion] = useState<SeleccionVenta | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const temporizador = window.setTimeout(() => setConsulta(texto.trim()), 120)
    return () => window.clearTimeout(temporizador)
  }, [texto])

  const resultados = useQuery({
    queryKey: ['buscar', consulta, ubicacion.id, 'disponibles'],
    queryFn: ({ signal }) => api.buscar(consulta, signal, { ubicacionId: ubicacion.id, filtro: 'disponibles' }),
  })
  const esImei = /^\d{14,17}$/.test(consulta)
  const imei = useQuery({
    queryKey: ['equipo-imei', consulta],
    queryFn: () => api.buscarEquipoPorImei(consulta),
    enabled: esImei,
    staleTime: 0,
  })
  const equipo = esImei ? imei.data?.equipo ?? null : null
  const estadoImei = estadoEquipoVenta(equipo)
  const buscando = texto.trim() !== consulta || resultados.isFetching || (esImei && imei.isFetching)
  // Una coincidencia exacta de unidad se resuelve en su tarjeta para no
  // ofrecer una salida genérica que eluda el estado o el local del IMEI.
  const productos = equipo === null ? resultados.data?.productos ?? [] : []

  return (
    <div className="flex flex-col gap-6">
      <ResumenVentas />
      <section aria-labelledby="buscar-articulo" className="flex flex-col gap-3">
        <div>
          <h2 id="buscar-articulo" className="text-[1rem] font-semibold">Buscar artículo</h2>
          <p className="text-[0.8125rem] text-tinta-tenue">Venta en {ubicacion.nombre}</p>
        </div>
        <CampoTexto
          etiqueta="Artículo o IMEI"
          type="search"
          placeholder="Código, nombre, modelo o IMEI"
          value={texto}
          disabled={enviando}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={120}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {buscando && <p role="status" className="text-[0.8125rem] text-tinta-tenue">Buscando…</p>}
        {esImei && imei.isError && <ErrorEnPantalla mensaje="No se pudo comprobar el IMEI." onReintentar={() => void imei.refetch()} />}
        {equipo !== null && estadoImei === 'vendido' && (
          <ErrorEnPantalla mensaje="Este IMEI ya fue vendido y no se puede registrar otra vez." />
        )}
        {equipo !== null && estadoImei === 'disponible' && (
          <TarjetaImei equipo={equipo} ubicacion={ubicacion} bloqueado={buscando || enviando} onElegir={setSeleccion} />
        )}
        {resultados.isError && <ErrorEnPantalla mensaje="No se pudo buscar. Revisa la conexión." onReintentar={() => void resultados.refetch()} />}
        {resultados.isPending && <Esqueleto filas={2} />}
        {!buscando && resultados.isSuccess && productos.length === 0 && equipo === null && (
          <Vacio titulo="No hay artículos disponibles" detalle="Prueba otro nombre, modelo o código en esta ubicación." />
        )}
        {productos.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Artículos disponibles" aria-busy={buscando}>
            {productos.map((producto) => (
              <li key={producto.id} className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3">
                <Miniatura nombre={producto.nombre} claveImagen={producto.claveImagen} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[0.9375rem] font-semibold">{producto.nombre}</p>
                  {producto.modelo && <p className="break-words text-[0.8125rem] text-tinta-suave">{producto.modelo}</p>}
                  <p className="text-[0.8125rem] text-tinta-tenue">{numero(producto.stock.find((fila) => fila.ubicacionId === ubicacion.id)?.cantidad ?? 0)} en {ubicacion.nombre}</p>
                </div>
                <Boton tono="suave" className="shrink-0 px-3 text-[0.875rem]" disabled={enviando || buscando || (esImei && !imei.isSuccess)} onClick={() => setSeleccion({ producto, equipo: null })}>Vender</Boton>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="registrar-venta" className="flex flex-col gap-3">
        <h2 id="registrar-venta" className="text-[1rem] font-semibold">Registrar venta</h2>
        {seleccion === null
          ? <p className="rounded-xl border border-dashed border-borde-fuerte p-4 text-[0.875rem] text-tinta-tenue">Elige un artículo para revisar los importes y registrar su salida.</p>
          : <FormularioVenta key={`${seleccion.producto.id}-${seleccion.equipo?.id ?? 'producto'}`} seleccion={seleccion} ubicacion={ubicacion} enviando={enviando} onEnviando={setEnviando} onCancelar={() => setSeleccion(null)} onListo={() => { setSeleccion(null); setTexto(''); setConsulta('') }} />}
      </section>
    </div>
  )
}

function TarjetaImei({ equipo, ubicacion, bloqueado, onElegir }: { equipo: Equipo; ubicacion: Ubicacion; bloqueado: boolean; onElegir: (seleccion: SeleccionVenta) => void }) {
  const mismoLocal = equipo.ubicacionId === ubicacion.id
  const producto = useQuery({
    queryKey: ['producto', equipo.productoId],
    queryFn: () => api.producto(equipo.productoId),
    enabled: mismoLocal,
  })
  return (
    <div className="flex flex-col gap-2 rounded-tarjeta border border-accion/30 bg-accion-tenue p-4">
      <h3 className="font-semibold text-accion">IMEI encontrado</h3>
      <p className="break-words font-medium">{equipo.productoNombre}</p>
      <p className="break-all text-[0.8125rem] text-tinta-suave">{[equipo.imei1, equipo.imei2].filter(Boolean).join(' · ')}</p>
      <p className="text-[0.875rem] text-tinta-suave">En {equipo.ubicacionNombre}</p>
      {!mismoLocal && <p className="text-[0.875rem]">Este equipo está en otra ubicación. Traspásalo a {ubicacion.nombre} para venderlo aquí.</p>}
      {mismoLocal && producto.isError && <ErrorEnPantalla mensaje="No se pudo cargar el artículo del IMEI." onReintentar={() => void producto.refetch()} />}
      {mismoLocal && <Boton disabled={bloqueado || !producto.isSuccess} onClick={() => { if (producto.data) onElegir({ producto: producto.data.producto, equipo }) }}>Vender este IMEI</Boton>}
    </div>
  )
}

function FormularioVenta({ seleccion, ubicacion, enviando, onEnviando, onCancelar, onListo }: { seleccion: SeleccionVenta; ubicacion: Ubicacion; enviando: boolean; onEnviando: (enviando: boolean) => void; onCancelar: () => void; onListo: () => void }) {
  const cliente = useQueryClient()
  const avisos = useAvisos()
  const formulario = useRef<HTMLFormElement>(null)
  const guardando = useRef(false)
  const [cantidad, setCantidad] = useState(1)
  const [costoTexto, setCostoTexto] = useState(seleccion.producto.precioCosto.toFixed(2))
  const [precioTexto, setPrecioTexto] = useState(seleccion.producto.precioVenta.toFixed(2))
  const [equipoId, setEquipoId] = useState(seleccion.equipo?.id ?? null)
  const [validando, setValidando] = useState(false)
  const detalle = useQuery({ queryKey: ['producto', seleccion.producto.id], queryFn: () => api.producto(seleccion.producto.id), staleTime: 0 })
  const unidades = useQuery({ queryKey: ['equipos', seleccion.producto.id], queryFn: () => api.equiposDeProducto(seleccion.producto.id, true), staleTime: 0 })
  const producto = detalle.data?.producto ?? seleccion.producto
  const equipos = unidades.data?.equipos ?? []
  const equiposDisponibles = equipos.filter((unidad) => unidad.activo && unidad.ubicacionId === ubicacion.id)
  const equipoElegido = equipos.find((unidad) => unidad.id === equipoId) ?? seleccion.equipo
  const ubicacionVenta = equipoElegido === null ? ubicacion : { id: equipoElegido.ubicacionId, nombre: equipoElegido.ubicacionNombre }
  const stock = producto.stock.find((fila) => fila.ubicacionId === ubicacionVenta.id)?.cantidad ?? 0
  const conImei = equipos.length > 0 || seleccion.equipo !== null
  const costo = importeDesdeCampo(costoTexto)
  const precio = importeDesdeCampo(precioTexto)
  const cantidadVenta = conImei ? 1 : cantidad
  const seleccionValida = detalle.isSuccess && unidades.isSuccess && !detalle.isFetching && !unidades.isFetching
    && ubicacionVenta.id === ubicacion.id && seleccionVentaValida(producto, ubicacionVenta.id, cantidadVenta, equipoElegido, equipos)

  useEffect(() => {
    setCantidad(1)
    setCostoTexto(seleccion.producto.precioCosto.toFixed(2))
    setPrecioTexto(seleccion.producto.precioVenta.toFixed(2))
    setEquipoId(seleccion.equipo?.id ?? null)
    setValidando(false)
    formulario.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [seleccion])

  const guardar = async (): Promise<void> => {
    if (guardando.current) return
    setValidando(true)
    const costo = importeDesdeCampo(costoTexto)
    const precio = importeDesdeCampo(precioTexto)
    if (costo === null || precio === null || !seleccionValida) return
    guardando.current = true
    onEnviando(true)
    try {
      await api.venta({
        productoId: producto.id,
        ubicacionId: ubicacionVenta.id,
        cantidad: equipoElegido === null ? cantidad : 1,
        costoUnitario: costo,
        precioVentaUnitario: precio,
        ...(equipoElegido === null ? {} : { equipoIds: [equipoElegido.id] }),
      })
      for (const clave of ['inicio', 'buscar', 'producto', 'movimientos', 'reporte-ventas', 'equipos', 'equipo-imei']) {
        void cliente.invalidateQueries({ queryKey: [clave] })
      }
      avisos.exito(`Venta de ${numero(cantidadVenta)} registrada en ${ubicacionVenta.nombre}`)
      onListo()
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo registrar la venta. Intenta de nuevo.')
    } finally {
      guardando.current = false
      onEnviando(false)
    }
  }

  return (
    <form ref={formulario} onSubmit={(evento) => { evento.preventDefault(); void guardar() }} className="scroll-mt-3 rounded-tarjeta border border-borde bg-superficie p-4">
      <fieldset disabled={enviando} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">Datos de la venta</legend>
        <div className="flex items-start gap-3">
          <Miniatura nombre={producto.nombre} claveImagen={producto.claveImagen} />
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold">{producto.nombre}</h3>
            {producto.modelo && <p className="text-[0.875rem] text-tinta-suave">{producto.modelo}</p>}
            <p className="text-[0.8125rem] text-tinta-tenue">{numero(stock)} en {ubicacionVenta.nombre}</p>
          </div>
        </div>
        {(detalle.isPending || unidades.isPending) && <p role="status" className="text-[0.875rem] text-tinta-tenue">Comprobando existencias e IMEI…</p>}
        {(detalle.isError || unidades.isError) && <ErrorEnPantalla mensaje="No se pudo comprobar la disponibilidad del artículo." onReintentar={() => { void detalle.refetch(); void unidades.refetch() }} />}
        {unidades.isSuccess && (conImei ? (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-[0.8125rem] font-medium text-tinta-suave">Elige el IMEI · 1 unidad</legend>
            {equiposDisponibles.map((unidad) => (
              <label key={unidad.id} className={`flex min-h-toque items-center gap-3 rounded-xl border p-3 text-[0.875rem] ${equipoId === unidad.id ? ELEGIDA : NORMAL}`}>
                <input type="radio" name="equipo-venta" value={unidad.id} checked={equipoId === unidad.id} onChange={() => setEquipoId(unidad.id)} className="size-5 shrink-0 accent-accion" />
                <span className="min-w-0 break-all">{unidad.imei1 ?? unidad.imei2 ?? `Unidad ${unidad.id}`}{unidad.imei1 && unidad.imei2 ? <span className="block text-[0.75rem]">IMEI 2: {unidad.imei2}</span> : null}</span>
              </label>
            ))}
            {equiposDisponibles.length === 0 && <p className="text-[0.875rem] text-falta">No quedan equipos disponibles en esta ubicación.</p>}
          </fieldset>
        ) : <div className="flex flex-col gap-2"><p className="text-[0.8125rem] font-medium text-tinta-suave">Unidades que salen</p><SelectorCantidad valor={cantidad} onCambio={setCantidad} maximo={Math.max(1, stock)} /></div>)}
        <CampoTexto etiqueta="Costo de compra real" type="text" inputMode="decimal" value={costoTexto} onChange={(evento) => setCostoTexto(evento.target.value)} error={validando && costo === null ? ERROR_IMPORTE : undefined} ayuda="Por unidad, en soles." />
        <CampoTexto etiqueta="Precio final de venta" type="text" inputMode="decimal" value={precioTexto} onChange={(evento) => setPrecioTexto(evento.target.value)} error={validando && precio === null ? ERROR_IMPORTE : undefined} ayuda="Por unidad, en soles." />
        <p role="status" className="break-words rounded-xl bg-accion-tenue p-3 text-[0.9375rem]">Ganancia bruta: <strong>{costo !== null && precio !== null ? dinero(gananciaDeVenta(costo, precio, cantidadVenta)) : 'Revisa los importes'}</strong></p>
        {detalle.isSuccess && stock < 1 && <p className="text-[0.875rem] text-falta">Este artículo ya no tiene stock en la ubicación de venta.</p>}
        <Boton type="submit" ancho cargando={enviando} disabled={!seleccionValida} aria-label="Registrar venta">Registrar venta</Boton>
        <Boton tono="contorno" ancho onClick={onCancelar}>Cancelar</Boton>
      </fieldset>
    </form>
  )
}

function ResumenVentas() {
  const [agrupacion, setAgrupacion] = useState<AgrupacionVentas>('dia')
  const [dias, setDias] = useState(30)
  const reporte = useQuery({ queryKey: ['reporte-ventas', agrupacion, dias], queryFn: () => api.reporteVentas(agrupacion, dias) })
  return (
    <section aria-labelledby="resumen-ganancias" className="flex flex-col gap-3">
      <div><h2 id="resumen-ganancias" className="text-[1rem] font-semibold">Resumen de ganancias</h2><p className="text-[0.8125rem] text-tinta-tenue">Todas las ubicaciones · importes en soles</p></div>
      <fieldset aria-label="Agrupar reporte de ventas" className="flex min-w-0 gap-2">
        <legend className="sr-only">Agrupar reporte de ventas</legend>
        {(['dia', 'semana'] as const).map((valor) => <button key={valor} type="button" aria-pressed={agrupacion === valor} onClick={() => setAgrupacion(valor)} className={OPCION + (agrupacion === valor ? ELEGIDA : NORMAL)}>{valor === 'dia' ? 'Por día' : 'Por semana'}</button>)}
      </fieldset>
      <fieldset aria-label="Período del reporte" className="flex min-w-0 gap-2">
        <legend className="sr-only">Período del reporte</legend>
        {[7, 30, 90].map((valor) => <button key={valor} type="button" aria-pressed={dias === valor} onClick={() => setDias(valor)} className={OPCION + (dias === valor ? ELEGIDA : NORMAL)}>{valor} días</button>)}
      </fieldset>
      {reporte.isPending && <Esqueleto filas={2} />}
      {reporte.isError && <ErrorEnPantalla mensaje="No se pudo cargar el reporte de ventas." onReintentar={() => void reporte.refetch()} />}
      {reporte.isSuccess && <DatosReporte reporte={reporte.data} />}
    </section>
  )
}

function DatosReporte({ reporte }: { reporte: ReporteVentas }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-2" aria-label="Cifras de ventas">
        <Cifra etiqueta="Ventas" valor={dinero(reporte.resumen.ventas)} />
        <Cifra etiqueta="Costo" valor={dinero(reporte.resumen.costo)} />
        <Cifra etiqueta="Ganancia bruta" valor={dinero(reporte.resumen.ganancia)} />
        <Cifra etiqueta="Unidades" valor={numero(reporte.resumen.unidades)} />
      </dl>
      <Desglose titulo={reporte.agrupacion === 'dia' ? 'Ventas por día' : 'Ventas por semana'}>
        {reporte.periodos.length === 0 ? <Vacio titulo={SIN_VENTAS} /> : <ul className="divide-y divide-borde">{reporte.periodos.map((periodo) => <li key={periodo.inicio} className="py-3"><p className="text-[0.875rem] font-semibold">{periodo.etiqueta}</p><div className="mt-1 grid grid-cols-2 gap-2 text-[0.8125rem]"><p className="break-words">Ventas <strong className="cifras block">{dinero(periodo.ventas)}</strong></p><p className="break-words">Ganancia <strong className="cifras block">{dinero(periodo.ganancia)}</strong></p></div></li>)}</ul>}
      </Desglose>
      <Desglose titulo="Por producto">
        {reporte.productos.length === 0 ? <Vacio titulo={SIN_VENTAS} /> : <ul className="divide-y divide-borde">{reporte.productos.map((producto) => <FilaDesglose key={producto.productoId} nombre={producto.productoNombre} unidades={producto.unidades} ganancia={producto.ganancia} />)}</ul>}
      </Desglose>
      <Desglose titulo="Por ubicación">
        {reporte.ubicaciones.length === 0 ? <Vacio titulo={SIN_VENTAS} /> : <ul className="divide-y divide-borde">{reporte.ubicaciones.map((ubicacion) => <FilaDesglose key={ubicacion.ubicacionId} nombre={ubicacion.ubicacionNombre} unidades={ubicacion.unidades} ganancia={ubicacion.ganancia} />)}</ul>}
      </Desglose>
    </>
  )
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return <div className="min-w-0 rounded-xl border border-borde bg-superficie p-3"><dt className="text-[0.75rem] text-tinta-tenue">{etiqueta}</dt><dd className="cifras mt-1 break-words text-[1.0625rem] font-semibold">{valor}</dd></div>
}

function Desglose({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <details className="rounded-xl border border-borde bg-superficie px-3"><summary className="min-h-11 cursor-pointer py-3 text-[0.875rem] font-semibold">{titulo}</summary>{children}</details>
}

function FilaDesglose({ nombre, unidades, ganancia }: { nombre: string; unidades: number; ganancia: number }) {
  return <li className="py-3"><p className="break-words text-[0.875rem] font-semibold">{nombre}</p><div className="mt-1 flex flex-wrap justify-between gap-2 text-[0.8125rem]"><span>{numero(unidades)} unidades</span><span className="cifras break-words">Ganancia: <strong>{dinero(ganancia)}</strong></span></div></li>
}
