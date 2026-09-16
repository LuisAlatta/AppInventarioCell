/**
 * Ficha de un producto: existencias, acciones e historial.
 *
 * El historial esta en la misma pantalla y no detras de una pestana porque es
 * donde se responde la pregunta que trae a la dueña aquí: "por que hay menos
 * de lo que debería".
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ImageUp, Pencil, Trash2, X } from 'lucide-react'
import { ErrorDeApi, api, urlDeImagen } from '../api/cliente'
import { AccionesProducto } from '../componentes/AccionesProducto'
import { SugerenciaReposicion } from '../componentes/SugerenciaReposicion'
import { Boton } from '../componentes/Boton'
import { Esqueleto, ErrorEnPantalla, Etiqueta, Vacio } from '../componentes/Estados'
import { DesgloseStock, Miniatura } from '../componentes/FichaProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { CampoTexto } from '../componentes/Campo'
import { CampoMarcaPredictivo } from '../componentes/CampoMarcaPredictivo'
import { Confirmacion } from '../componentes/Confirmacion'
import { Marco } from '../componentes/Marco'
import { ModalRecorteImagen } from '../componentes/ModalRecorteImagen'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { NOMBRE_MOVIMIENTO, cuandoFue, dinero, fechaLarga, numero } from '../lib/formato'
import { prepararFoto } from '../lib/imagen'
import { leerCodigoDeFoto } from '../escaner/lecturaCodigo'
import { verificarImeiEnBd } from '../lib/validacionImei'
import type { Equipo, ProductoConStock } from '@compartido/tipos'

export function Producto() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const [parametros] = useSearchParams()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { activa, ubicaciones } = useUbicacion()
  const ubicacionDeVenta = ubicaciones.find((ubicacion) => ubicacion.id === parametros.get('ubicacion')) ?? activa
  const abrirVenta = parametros.get('accion') === 'venta'

  const [acciones, setAcciones] = useState(abrirVenta)
  const [modoAcciones, setModoAcciones] = useState<'rápido' | 'venta'>(abrirVenta ? 'venta' : 'rápido')
  const [altaEquipo, setAltaEquipo] = useState(false)
  const [equipoParaEditar, setEquipoParaEditar] = useState<Equipo | null>(null)
  const [equipoParaEliminar, setEquipoParaEliminar] = useState<Equipo | null>(null)
  const [administrar, setAdministrar] = useState(false)
  const [accionProducto, setAccionProducto] = useState<'desactivar' | 'eliminar' | null>(null)
  const [imagenPorQuitar, setImagenPorQuitar] = useState<{ id: string; clave: string } | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [fotoParaRecortar, setFotoParaRecortar] = useState<File | null>(null)
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

  const galeria = useQuery({ queryKey: ['imagenes', id], queryFn: () => api.imagenesDeProducto(id), enabled: id !== '' })

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
          <div className="-mt-1 flex shrink-0 flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label={`Administrar ${ficha.nombre}`}
              title="Administrar producto"
              onClick={() => setAdministrar(true)}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie text-accion active:bg-accion-tenue"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              type="button"
              aria-label={`Eliminar ${ficha.nombre}`}
              title="Eliminar producto"
              onClick={() => setAccionProducto('eliminar')}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-falta/30 bg-falta-tenue text-falta transition active:scale-95 active:bg-falta/20"
            >
              <Trash2 className="size-5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </section>

        {bajoMinimo && (
          <p className="rounded-xl border border-alerta/30 bg-alerta-tenue px-4 py-3 text-[0.9375rem] text-tinta">
            Por debajo del mínimo de {numero(ficha.stockMinimo)} piezas.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Boton tono="contorno" onClick={() => { setModoAcciones('rápido'); setAcciones(true) }}>
            Registrar movimiento
          </Boton>
          <Boton tono="peligro" onClick={() => { setModoAcciones('venta'); setAcciones(true) }}>
            Registrar venta
          </Boton>
        </div>

        <SugerenciaReposicion producto={ficha} />

        <section className="flex flex-col gap-2">
          <Etiqueta>Existencias</Etiqueta>
          <DesgloseStock producto={ficha} ubicacionActivaId={ubicacionDeVenta?.id} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><Etiqueta>Fotos del producto</Etiqueta><span className="text-[0.75rem] text-tinta-tenue">{galeria.data?.imagenes.length ?? 0}/5</span></div>
          <div className="grid grid-cols-3 gap-2">
            {(galeria.data?.imagenes ?? []).map((imagen) => <div key={imagen.id} className="relative aspect-square overflow-hidden rounded-2xl border border-borde bg-papel-hundido"><img src={urlDeImagen(imagen.clave) ?? ''} alt={`Foto ${imagen.posicion + 1} de ${ficha.nombre}`} className="size-full object-cover" /><button type="button" aria-label={`Quitar foto ${imagen.posicion + 1}`} onClick={() => setImagenPorQuitar(imagen)} className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-tinta/70 text-white"><X aria-hidden="true" className="size-4" strokeWidth={2.5} /></button></div>)}
            {(galeria.data?.imagenes.length ?? 0) < 5 && (
              <>
                <button
                  type="button"
                  disabled={subiendoImagen}
                  onClick={() => refCamara.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-accion/40 bg-accion-tenue p-2 text-center text-[0.75rem] font-semibold text-accion transition active:scale-95 disabled:opacity-50"
                >
                  <Camera className="size-5" strokeWidth={2.2} />
                  <span>Tomar foto</span>
                </button>
                <button
                  type="button"
                  disabled={subiendoImagen}
                  onClick={() => refFotos.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-borde bg-papel-hundido p-2 text-center text-[0.75rem] font-semibold text-tinta-suave transition active:scale-95 disabled:opacity-50"
                >
                  <ImageUp className="size-5" strokeWidth={2.2} />
                  <span>Subir foto</span>
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
                  avisos.exito(lista.length === 1 ? 'Foto agregada' : `${lista.length} fotos agregadas`)
                } catch (causa) {
                  avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo agregar la foto')
                } finally {
                  setSubiendoImagen(false)
                }
              })()
            }}
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Etiqueta>Equipos individuales</Etiqueta>
            <button type="button" onClick={() => setAltaEquipo(true)} className="min-h-11 rounded-xl bg-accion-tenue px-3 text-[0.875rem] font-semibold text-accion">
              + Registrar equipo
            </button>
          </div>
          {equipos.isPending && <Esqueleto filas={2} />}
          {equipos.isSuccess && equipos.data.equipos.length > 0 && (
            <ul className="flex flex-col gap-2">
              {equipos.data.equipos.map((equipo) => (
                <li
                  key={equipo.id}
                  className={`rounded-2xl border p-3 ${
                    equipo.activo ? 'border-borde bg-superficie' : 'border-borde bg-papel-hundido opacity-70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Miniatura nombre={ficha.nombre} claveImagen={ficha.claveImagen} tamano="pequena" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.875rem] font-semibold">{equipo.imei1 ?? equipo.imei2 ?? 'Sin IMEI registrado'}</p>
                      {equipo.imei2 !== null && (
                        <p className="cifras mt-0.5 text-[0.75rem] text-tinta-tenue">IMEI 2 · {equipo.imei2}</p>
                      )}
                      <p className="mt-1 text-[0.75rem] text-tinta-tenue" title={fechaLarga(equipo.creadoEn)}>
                        Agregado {fechaLarga(equipo.creadoEn)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {!equipo.activo && (
                        <span className="rounded-full bg-papel-hundido px-2 py-1 text-[0.6875rem] font-semibold text-tinta-suave">
                          Vendido o retirado
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-1 text-[0.6875rem] font-semibold ${
                          equipo.listaBlanca === 'registered' ? 'bg-exito-tenue text-exito' : 'bg-falta-tenue text-falta'
                        }`}
                      >
                        {equipo.listaBlanca === 'registered' ? 'Registrado' : 'No registrado'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[0.6875rem] font-semibold ${
                          equipo.condicion === 'new' ? 'bg-accion-tenue text-accion' : 'bg-alerta-tenue text-alerta'
                        }`}
                      >
                        {equipo.condicion === 'new' ? 'Nuevo' : 'Segunda mano'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-borde/60 pt-2">
                    <button
                      type="button"
                      onClick={() => setEquipoParaEditar(equipo)}
                      className="flex min-h-9 items-center gap-1.5 rounded-xl border border-accion/30 bg-accion-tenue px-3 text-[0.8125rem] font-semibold text-accion transition active:scale-95"
                      title="Editar IMEI y datos de esta unidad"
                    >
                      <Pencil className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquipoParaEliminar(equipo)}
                      className="flex min-h-9 items-center gap-1.5 rounded-xl border border-falta/30 bg-falta-tenue px-3 text-[0.8125rem] font-semibold text-falta transition active:scale-95"
                      title="Eliminar esta unidad del inventario"
                    >
                      <Trash2 className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
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

      <HojaInferior abierta={acciones} onCerrar={() => setAcciones(false)} titulo={modoAcciones === 'venta' ? `Vender · ${ficha.nombre}` : 'Registrar'}>
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

      <HojaInferior abierta={altaEquipo} onCerrar={() => setAltaEquipo(false)} titulo={`Registrar equipo · ${ficha.nombre}`}>
        <FormularioAltaEquipo productoId={ficha.id} productoNombre={ficha.nombre} onListo={() => { setAltaEquipo(false); void cliente.invalidateQueries({ queryKey: ['equipos', id] }); void cliente.invalidateQueries({ queryKey: ['producto', id] }); void cliente.invalidateQueries({ queryKey: ['movimientos', id] }); void cliente.invalidateQueries({ queryKey: ['movimientos'] }); void cliente.invalidateQueries({ queryKey: ['inicio'] }) }} />
      </HojaInferior>

      <HojaInferior abierta={equipoParaEditar !== null} onCerrar={() => setEquipoParaEditar(null)} titulo={`Editar equipo · ${ficha.nombre}`}>
        {equipoParaEditar !== null && (
          <FormularioEdicionEquipo
            equipo={equipoParaEditar}
            onListo={() => {
              setEquipoParaEditar(null)
              void cliente.invalidateQueries({ queryKey: ['equipos', id] })
              void cliente.invalidateQueries({ queryKey: ['producto', id] })
              void cliente.invalidateQueries({ queryKey: ['buscar'] })
            }}
          />
        )}
      </HojaInferior>

      <HojaInferior abierta={administrar} onCerrar={() => setAdministrar(false)} titulo={`Administrar · ${ficha.nombre}`}>
        <FormularioEdicionProducto producto={ficha} onCerrar={() => setAdministrar(false)} onDesactivar={() => setAccionProducto('desactivar')} onEliminar={() => setAccionProducto('eliminar')} onGuardado={() => { setAdministrar(false); void cliente.invalidateQueries({ queryKey: ['producto', id] }); void cliente.invalidateQueries({ queryKey: ['buscar'] }); void cliente.invalidateQueries({ queryKey: ['inicio'] }) }} />
      </HojaInferior>

      <Confirmacion abierta={imagenPorQuitar !== null} titulo={`¿Quitar foto de ${ficha.nombre}?`} detalle={`La imagen se eliminará de ${ficha.nombre}. Esta acción no se puede deshacer.`} confirmar="Quitar foto" peligro onCancelar={() => setImagenPorQuitar(null)} onConfirmar={() => { if (imagenPorQuitar === null) return; void (async () => { try { await api.quitarImagenProducto(ficha.id, imagenPorQuitar.id); void cliente.invalidateQueries({ queryKey: ['imagenes', id] }); void cliente.invalidateQueries({ queryKey: ['producto', id] }); avisos.exito('Foto eliminada') } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo quitar la foto') } finally { setImagenPorQuitar(null) } })() }} />

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
              avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo eliminar el equipo')
            } finally {
              setEquipoParaEliminar(null)
            }
          })()
        }}
      />

      <Confirmacion
        abierta={accionProducto !== null}
        titulo={accionProducto === 'eliminar' ? `¿Eliminar ${ficha.nombre}?` : `¿Desactivar ${ficha.nombre}?`}
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
              avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo guardar el cambio')
            } finally {
              setAccionProducto(null)
            }
          })()
        }}
      />

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

function FormularioAltaEquipo({ productoId, productoNombre, onListo }: { productoId: string; productoNombre: string; onListo: () => void }) {
  const avisos = useAvisos()
  const { activa } = useUbicacion()
  const [imei1, setImei1] = useState('')
  const [imei2, setImei2] = useState('')
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
    if (activa === null) { avisos.error('Elige una ubicación antes de registrar el equipo'); return }
    if (errorImei1 || errorImei2) {
      avisos.error(errorImei1 ?? errorImei2 ?? 'Revisa los IMEI ingresados')
      return
    }
    if (imei1.trim().length > 25) {
      setErrorImei1('El IMEI no puede tener más de 25 caracteres')
      avisos.error('El IMEI no puede tener más de 25 caracteres')
      return
    }
    if (imei2.trim().length > 25) {
      setErrorImei2('El IMEI no puede tener más de 25 caracteres')
      avisos.error('El IMEI no puede tener más de 25 caracteres')
      return
    }
    if (imei1.trim() !== '' && imei2.trim() !== '' && imei1.trim() === imei2.trim()) {
      setErrorImei2('IMEI 1 e IMEI 2 deben ser distintos')
      avisos.error('IMEI 1 e IMEI 2 deben ser distintos')
      return
    }
    setEnviando(true)
    try {
      await api.registrarEquipos({ productoId, ubicacionId: activa.id, equipos: [{ imei1: imei1.trim() || null, imei2: imei2.trim() || null, listaBlanca, condicion, notas: notas.trim() || null }] })
      avisos.exito(`${productoNombre} registrado en ${activa.nombre}`)
      onListo()
    } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo registrar el equipo') } finally { setEnviando(false) }
  }
  return (
    <div className="flex flex-col gap-4 pb-3">
      <p className="rounded-xl bg-papel-hundido px-3 py-2 text-[0.875rem] text-tinta-suave">
        Entrada de una unidad en <strong>{activa?.nombre ?? 'sin ubicación'}</strong>.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-medium text-tinta-suave">IMEI 1</label>
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei1' && <p className="text-[0.75rem] font-medium text-accion">Leyendo foto de IMEI 1…</p>}
          {errorImei1 !== undefined && <p className="text-[0.75rem] font-medium text-falta">{errorImei1}</p>}
          {!errorImei1 && imei1.trim().length > 0 && (
            <p className="text-[0.75rem] text-tinta-tenue">{imei1.trim().length}/25 caracteres</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-medium text-tinta-suave">IMEI 2</label>
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei2' && <p className="text-[0.75rem] font-medium text-accion">Leyendo foto de IMEI 2…</p>}
          {errorImei2 !== undefined && <p className="text-[0.75rem] font-medium text-falta">{errorImei2}</p>}
          {!errorImei2 && imei2.length >= 14 && imei2.length <= 17 && (
            <p className="text-[0.75rem] text-tinta-tenue">IMEI válido ({imei2.length} dígitos)</p>
          )}
        </div>
      </div>
      <SelectorEquipo
        etiqueta="Lista blanca"
        valor={listaBlanca}
        opciones={[['registered', 'Registrado'], ['not_registered', 'No registrado']]}
        onChange={setListaBlanca}
      />
      <SelectorEquipo
        etiqueta="Condición"
        valor={condicion}
        opciones={[['new', 'Nuevo'], ['used', 'Segunda mano']]}
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

function FormularioEdicionEquipo({
  equipo,
  onListo,
}: {
  equipo: Equipo
  onListo: () => void
}) {
  const avisos = useAvisos()
  const [imei1, setImei1] = useState(equipo.imei1 ?? '')
  const [imei2, setImei2] = useState(equipo.imei2 ?? '')
  const [errorImei1, setErrorImei1] = useState<string | undefined>()
  const [errorImei2, setErrorImei2] = useState<string | undefined>()
  const [listaBlanca, setListaBlanca] = useState<'registered' | 'not_registered'>(equipo.listaBlanca)
  const [condicion, setCondicion] = useState<'new' | 'used'>(equipo.condicion)
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
    if (!imei1.trim() && !imei2.trim()) {
      setErrorImei1('Ingresa al menos un IMEI')
      avisos.error('Ingresa al menos un IMEI para este equipo')
      return
    }
    if (errorImei1 || errorImei2) {
      avisos.error(errorImei1 ?? errorImei2 ?? 'Revisa los IMEI ingresados')
      return
    }
    if (imei1.trim().length > 25) {
      setErrorImei1('El IMEI no puede tener más de 25 caracteres')
      avisos.error('El IMEI no puede tener más de 25 caracteres')
      return
    }
    if (imei2.trim().length > 25) {
      setErrorImei2('El IMEI no puede tener más de 25 caracteres')
      avisos.error('El IMEI no puede tener más de 25 caracteres')
      return
    }
    if (imei1.trim() !== '' && imei2.trim() !== '' && imei1.trim() === imei2.trim()) {
      setErrorImei2('IMEI 1 e IMEI 2 deben ser distintos')
      avisos.error('IMEI 1 e IMEI 2 deben ser distintos')
      return
    }
    setEnviando(true)
    try {
      await api.actualizarEquipo(equipo.id, {
        imei1: imei1.trim() || null,
        imei2: imei2.trim() || null,
        listaBlanca,
        condicion,
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-medium text-tinta-suave">IMEI 1</label>
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei1' && <p className="text-[0.75rem] font-medium text-accion">Leyendo foto de IMEI 1…</p>}
          {errorImei1 !== undefined && <p className="text-[0.75rem] font-medium text-falta">{errorImei1}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[0.8125rem] font-medium text-tinta-suave">IMEI 2</label>
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion active:scale-95 disabled:opacity-50"
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
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave active:scale-95 disabled:opacity-50"
            >
              <ImageUp className="size-5" strokeWidth={2} />
            </button>
          </div>
          {leyendoFotoImei === 'imei2' && <p className="text-[0.75rem] font-medium text-accion">Leyendo foto de IMEI 2…</p>}
          {errorImei2 !== undefined && <p className="text-[0.75rem] font-medium text-falta">{errorImei2}</p>}
        </div>
      </div>
      <SelectorEquipo
        etiqueta="Lista blanca"
        valor={listaBlanca}
        opciones={[['registered', 'Registrado'], ['not_registered', 'No registrado']]}
        onChange={setListaBlanca}
      />
      <SelectorEquipo
        etiqueta="Condición"
        valor={condicion}
        opciones={[['new', 'Nuevo'], ['used', 'Segunda mano']]}
        onChange={setCondicion}
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

function FormularioEdicionProducto({ producto, onCerrar, onDesactivar, onEliminar, onGuardado }: { producto: ProductoConStock; onCerrar: () => void; onDesactivar: () => void; onEliminar: () => void; onGuardado: () => void }) {
  const avisos = useAvisos()
  const cliente = useQueryClient()
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
  const guardar = async () => { if (!nombre.trim()) { avisos.error('Escribe el nombre del producto'); return } setEnviando(true); try { await api.actualizarProducto(producto.id, { nombre: nombre.trim(), marca: marca.trim() || null, modelo: modelo.trim() || null, precioVenta: numeroSeguro(venta), precioCosto: numeroSeguro(costo), stockMinimo: Math.trunc(numeroSeguro(minimo)), notas: notas.trim() || null }); avisos.exito(`${nombre.trim()} actualizado`); void cliente.invalidateQueries({ queryKey: ['marcas'] }); onGuardado() } catch (causa) { avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo actualizar') } finally { setEnviando(false) } }
  return <div className="flex flex-col gap-3 pb-3"><CampoTexto etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /><div className="grid grid-cols-2 gap-3"><CampoMarcaPredictivo value={marca} onChange={setMarca} /><CampoTexto etiqueta="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><CampoTexto etiqueta="Precio venta" value={venta} onChange={(e) => setVenta(e.target.value)} inputMode="decimal" sufijo="S/" /><CampoTexto etiqueta="Costo" value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" sufijo="S/" /></div><CampoTexto etiqueta="Stock mínimo" value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ''))} inputMode="numeric" /><CampoTexto etiqueta="Notas u observaciones" value={notas} onChange={(e) => setNotas(e.target.value)} /><div className="grid grid-cols-2 gap-2"><Boton tono="contorno" onClick={onCerrar}>Cancelar</Boton><Boton cargando={enviando} onClick={() => setConfirmando(true)}>Guardar cambios</Boton></div><div className="mt-2 border-t border-borde pt-3"><button type="button" onClick={onDesactivar} className="min-h-11 w-full rounded-xl text-[0.9375rem] font-semibold text-alerta active:bg-alerta-tenue">Desactivar producto</button><button type="button" onClick={onEliminar} className="min-h-11 w-full rounded-xl text-[0.9375rem] font-semibold text-falta active:bg-falta-tenue">Eliminar producto</button></div><Confirmacion abierta={confirmando} titulo={`¿Guardar cambios de ${nombre.trim() || producto.nombre}?`} detalle={`Confirma la edición de ${nombre.trim() || producto.nombre}.`} confirmar="Guardar cambios" onCancelar={() => setConfirmando(false)} onConfirmar={() => { setConfirmando(false); void guardar() }} /></div>
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
