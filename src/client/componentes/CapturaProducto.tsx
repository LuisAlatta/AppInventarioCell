/**
 * Seleccion de producto por camara, búsqueda o codigo escrito.
 *
 * Lo usan el traspaso y el conteo, que necesitan lo mismo: ir agregando
 * productos uno tras otro sin salir de la pantalla. La camara viene primero
 * porque es el camino rápido; la búsqueda queda a un toque para el producto sin
 * codigo legible, que siempre aparece.
 *
 * El componente no decide que hacer con el producto: lo entrega y ya. Asi el
 * traspaso suma un renglon y el conteo registra una cantidad, cada uno con sus
 * reglas, sin que este archivo sepa de ninguna de las dos.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoTexto } from './Campo'
import { Esqueleto, Vacio } from './Estados'
import { RenglonProducto } from './FichaProducto'
import { useAvisos } from '../contexto/Avisos'
import { VistaCamara } from '../escaner/VistaCamara'
import { useEscaner } from '../escaner/useEscaner'
import { avisarDesconocido, avisarLectura } from '../lib/retroalimentacion'

type Pestana = 'camara' | 'buscar'

interface CapturaProductoProps {
  /** Se llama con cada producto elegido. Puede llamarse muchas veces seguidas. */
  onElegido: (producto: ProductoConStock) => void
  /** Texto de apoyo sobre la camara, por ejemplo el avance del conteo. */
  indicacion?: string
  /**
   * Cuando es verdadero, la camara se pausa.
   *
   * Lo usa quien abre una hoja encima para pedir la cantidad: sin pausar, la
   * camara seguiria leyendo codigos por el borde y cambiaria el producto
   * mientras se escribe.
   */
  pausado?: boolean
  /** Ubicación de la que saldrán los productos, si la pantalla opera por local. */
  ubicacionId?: string
}

export function CapturaProducto({ onElegido, indicacion, pausado = false, ubicacionId }: CapturaProductoProps) {
  const avisos = useAvisos()

  const [pestana, setPestana] = useState<Pestana>('camara')
  const [texto, setTexto] = useState('')
  const [consulta, setConsulta] = useState('')
  const [codigoManual, setCodigoManual] = useState('')
  const [consultando, setConsultando] = useState(false)

  const refPausado = useRef(pausado)
  refPausado.current = pausado

  const resolverCodigo = useCallback(
    async (codigo: string): Promise<void> => {
      setConsultando(true)
      try {
        const { producto } = await api.porCodigo(codigo)
        avisarLectura()
        onElegido(producto)
      } catch (causa) {
        if (causa instanceof ErrorDeApi && causa.estado === 404) {
          avisarDesconocido()
          // Aqui no se ofrece dar de alta: en medio de un traspaso o un conteo,
          // abrir un formulario de alta rompe el ritmo. Se avisa y se sigue.
          avisos.error('Ese código no está en el catálogo. Dalo de alta desde Escanear.')
          return
        }
        avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo consultar el código')
      } finally {
        setConsultando(false)
      }
    },
    [avisos, onElegido],
  )

  const escaner = useEscaner((codigo) => {
    if (refPausado.current) return
    void resolverCodigo(codigo)
  })

  const { iniciar, detener } = escaner

  // La camara solo se abre en su pestana. Dejarla encendida detras de la
  // búsqueda gasta bateria y mantiene la luz prendida sin motivo.
  useEffect(() => {
    if (pestana === 'camara') {
      iniciar()
      return detener
    }

    detener()
    return undefined
  }, [pestana, iniciar, detener])

  useEffect(() => {
    const temporizador = window.setTimeout(() => setConsulta(texto), 120)
    return () => window.clearTimeout(temporizador)
  }, [texto])

  const resultados = useQuery({
    queryKey: ['buscar', consulta, ubicacionId],
    queryFn: ({ signal }) => api.buscar(consulta, signal, { ubicacionId }),
    enabled: pestana === 'buscar',
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-borde bg-papel px-3 pb-2">
        {(['camara', 'buscar'] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            onClick={() => setPestana(valor)}
            className={[
              'min-h-11 flex-1 rounded-xl px-3 text-[0.9375rem] font-semibold transition',
              pestana === valor
                ? 'bg-accion-tenue text-accion-viva'
                : 'text-tinta-tenue active:bg-papel-hundido',
            ].join(' ')}
          >
            {valor === 'camara' ? 'Escanear' : 'Buscar'}
          </button>
        ))}
      </div>

      {pestana === 'camara' ? (
        <VistaCamara
          escaner={escaner}
          indicacion={consultando ? 'Buscando…' : indicacion}
          onEscribirCodigo={() => setPestana('buscar')}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <CampoTexto
            etiqueta="Buscar en el catálogo"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, marca o código"
            autoComplete="off"
            autoFocus
          />

          {resultados.isPending && <Esqueleto filas={3} />}

          {resultados.isSuccess && resultados.data.productos.length === 0 && (
            <Vacio titulo="Nada con esa búsqueda" detalle="Prueba con menos palabras." />
          )}

          {resultados.isSuccess && resultados.data.productos.length > 0 && (
            <ul className="flex flex-col gap-2">
              {resultados.data.productos.map((producto) => (
                <li key={producto.id}>
                  <RenglonProducto
                    producto={producto}
                    coincidencia={producto.coincidencia}
                    ubicacionId={ubicacionId}
                    onClick={() => onElegido(producto)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-col gap-2 border-t border-borde pt-3">
            <CampoTexto
              etiqueta="O escribe el código de barras"
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="7501234567890"
            />
            <Boton
              tono="contorno"
              ancho
              cargando={consultando}
              disabled={codigoManual.trim().length < 4}
              onClick={() => {
                const codigo = codigoManual.trim()
                setCodigoManual('')
                void resolverCodigo(codigo)
              }}
            >
              Agregar por código
            </Boton>
          </div>
        </div>
      )}
    </div>
  )
}
