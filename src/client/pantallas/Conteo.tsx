/**
 * Conteo fisico y su reporte de faltantes.
 *
 * Es el modulo que responde la pregunta del negocio: cuanta mercancia falta y
 * en que sucursal. El resto de la app existe para que este numero sea creible.
 *
 * Cada escaneo se envia de inmediato al servidor, al contrario del traspaso que
 * arma la lista y confirma al final. Un conteo puede llevar cien productos y
 * media hora: si se guardara todo al cerrar, una recarga del navegador o una
 * llamada entrante tirarian el trabajo entero.
 *
 * Al escanear se pide la cantidad en lugar de sumar uno. Contar es contar
 * montones, no piezas de a una, y el numero suele venir ya contado a mano.
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProductoConStock, ReporteMerma, SesionConteo } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { SelectorCantidad } from '../componentes/Campo'
import { CapturaProducto } from '../componentes/CapturaProducto'
import { Esqueleto, ErrorEnPantalla, Etiqueta, Vacio } from '../componentes/Estados'
import { HojaInferior } from '../componentes/HojaInferior'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { dinero, numero, porcentaje } from '../lib/formato'
import { avisarError, avisarLectura } from '../lib/retroalimentacion'

export function Conteo() {
  const { activa } = useUbicacion()
  const cliente = useQueryClient()
  const avisos = useAvisos()

  const [reporte, setReporte] = useState<ReporteMerma | null>(null)

  const abierto = useQuery({
    queryKey: ['conteo-abierto', activa?.id],
    queryFn: () => api.conteoAbierto(activa?.id ?? ''),
    enabled: activa !== null,
  })

  const abrir = async (): Promise<void> => {
    if (activa === null) return

    try {
      const { conteo, retomado } = await api.abrirConteo(activa.id)
      if (retomado) avisos.informacion('Continuando el conteo que quedo abierto')
      cliente.setQueryData(['conteo-abierto', activa.id], { conteo })
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo abrir el conteo')
    }
  }

  if (reporte !== null) {
    return (
      <Marco titulo="Resultado del conteo" atras sinUbicacion>
        <VistaReporte reporte={reporte} onCerrar={() => setReporte(null)} />
      </Marco>
    )
  }

  if (activa === null) {
    return (
      <Marco titulo="Conteo" atras>
        <Vacio titulo="Primero crea una ubicacion" />
      </Marco>
    )
  }

  if (abierto.isPending) {
    return (
      <Marco titulo="Conteo" atras>
        <Esqueleto filas={3} />
      </Marco>
    )
  }

  if (abierto.isError) {
    return (
      <Marco titulo="Conteo" atras>
        <ErrorEnPantalla
          mensaje="No se pudo consultar el conteo."
          onReintentar={() => void abierto.refetch()}
        />
      </Marco>
    )
  }

  const sesion = abierto.data.conteo

  if (sesion === null) {
    return (
      <Marco titulo="Conteo" atras>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4">
            <h2 className="text-titulo">Contar {activa.nombre}</h2>
            <p className="text-[0.9375rem] leading-relaxed text-tinta-suave">
              Escanea todo lo que haya fisicamente en esta ubicacion. Al terminar, la app compara
              con lo que deberia haber y muestra que falta y cuanto vale.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-tarjeta bg-papel-hundido p-4">
            <Etiqueta>Antes de empezar</Etiqueta>
            <ul className="flex flex-col gap-1.5 text-[0.9375rem] text-tinta-suave">
              <li>Registra las ventas del dia que falten, o apareceran como faltantes.</li>
              <li>Cuenta una seccion completa antes de pasar a la siguiente.</li>
              <li>Puedes cerrar la app y continuar despues: lo escaneado se guarda.</li>
            </ul>
          </div>

          <Boton ancho onClick={() => void abrir()}>
            Empezar el conteo
          </Boton>
        </div>
      </Marco>
    )
  }

  return <ConteoEnMarcha sesion={sesion} onCerrado={setReporte} />
}

function ConteoEnMarcha({
  sesion,
  onCerrado,
}: {
  sesion: SesionConteo
  onCerrado: (reporte: ReporteMerma) => void
}) {
  const cliente = useQueryClient()
  const avisos = useAvisos()

  const [capturando, setCapturando] = useState(false)
  const [pidiendo, setPidiendo] = useState<ProductoConStock | null>(null)
  const [cantidad, setCantidad] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [confirmarCierre, setConfirmarCierre] = useState(false)

  const avance = useQuery({
    queryKey: ['conteo', sesion.id],
    queryFn: () => api.reporteConteo(sesion.id),
    // Se refresca al volver de la hoja para que el avance no quede viejo.
    staleTime: 0,
  })

  const contados = avance.data?.reporte.renglones.length ?? sesion.contados
  const esperados = Math.max(sesion.esperados, contados)
  const fraccion = esperados === 0 ? 0 : Math.min(1, contados / esperados)

  const registrar = async (): Promise<void> => {
    if (pidiendo === null) return

    setGuardando(true)
    try {
      const { renglon } = await api.registrarConteo(sesion.id, pidiendo.id, cantidad)
      avisarLectura()

      const diferencia = renglon.diferencia
      if (diferencia === 0) {
        avisos.exito(`${renglon.productoNombre}: cuadra`)
      } else if (diferencia < 0) {
        avisos.error(
          `${renglon.productoNombre}: faltan ${numero(-diferencia)} de ${numero(renglon.cantidadEsperada)}`,
        )
      } else {
        avisos.informacion(`${renglon.productoNombre}: sobran ${numero(diferencia)}`)
      }

      void cliente.invalidateQueries({ queryKey: ['conteo', sesion.id] })
      setPidiendo(null)
    } catch (causa) {
      avisarError()
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo registrar')
    } finally {
      setGuardando(false)
    }
  }

  const cerrar = async (ajustarStock: boolean): Promise<void> => {
    setCerrando(true)
    try {
      const { reporte } = await api.cerrarConteo(sesion.id, ajustarStock)
      void cliente.invalidateQueries()
      onCerrado(reporte)
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo cerrar el conteo')
    } finally {
      setCerrando(false)
      setConfirmarCierre(false)
    }
  }

  const cancelar = async (): Promise<void> => {
    try {
      await api.cancelarConteo(sesion.id)
      avisos.informacion('Conteo cancelado')
      void cliente.invalidateQueries({ queryKey: ['conteo-abierto'] })
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo cancelar')
    }
  }

  const renglones = avance.data?.reporte.renglones ?? []
  const conDiferencia = renglones.filter((r) => r.diferencia !== 0)

  return (
    <Marco titulo={`Contando ${sesion.ubicacionNombre}`} atras sinUbicacion>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="cifras text-cifra">{numero(contados)}</span>
              <span className="text-[0.8125rem] text-tinta-tenue">
                de {numero(esperados)} productos
              </span>
            </div>

            {conDiferencia.length > 0 && (
              <div className="flex flex-col items-end">
                <span className="cifras text-[1.375rem] font-semibold text-falta">
                  {numero(conDiferencia.length)}
                </span>
                <span className="text-[0.75rem] text-tinta-tenue">con diferencia</span>
              </div>
            )}
          </div>

          <div
            className="h-2 overflow-hidden rounded-full bg-papel-hundido"
            role="progressbar"
            aria-valuenow={Math.round(fraccion * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance del conteo"
          >
            <div
              className="h-full rounded-full bg-accion transition-[width] duration-300"
              style={{ width: `${fraccion * 100}%` }}
            />
          </div>
        </section>

        <Boton ancho onClick={() => setCapturando(true)}>
          Escanear producto
        </Boton>

        {renglones.length === 0 ? (
          <Vacio
            titulo="Nada contado todavia"
            detalle="Escanea el primer producto que tengas en la mano."
          />
        ) : (
          <section className="flex flex-col gap-2">
            <Etiqueta>Lo contado</Etiqueta>

            <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
              {renglones.map((renglon) => (
                <li key={renglon.productoId} className="flex items-center gap-3 px-3.5 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-[0.9375rem] font-medium">{renglon.productoNombre}</p>
                    <p className="cifras text-[0.8125rem] text-tinta-tenue">
                      Contado {numero(renglon.cantidadContada)} · esperado{' '}
                      {numero(renglon.cantidadEsperada)}
                    </p>
                  </div>

                  <span
                    className={[
                      'cifras shrink-0 text-[1.0625rem] font-semibold',
                      renglon.diferencia === 0
                        ? 'text-tinta-tenue'
                        : renglon.diferencia < 0
                          ? 'text-falta'
                          : 'text-alerta',
                    ].join(' ')}
                  >
                    {renglon.diferencia === 0
                      ? 'cuadra'
                      : `${renglon.diferencia > 0 ? '+' : '−'}${numero(Math.abs(renglon.diferencia))}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Boton
            tono="exito"
            ancho
            disabled={renglones.length === 0}
            onClick={() => setConfirmarCierre(true)}
          >
            Terminar y ver el resultado
          </Boton>

          <button
            type="button"
            onClick={() => void cancelar()}
            className="min-h-toque rounded-xl text-[0.9375rem] font-medium text-tinta-tenue transition active:bg-papel-hundido"
          >
            Cancelar este conteo
          </button>
        </div>
      </div>

      <HojaInferior
        abierta={capturando}
        onCerrar={() => setCapturando(false)}
        titulo="Escanear para contar"
      >
        <div className="-mx-5 flex h-[65vh] flex-col">
          <CapturaProducto
            pausado={pidiendo !== null}
            indicacion={`${numero(contados)} de ${numero(esperados)} contados`}
            onElegido={(producto) => {
              // Arranca en cero a proposito: el numero lo pone quien conto, y
              // un valor precargado se acepta por inercia y falsea el conteo.
              setCantidad(0)
              setPidiendo(producto)
            }}
          />
        </div>
      </HojaInferior>

      <HojaInferior
        abierta={pidiendo !== null}
        onCerrar={() => setPidiendo(null)}
        titulo={pidiendo?.nombre}
      >
        {pidiendo !== null && (
          <div className="flex flex-col gap-4 pb-3">
            <p className="text-[0.9375rem] text-tinta-suave">
              Cuantas piezas hay fisicamente en {sesion.ubicacionNombre}.
            </p>

            <SelectorCantidad valor={cantidad} onCambio={setCantidad} minimo={0} />

            <p className="text-[0.8125rem] text-tinta-tenue">
              Si no queda ninguna, deja el cero: es un dato tan valido como cualquier otro.
            </p>

            <div className="grid grid-cols-[1fr_2fr] gap-2.5">
              <Boton tono="contorno" onClick={() => setPidiendo(null)} disabled={guardando}>
                Cancelar
              </Boton>
              <Boton cargando={guardando} onClick={() => void registrar()}>
                Registrar
              </Boton>
            </div>
          </div>
        )}
      </HojaInferior>

      <HojaInferior
        abierta={confirmarCierre}
        onCerrar={() => setConfirmarCierre(false)}
        titulo="Terminar el conteo"
      >
        <div className="flex flex-col gap-4 pb-3">
          <p className="text-[0.9375rem] leading-relaxed text-tinta-suave">
            Se guardara el resultado con {numero(renglones.length)} productos contados y{' '}
            {numero(conDiferencia.length)} con diferencia.
          </p>

          <div className="flex flex-col gap-2">
            <Boton tono="exito" ancho cargando={cerrando} onClick={() => void cerrar(true)}>
              Ajustar el inventario a lo contado
            </Boton>
            <p className="px-1 text-[0.8125rem] text-tinta-tenue">
              Recomendado. Deja el sistema igual a la realidad y guarda el faltante como
              evidencia.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-borde pt-3">
            <Boton tono="contorno" ancho disabled={cerrando} onClick={() => void cerrar(false)}>
              Solo guardar el reporte
            </Boton>
            <p className="px-1 text-[0.8125rem] text-tinta-tenue">
              El inventario no se toca. Util si quieres revisar antes de aceptar el faltante.
            </p>
          </div>
        </div>
      </HojaInferior>
    </Marco>
  )
}

/**
 * Reporte del conteo cerrado.
 *
 * El dinero faltante va primero y en grande. Las piezas importan, pero lo que
 * mueve una decision es cuanto dinero se fue.
 */
function VistaReporte({ reporte, onCerrar }: { reporte: ReporteMerma; onCerrar: () => void }) {
  const faltantes = reporte.renglones.filter((r) => r.diferencia < 0)
  const sobrantes = reporte.renglones.filter((r) => r.diferencia > 0)
  const cuadra = reporte.piezasFaltantes === 0 && reporte.piezasSobrantes === 0

  return (
    <div className="flex flex-col gap-5">
      <section
        className={[
          'flex flex-col gap-1 rounded-tarjeta border p-5',
          cuadra ? 'border-exito/30 bg-exito-tenue' : 'border-falta/30 bg-falta-tenue',
        ].join(' ')}
      >
        <p className="text-etiqueta text-tinta-suave uppercase">
          {cuadra ? 'Todo cuadra' : 'Faltante detectado'}
        </p>

        {cuadra ? (
          <p className="text-titulo">{reporte.ubicacionNombre} esta en orden</p>
        ) : (
          <>
            <p className="cifras text-cifra text-falta">{dinero(reporte.dineroFaltante)}</p>
            <p className="text-[0.9375rem] text-tinta-suave">
              {numero(reporte.piezasFaltantes)} piezas faltan en {reporte.ubicacionNombre}
              {reporte.valorEsperado > 0 && ` · ${porcentaje(reporte.porcentajeMerma)} del valor`}
            </p>
          </>
        )}
      </section>

      {faltantes.length > 0 && (
        <section className="flex flex-col gap-2">
          <Etiqueta>Que falta</Etiqueta>
          <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            {faltantes.map((renglon) => (
              <li key={renglon.productoId} className="flex items-center gap-3 px-3.5 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-[0.9375rem] font-medium">{renglon.productoNombre}</p>
                  <p className="cifras text-[0.8125rem] text-tinta-tenue">
                    Habia {numero(renglon.cantidadEsperada)}, se contaron{' '}
                    {numero(renglon.cantidadContada)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end">
                  <span className="cifras text-[1.0625rem] font-semibold text-falta">
                    −{numero(-renglon.diferencia)}
                  </span>
                  <span className="cifras text-[0.75rem] text-tinta-tenue">
                    {dinero(-renglon.diferencia * renglon.costoUnitario)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sobrantes.length > 0 && (
        <section className="flex flex-col gap-2">
          <Etiqueta>Que sobra</Etiqueta>
          <p className="px-1 text-[0.8125rem] text-tinta-tenue">
            Casi siempre significa que una entrada o una venta no se registro en su momento.
          </p>
          <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            {sobrantes.map((renglon) => (
              <li key={renglon.productoId} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <p className="min-w-0 truncate text-[0.9375rem] font-medium">
                  {renglon.productoNombre}
                </p>
                <span className="cifras shrink-0 text-[1.0625rem] font-semibold text-alerta">
                  +{numero(renglon.diferencia)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Boton ancho onClick={onCerrar}>
        Listo
      </Boton>
    </div>
  )
}
