/**
 * Ficha de un producto: existencias, acciones e historial.
 *
 * El historial esta en la misma pantalla y no detras de una pestana porque es
 * donde se responde la pregunta que trae a la dueña aquí: "por que hay menos
 * de lo que debería".
 */

import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { ErrorDeApi, api, urlDeImagen } from '../api/cliente'
import { AccionesProducto } from '../componentes/AccionesProducto'
import { SugerenciaReposicion } from '../componentes/SugerenciaReposicion'
import { Boton } from '../componentes/Boton'
import { Esqueleto, ErrorEnPantalla, Etiqueta, Vacio } from '../componentes/Estados'
import { DesgloseStock, Miniatura } from '../componentes/FichaProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { CampoTexto } from '../componentes/Campo'
import { Confirmacion } from '../componentes/Confirmacion'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { NOMBRE_MOVIMIENTO, cuandoFue, dinero, fechaLarga, numero } from '../lib/formato'
import { prepararFoto } from '../lib/imagen'
import type { ProductoConStock } from '@compartido/tipos'

export function Producto() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { activa } = useUbicacion()

  const [acciones, setAcciones] = useState(false)
  const [altaEquipo, setAltaEquipo] = useState(false)
  const [administrar, setAdministrar] = useState(false)
  const [accionProducto, setAccionProducto] = useState<'desactivar' | 'eliminar' | null>(null)
  const [imagenPorQuitar, setImagenPorQuitar] = useState<{ id: string; clave: string } | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const refFotos = useRef<HTMLInputElement>(null)

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

  const galeria = useQuery({ queryKey: ['imagenes', id], queryFn: () => api.imagenesDeProducto(id), enabled: id !== '' })

  const deshacer = async (movimientoId: string): Promise<void> => {
    try {
      await api.deshacer(movimientoId)
      avisos.información('Movimiento deshecho')
      void cliente.invalidateQueries({ queryKey: ['producto', id] })
      void cliente.invalidateQueries({ queryKey: ['movimientos', id] })
      void cliente.invalidateQueries({ queryKey: ['inicio'] })
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo deshacer')
    }
  }

  if (producto.isPending) {
    return (
      <Marco titulo="Producto" atras>
        <Esqueleto filas={4} />
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

  return (
    <Marco titulo={ficha.nombre} atras>
      <div className="flex flex-col gap-6">
        <section className="flex items-start gap-3.5">
          <Miniatura nombre={ficha.nombre} claveImagen={ficha.claveImagen} tamano="grande" />

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-[1.125rem] leading-snug font-semibold">{ficha.nombre}</h2>
            <p className="text-[0.875rem] text-tinta-tenue">
              {[ficha.marca, ficha.modelo, ficha.categoriaNombre]
                .filter((x) => x !== null && x !== '')
                .join(' · ') || 'Sin marca'}
            </p>
            <p className="cifras text-[0.8125rem] text-tinta-tenue">{ficha.codigo}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <span
              className={[
                'cifras text-cifra',
                bajoMinimo ? 'text-alerta' : 'text-tinta',
              ].join(' ')}
            >
              {numero(ficha.stockTotal)}
            </span>
            <span className="text-[0.6875rem] text-tinta-tenue">en total</span>
          </div>
          <button type="button" aria-label={`Administrar ${ficha.nombre}`} onClick={() => setAdministrar(true)} className="-mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl text-accion active:bg-accion-tenue"><svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button>
        </section>

        {bajoMinimo && (
          <p className="rounded-xl border border-alerta/30 bg-alerta-tenue px-4 py-3 text-[0.9375rem] text-tinta">
            Por debajo del mínimo de {numero(ficha.stockMinimo)} piezas.
          </p>
        )}

        <Boton ancho onClick={() => setAcciones(true)}>
          Registrar movimiento
        </Boton>

        <SugerenciaReposicion producto={ficha} />

        <section className="flex flex-col gap-2">
          <Etiqueta>Existencias</Etiqueta>
          <DesgloseStock producto={ficha} ubicacionActivaId={activa?.id} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><Etiqueta>Fotos del producto</Etiqueta><span className="text-[0.75rem] text-tinta-tenue">{galeria.data?.imagenes.length ?? 0}/5</span></div>
          <div className="grid grid-cols-3 gap-2">
            {(galeria.data?.imagenes ?? []).map((imagen) => <div key={imagen.id} className="relative aspect-square overflow-hidden rounded-2xl border border-borde bg-papel-hundido"><img src={urlDeImagen(imagen.clave) ?? ''} alt={`Foto ${imagen.posicion + 1} de ${ficha.nombre}`} className="size-full object-cover" /><button type="button" aria-label={`Quitar foto ${imagen.posicion + 1}`} onClick={() => setImagenPorQuitar(imagen)} className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-tinta/70 text-white"><X aria-hidden="true" className="size-4" strokeWidth={2.5} /></button></div>)}
            {(galeria.data?.imagenes.length ?? 0) < 5 && <button type="button" disabled={subiendoImagen} onClick={() => refFotos.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-accion/40 bg-accion-tenue text-[0.8125rem] font-semibold text-accion disabled:opacity-50">{subiendoImagen ? 'Subiendo…' : '+ Foto'}</button>}
          </div>
          <input ref={refFotos} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const archivo = e.target.files?.[0]; e.target.value = ''; if (archivo === undefined) return; void (async () => { setSubiendoImagen(true); try { const preparada = await prepararFoto(archivo); await api.agregarImagenProducto(ficha.id, preparada.archivo); void cliente.invalidateQueries({ queryKey: ['imagenes', id] }); avisos.exito('Foto agregada') } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo agregar la foto') } finally { setSubiendoImagen(false) } })() }} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Etiqueta>Equipos individuales</Etiqueta>
            <button type="button" onClick={() => setAltaEquipo(true)} className="min-h-11 rounded-xl bg-accion-tenue px-3 text-[0.875rem] font-semibold text-accion">
              + Registrar equipo
            </button>
          </div>
          {equipos.isPending && <Esqueleto filas={2} />}
          {equipos.isSuccess && equipos.data.equipos.length === 0 && <p className="rounded-xl bg-papel-hundido px-4 py-3 text-[0.875rem] text-tinta-tenue">Este modelo aún no tiene IMEI registrados.</p>}
          {equipos.isSuccess && equipos.data.equipos.length > 0 && <ul className="flex flex-col gap-2">{equipos.data.equipos.map((equipo) => <li key={equipo.id} className={`rounded-2xl border p-3 ${equipo.activo ? 'border-borde bg-superficie' : 'border-borde bg-papel-hundido opacity-70'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[0.875rem] font-semibold">{equipo.imei1 ?? equipo.imei2 ?? 'Sin IMEI registrado'}</p>{equipo.imei2 !== null && <p className="cifras mt-0.5 text-[0.75rem] text-tinta-tenue">IMEI 2 · {equipo.imei2}</p>}<p className="mt-1 text-[0.75rem] text-tinta-tenue" title={fechaLarga(equipo.creadoEn)}>Agregado {fechaLarga(equipo.creadoEn)}</p></div><div className="flex shrink-0 flex-col items-end gap-1">{!equipo.activo && <span className="rounded-full bg-papel-hundido px-2 py-1 text-[0.6875rem] font-semibold text-tinta-suave">Vendido o retirado</span>}<span className={`rounded-full px-2 py-1 text-[0.6875rem] font-semibold ${equipo.listaBlanca === 'registered' ? 'bg-exito-tenue text-exito' : 'bg-falta-tenue text-falta'}`}>{equipo.listaBlanca === 'registered' ? 'Registrado' : 'No registrado'}</span><span className={`rounded-full px-2 py-1 text-[0.6875rem] font-semibold ${equipo.condicion === 'new' ? 'bg-accion-tenue text-accion' : 'bg-alerta-tenue text-alerta'}`}>{equipo.condicion === 'new' ? 'Nuevo' : 'Segunda mano'}</span></div></div></li>)}</ul>}
        </section>

        {(ficha.precioVenta > 0 || ficha.precioCosto > 0) && (
          <section className="flex flex-col gap-2">
            <Etiqueta>Precios</Etiqueta>
            <div className="grid grid-cols-3 gap-2">
              <Dato titulo="Venta" valor={dinero(ficha.precioVenta)} />
              <Dato titulo="Costo" valor={dinero(ficha.precioCosto)} />
              <Dato
                titulo="Margen"
                valor={dinero(margen)}
                tono={margen < 0 ? 'falta' : 'exito'}
              />
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <Etiqueta>Historial</Etiqueta>

          {movimientos.isPending && <Esqueleto filas={3} />}

          {movimientos.isSuccess && movimientos.data.movimientos.length === 0 && (
            <Vacio titulo="Sin movimientos" detalle="Todavía no se ha registrado nada de este producto." />
          )}

          {movimientos.isSuccess && movimientos.data.movimientos.length > 0 && (
            <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
              {movimientos.data.movimientos.map((movimiento) => {
                const entra = movimiento.ubicacionDestinoId !== null
                const revertido = movimiento.revertidoEn !== null

                return (
                  <li key={movimiento.id} className="flex items-center gap-3 px-3.5 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-[0.9375rem] font-medium">
                        {NOMBRE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo}
                        {revertido && (
                          <span className="ml-2 rounded-md bg-papel-hundido px-1.5 py-0.5 text-[0.6875rem] font-semibold text-tinta-tenue">
                            deshecho
                          </span>
                        )}
                      </p>

                      <p className="text-[0.8125rem] text-tinta-tenue">
                        {[movimiento.ubicacionOrigenNombre, movimiento.ubicacionDestinoNombre]
                          .filter((x) => x !== null)
                          .join(' → ')}
                      </p>

                      {movimiento.nota !== null && movimiento.nota !== '' && (
                        <p className="text-[0.8125rem] text-tinta-suave italic">{movimiento.nota}</p>
                      )}

                      <p
                        className="text-[0.75rem] text-tinta-tenue"
                        title={fechaLarga(movimiento.creadoEn)}
                      >
                        {cuandoFue(movimiento.creadoEn)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={[
                          'cifras text-[1.0625rem] font-semibold',
                          revertido
                            ? 'text-tinta-tenue line-through'
                            : entra
                              ? 'text-exito'
                              : 'text-falta',
                        ].join(' ')}
                      >
                        {entra ? '+' : '−'}
                        {numero(movimiento.cantidad)}
                      </span>

                      {!revertido && (
                        <button
                          type="button"
                          onClick={() => void deshacer(movimiento.id)}
                          className="min-h-11 px-2 text-[0.8125rem] font-semibold text-accion"
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
        </section>
      </div>

      <HojaInferior abierta={acciones} onCerrar={() => setAcciones(false)} titulo="Registrar">
        <AccionesProducto
          producto={ficha}
          onCambio={() => {
            void cliente.invalidateQueries({ queryKey: ['movimientos', id] })
          }}
          onListo={() => setAcciones(false)}
        />
      </HojaInferior>

      <HojaInferior abierta={altaEquipo} onCerrar={() => setAltaEquipo(false)} titulo={`Registrar equipo · ${ficha.nombre}`}>
        <FormularioAltaEquipo productoId={ficha.id} productoNombre={ficha.nombre} onListo={() => { setAltaEquipo(false); void cliente.invalidateQueries({ queryKey: ['equipos', id] }); void cliente.invalidateQueries({ queryKey: ['producto', id] }); void cliente.invalidateQueries({ queryKey: ['movimientos', id] }); void cliente.invalidateQueries({ queryKey: ['inicio'] }) }} />
      </HojaInferior>

      <HojaInferior abierta={administrar} onCerrar={() => setAdministrar(false)} titulo={`Administrar · ${ficha.nombre}`}>
        <FormularioEdicionProducto producto={ficha} onCerrar={() => setAdministrar(false)} onDesactivar={() => setAccionProducto('desactivar')} onEliminar={() => setAccionProducto('eliminar')} onGuardado={() => { setAdministrar(false); void cliente.invalidateQueries({ queryKey: ['producto', id] }); void cliente.invalidateQueries({ queryKey: ['buscar'] }); void cliente.invalidateQueries({ queryKey: ['inicio'] }) }} />
      </HojaInferior>

      <Confirmacion abierta={imagenPorQuitar !== null} titulo={`¿Quitar foto de ${ficha.nombre}?`} detalle={`La imagen se eliminará de ${ficha.nombre}. Esta acción no se puede deshacer.`} confirmar="Quitar foto" peligro onCancelar={() => setImagenPorQuitar(null)} onConfirmar={() => { if (imagenPorQuitar === null) return; void (async () => { try { await api.quitarImagenProducto(ficha.id, imagenPorQuitar.id); void cliente.invalidateQueries({ queryKey: ['imagenes', id] }); void cliente.invalidateQueries({ queryKey: ['producto', id] }); avisos.exito('Foto eliminada') } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo quitar la foto') } finally { setImagenPorQuitar(null) } })() }} />

      <Confirmacion abierta={accionProducto !== null} titulo={accionProducto === 'eliminar' ? `¿Eliminar ${ficha.nombre}?` : `¿Desactivar ${ficha.nombre}?`} detalle={accionProducto === 'eliminar' ? `${ficha.nombre} solo se eliminará si no tiene historial. Si ya se registraron movimientos o IMEI, podrás desactivarlo para conservar la información.` : `${ficha.nombre} dejará de aparecer en las búsquedas y se conservará su historial.`} confirmar={accionProducto === 'eliminar' ? 'Eliminar producto' : 'Desactivar'} peligro onCancelar={() => setAccionProducto(null)} onConfirmar={() => { if (accionProducto === null) return; void (async () => { try { if (accionProducto === 'eliminar') { await api.eliminarProducto(ficha.id); avisos.exito(`${ficha.nombre} eliminado`); navegar('/buscar') } else { await api.actualizarProducto(ficha.id, { activo: false }); avisos.exito(`${ficha.nombre} desactivado`); setAdministrar(false); void cliente.invalidateQueries({ queryKey: ['producto', id] }); void cliente.invalidateQueries({ queryKey: ['buscar'] }); void cliente.invalidateQueries({ queryKey: ['inicio'] }) } } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo guardar el cambio') } finally { setAccionProducto(null) } })() }} />

      {ficha.notas !== null && ficha.notas !== '' && (
        <p className="mt-4 rounded-xl bg-papel-hundido px-4 py-3 text-[0.9375rem] text-tinta-suave">
          {ficha.notas}
        </p>
      )}

      <button
        type="button"
        onClick={() => navegar('/buscar')}
        className="mt-6 w-full rounded-xl px-4 py-3 text-[0.9375rem] font-semibold text-accion"
      >
        Buscar otro producto
      </button>
    </Marco>
  )
}

function FormularioAltaEquipo({ productoId, productoNombre, onListo }: { productoId: string; productoNombre: string; onListo: () => void }) {
  const avisos = useAvisos()
  const { activa } = useUbicacion()
  const [imei1, setImei1] = useState('')
  const [imei2, setImei2] = useState('')
  const [listaBlanca, setListaBlanca] = useState<'registered' | 'not_registered'>('not_registered')
  const [condicion, setCondicion] = useState<'new' | 'used'>('new')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const guardar = async (): Promise<void> => {
    if (activa === null) { avisos.error('Elige una ubicación antes de registrar el equipo'); return }
    setEnviando(true)
    try {
      await api.registrarEquipos({ productoId, ubicacionId: activa.id, equipos: [{ imei1: imei1 || null, imei2: imei2 || null, listaBlanca, condicion, notas: notas.trim() || null }] })
      avisos.exito(`${productoNombre} registrado en ${activa.nombre}`)
      onListo()
    } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo registrar el equipo') } finally { setEnviando(false) }
  }
  return <div className="flex flex-col gap-4 pb-3"><p className="rounded-xl bg-papel-hundido px-3 py-2 text-[0.875rem] text-tinta-suave">Entrada de una unidad en <strong>{activa?.nombre ?? 'sin ubicación'}</strong>.</p><div className="grid grid-cols-2 gap-3"><CampoTexto etiqueta="IMEI 1" value={imei1} onChange={(e) => setImei1(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="15 dígitos" autoFocus /><CampoTexto etiqueta="IMEI 2" value={imei2} onChange={(e) => setImei2(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Opcional" /></div><SelectorEquipo etiqueta="Lista blanca" valor={listaBlanca} opciones={[['registered', 'Registrado'], ['not_registered', 'No registrado']]} onChange={setListaBlanca} /><SelectorEquipo etiqueta="Condición" valor={condicion} opciones={[['new', 'Nuevo'], ['used', 'Segunda mano']]} onChange={setCondicion} /><CampoTexto etiqueta="Nota u observación" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" /><Boton ancho cargando={enviando} onClick={() => void guardar()}>Guardar equipo</Boton></div>
}

function FormularioEdicionProducto({ producto, onCerrar, onDesactivar, onEliminar, onGuardado }: { producto: ProductoConStock; onCerrar: () => void; onDesactivar: () => void; onEliminar: () => void; onGuardado: () => void }) {
  const avisos = useAvisos()
  const [nombre, setNombre] = useState(producto.nombre)
  const [marca, setMarca] = useState(producto.marca ?? '')
  const [modelo, setModelo] = useState(producto.modelo ?? '')
  const [venta, setVenta] = useState(String(producto.precioVenta || ''))
  const [costo, setCosto] = useState(String(producto.precioCosto || ''))
  const [minimo, setMinimo] = useState(String(producto.stockMinimo || ''))
  const [notas, setNotas] = useState(producto.notas ?? '')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const numeroSeguro = (valor: string) => { const numero = Number(valor.replace(',', '.')); return Number.isFinite(numero) && numero >= 0 ? numero : 0 }
  const guardar = async () => { if (!nombre.trim()) { avisos.error('Escribe el nombre del producto'); return } setEnviando(true); try { await api.actualizarProducto(producto.id, { nombre: nombre.trim(), marca: marca.trim() || null, modelo: modelo.trim() || null, precioVenta: numeroSeguro(venta), precioCosto: numeroSeguro(costo), stockMinimo: Math.trunc(numeroSeguro(minimo)), notas: notas.trim() || null }); avisos.exito(`${nombre.trim()} actualizado`); onGuardado() } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo actualizar') } finally { setEnviando(false) } }
  return <div className="flex flex-col gap-3 pb-3"><CampoTexto etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /><div className="grid grid-cols-2 gap-3"><CampoTexto etiqueta="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} /><CampoTexto etiqueta="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><CampoTexto etiqueta="Precio venta" value={venta} onChange={(e) => setVenta(e.target.value)} inputMode="decimal" sufijo="S/" /><CampoTexto etiqueta="Costo" value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" sufijo="S/" /></div><CampoTexto etiqueta="Stock mínimo" value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /><CampoTexto etiqueta="Notas u observaciones" value={notas} onChange={(e) => setNotas(e.target.value)} /><div className="grid grid-cols-2 gap-2"><Boton tono="contorno" onClick={onCerrar}>Cancelar</Boton><Boton cargando={enviando} onClick={() => setConfirmando(true)}>Guardar cambios</Boton></div><div className="mt-2 border-t border-borde pt-3"><button type="button" onClick={onDesactivar} className="min-h-11 w-full rounded-xl text-[0.9375rem] font-semibold text-alerta active:bg-alerta-tenue">Desactivar producto</button><button type="button" onClick={onEliminar} className="min-h-11 w-full rounded-xl text-[0.9375rem] font-semibold text-falta active:bg-falta-tenue">Eliminar producto</button></div><Confirmacion abierta={confirmando} titulo={`¿Guardar cambios de ${nombre.trim() || producto.nombre}?`} detalle={`Confirma la edición de ${nombre.trim() || producto.nombre}.`} confirmar="Guardar cambios" onCancelar={() => setConfirmando(false)} onConfirmar={() => { setConfirmando(false); void guardar() }} /></div>
}

function SelectorEquipo<T extends string>({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: T; opciones: readonly (readonly [T, string])[]; onChange: (valor: T) => void }) {
  return <fieldset><legend className="mb-1.5 text-[0.8125rem] font-semibold text-tinta-suave">{etiqueta}</legend><div className="grid grid-cols-2 gap-2">{opciones.map(([id, texto]) => <button key={id} type="button" aria-pressed={valor === id} onClick={() => onChange(id)} className={`min-h-11 rounded-xl border px-3 text-[0.875rem] font-semibold ${valor === id ? 'border-accion bg-accion-tenue text-accion' : 'border-borde bg-superficie text-tinta-suave'}`}>{texto}</button>)}</div></fieldset>
}

function Dato({
  titulo,
  valor,
  tono = 'normal',
}: {
  titulo: string
  valor: string
  tono?: 'normal' | 'exito' | 'falta'
}) {
  const color = tono === 'exito' ? 'text-exito' : tono === 'falta' ? 'text-falta' : 'text-tinta'

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-borde bg-superficie px-3 py-2.5">
      <span className="text-[0.6875rem] font-semibold tracking-wide text-tinta-tenue uppercase">
        {titulo}
      </span>
      <span className={`cifras text-[1rem] font-semibold ${color}`}>{valor}</span>
    </div>
  )
}
