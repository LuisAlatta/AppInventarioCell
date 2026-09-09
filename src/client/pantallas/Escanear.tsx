/**
 * Pantalla de escaneo.
 *
 * La camara ocupa toda la pantalla y la ficha del producto sube desde abajo.
 * Se evita cambiar de pantalla a proposito: entre dos escaneos no debe haber
 * ningun "volver".
 *
 * Al leer un codigo desconocido, en lugar de un error se ofrece dar de alta el
 * producto con el codigo ya cargado. Es como se construye el catalogo en la
 * practica, escaneando lo que va apareciendo.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { AccionesProducto } from '../componentes/AccionesProducto'
import { Boton } from '../componentes/Boton'
import { CampoTexto } from '../componentes/Campo'
import { FormularioProducto } from '../componentes/FormularioProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { VistaCamara } from '../escaner/VistaCamara'
import { useEscaner } from '../escaner/useEscaner'
import { avisarDesconocido, avisarLectura } from '../lib/retroalimentacion'

type Hoja =
  | { tipo: 'cerrada' }
  | { tipo: 'producto'; producto: ProductoConStock }
  | { tipo: 'nuevo'; codigo: string }
  | { tipo: 'manual' }

export function Escanear() {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { activa } = useUbicacion()

  const [hoja, setHoja] = useState<Hoja>({ tipo: 'cerrada' })
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')

  const resolverCodigo = useCallback(
    async (codigo: string): Promise<void> => {
      setBuscandoCodigo(true)
      try {
        const { producto } = await api.porCodigo(codigo)
        avisarLectura()
        setHoja({ tipo: 'producto', producto })
      } catch (causa) {
        if (causa instanceof ErrorDeApi && causa.estado === 404) {
          avisarDesconocido()
          setHoja({ tipo: 'nuevo', codigo })
          return
        }

        avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo consultar el codigo')
      } finally {
        setBuscandoCodigo(false)
      }
    },
    [avisos],
  )

  const escaner = useEscaner((codigo) => {
    // Mientras hay una hoja abierta no se procesan lecturas nuevas: la camara
    // sigue viendo codigos por el borde de la pantalla y cambiarian el producto
    // debajo del dedo justo al tocar un boton.
    if (hoja.tipo !== 'cerrada') return
    void resolverCodigo(codigo)
  })

  const { iniciar, detener, permitirRepeticion } = escaner

  useEffect(() => {
    iniciar()
    return detener
  }, [iniciar, detener])

  const cerrarHoja = (): void => {
    setHoja({ tipo: 'cerrada' })
    // Se olvida el ultimo codigo para poder volver a escanear el mismo
    // producto de inmediato: registrar tres piezas de a una es un caso normal.
    permitirRepeticion()
  }

  const refrescarTodo = (): void => {
    void cliente.invalidateQueries({ queryKey: ['inicio'] })
    void cliente.invalidateQueries({ queryKey: ['buscar'] })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-tinta">
      <header className="area-segura-arriba flex shrink-0 items-center gap-2 bg-tinta px-3 pb-2 text-white">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => navegar(-1)}
          className="-ml-1 flex size-11 items-center justify-center rounded-xl transition active:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.0625rem] font-semibold">Escanear</p>
          {activa !== null && (
            <p className="truncate text-[0.8125rem] text-white/70">Registrando en {activa.nombre}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setHoja({ tipo: 'manual' })}
          className="flex min-h-11 shrink-0 items-center rounded-xl bg-white/12 px-3.5 text-[0.875rem] font-semibold transition active:bg-white/20"
        >
          Escribir codigo
        </button>
      </header>

      <VistaCamara
        escaner={escaner}
        indicacion={buscandoCodigo ? 'Buscando…' : 'Apunta al codigo de barras'}
        onEscribirCodigo={() => setHoja({ tipo: 'manual' })}
      />

      <HojaInferior
        abierta={hoja.tipo === 'producto'}
        onCerrar={cerrarHoja}
        titulo="Producto escaneado"
      >
        {hoja.tipo === 'producto' && (
          <AccionesProducto
            producto={hoja.producto}
            onCambio={refrescarTodo}
            onListo={cerrarHoja}
          />
        )}
      </HojaInferior>

      <HojaInferior
        abierta={hoja.tipo === 'nuevo'}
        onCerrar={cerrarHoja}
        titulo="Producto nuevo"
      >
        {hoja.tipo === 'nuevo' && (
          <FormularioProducto
            codigo={hoja.codigo}
            onCancelar={cerrarHoja}
            onCreado={(producto) => {
              refrescarTodo()
              avisos.exito(`${producto.nombre} agregado al catalogo`)
              // Se pasa directo a las acciones: quien acaba de dar de alta un
              // producto casi siempre quiere registrar cuantas piezas tiene.
              setHoja({ tipo: 'producto', producto })
            }}
          />
        )}
      </HojaInferior>

      <HojaInferior
        abierta={hoja.tipo === 'manual'}
        onCerrar={() => {
          setCodigoManual('')
          cerrarHoja()
        }}
        titulo="Escribir el codigo"
      >
        <div className="flex flex-col gap-4 pb-3">
          <CampoTexto
            etiqueta="Codigo de barras"
            value={codigoManual}
            onChange={(e) => setCodigoManual(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="7501234567890"
            autoFocus
            ayuda="Los numeros que estan debajo de las barras."
          />

          <Boton
            ancho
            cargando={buscandoCodigo}
            disabled={codigoManual.trim().length < 4}
            onClick={() => {
              const codigo = codigoManual.trim()
              setCodigoManual('')
              void resolverCodigo(codigo)
            }}
          >
            Buscar producto
          </Boton>
        </div>
      </HojaInferior>
    </div>
  )
}
