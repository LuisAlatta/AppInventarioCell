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
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import { ErrorEnPantalla, Esqueleto, Vacio } from '../componentes/Estados'
import { RenglonProducto } from '../componentes/FichaProducto'
import { Marco } from '../componentes/Marco'
import { useUbicacion } from '../contexto/Ubicacion'

/** Espera antes de consultar. Corto para que se sienta inmediato. */
const MS_ESPERA = 120

export function Buscar() {
  const navegar = useNavigate()
  const { activa } = useUbicacion()

  const [texto, setTexto] = useState('')
  const [consulta, setConsulta] = useState('')
  const refCampo = useRef<HTMLInputElement | null>(null)

  // El teclado se abre solo: quien entra a "Buscar" viene a escribir.
  useEffect(() => {
    refCampo.current?.focus()
  }, [])

  useEffect(() => {
    const temporizador = window.setTimeout(() => setConsulta(texto), MS_ESPERA)
    return () => window.clearTimeout(temporizador)
  }, [texto])

  const resultados = useQuery({
    queryKey: ['buscar', consulta],
    queryFn: ({ signal }) => api.buscar(consulta, signal),
    // Conserva la lista anterior mientras llega la nueva, para que no parpadee.
    placeholderData: keepPreviousData,
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
              className="absolute inset-y-0 right-2 my-auto flex size-9 items-center justify-center rounded-lg text-tinta-tenue transition active:bg-papel-hundido"
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

        {resultados.isError && (
          <ErrorEnPantalla
            mensaje="No se pudo buscar. Revisa la conexión."
            onReintentar={() => void resultados.refetch()}
          />
        )}

        {resultados.isPending && <Esqueleto filas={4} />}

        {resultados.isSuccess && productos.length === 0 && (
          <Vacio
            titulo={buscando ? 'Nada con esa búsqueda' : 'Todavía no hay productos'}
            detalle={
              buscando
                ? 'Prueba con menos palabras, o escanea el codigo del producto.'
                : 'Escanea el codigo de un producto para darlo de alta.'
            }
            accion={{ texto: 'Escanear un codigo', onClick: () => navegar('/escanear') }}
          />
        )}

        {productos.length > 0 && (
          <>
            {!buscando && (
              <p className="px-1 text-etiqueta text-tinta-tenue uppercase">Últimos productos</p>
            )}

            <ul className="flex flex-col gap-2">
              {productos.map((producto) => (
                <li key={producto.id}>
                  <RenglonProducto
                    producto={producto}
                    coincidencia={producto.coincidencia}
                    ubicacionId={activa?.id}
                    onClick={() => navegar(`/producto/${producto.id}`)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Marco>
  )
}
