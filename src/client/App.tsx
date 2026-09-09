/**
 * Armado de la aplicacion: sesion, datos compartidos y rutas.
 *
 * La pantalla del escaner se carga aparte, bajo demanda. Arrastra el
 * decodificador WASM, que pesa mas que todo el resto de la app junta, y no
 * tiene sentido descargarlo para entrar a ver un reporte.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorDeApi, api } from './api/cliente'
import { Girador } from './componentes/Boton'
import { ErrorEnPantalla } from './componentes/Estados'
import { ProveedorAvisos } from './contexto/Avisos'
import { ProveedorUbicacion } from './contexto/Ubicacion'
import { Acceso } from './pantallas/Acceso'
import { Ajustes } from './pantallas/Ajustes'
import { Buscar } from './pantallas/Buscar'
import { Inicio } from './pantallas/Inicio'
import { Producto } from './pantallas/Producto'
import { Reportes } from './pantallas/Reportes'
import { Sucursales } from './pantallas/Sucursales'

/**
 * Las tres pantallas que usan la camara se cargan aparte.
 *
 * Arrastran el decodificador WASM, que pesa mas que todo el resto de la app
 * junta. Cargarlo al abrir la aplicacion retrasaria la pantalla de inicio para
 * quien solo viene a mirar un reporte. Vite reconoce que las tres comparten el
 * decodificador y lo pone en un solo trozo comun.
 */
const Escanear = lazy(() =>
  import('./pantallas/Escanear').then((modulo) => ({ default: modulo.Escanear })),
)
const Conteo = lazy(() => import('./pantallas/Conteo').then((m) => ({ default: m.Conteo })))
const Traspaso = lazy(() => import('./pantallas/Traspaso').then((m) => ({ default: m.Traspaso })))

const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos siguen sirviendo unos segundos: al volver de una pantalla no
      // hace falta parpadear con una recarga.
      staleTime: 10_000,
      retry: (intentos, causa) => {
        // Reintentar un 401 o un error de validacion nunca cambia el
        // resultado, solo retrasa el mensaje.
        if (causa instanceof ErrorDeApi && causa.estado > 0 && causa.estado < 500) return false
        return intentos < 2
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})

export function App() {
  return (
    <QueryClientProvider client={clienteConsultas}>
      <ProveedorAvisos>
        <BrowserRouter>
          <Puerta />
        </BrowserRouter>
      </ProveedorAvisos>
    </QueryClientProvider>
  )
}

/** Decide entre la pantalla de acceso y la aplicacion. */
function Puerta() {
  const cliente = useQueryClient()
  const [entro, setEntro] = useState(false)

  const estado = useQuery({
    queryKey: ['acceso'],
    queryFn: api.estadoAcceso,
    staleTime: 0,
  })

  const alEntrar = useCallback(() => {
    setEntro(true)
    void cliente.invalidateQueries()
  }, [cliente])

  /**
   * Si la sesion se cae a media faena, se vuelve al PIN.
   *
   * Se escucha en el cliente de consultas en lugar de comprobarlo en cada
   * pantalla: una pantalla que se olvidara de mirarlo se quedaria mostrando un
   * error incomprensible en bucle.
   */
  useEffect(() => {
    const desuscribir = cliente.getQueryCache().subscribe((evento) => {
      const causa = evento.query.state.error
      if (causa instanceof ErrorDeApi && causa.esSesionCaida) setEntro(false)
    })

    return desuscribir
  }, [cliente])

  if (estado.isPending) return <PantallaCargando />

  if (estado.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-papel p-6">
        <div className="w-full max-w-sm">
          <ErrorEnPantalla
            mensaje={
              estado.error instanceof ErrorDeApi
                ? estado.error.message
                : 'No se pudo contactar al servidor.'
            }
            onReintentar={() => void estado.refetch()}
          />
        </div>
      </div>
    )
  }

  const autenticado = entro || estado.data.autenticado

  if (!autenticado) {
    return <Acceso configurado={estado.data.configurado} onEntro={alEntrar} />
  }

  return <Aplicacion />
}

/**
 * Carga las ubicaciones antes de mostrar cualquier pantalla.
 *
 * Todo en la app ocurre en una ubicacion, así que sin ellas no hay nada
 * coherente que dibujar. Cargarlas aquí evita que cada pantalla tenga que
 * manejar el caso de "todavía no se cuales hay".
 */
function Aplicacion() {
  const ubicaciones = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => api.ubicaciones(),
    staleTime: 60_000,
  })

  if (ubicaciones.isPending) return <PantallaCargando />

  if (ubicaciones.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-papel p-6">
        <div className="w-full max-w-sm">
          <ErrorEnPantalla
            mensaje={
              ubicaciones.error instanceof ErrorDeApi
                ? ubicaciones.error.message
                : 'No se pudieron cargar las ubicaciones.'
            }
            onReintentar={() => void ubicaciones.refetch()}
          />
        </div>
      </div>
    )
  }

  return (
    <ProveedorUbicacion ubicaciones={ubicaciones.data.ubicaciones}>
      <Suspense fallback={<PantallaCargando />}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/buscar" element={<Buscar />} />
          <Route path="/escanear" element={<Escanear />} />
          <Route path="/producto/:id" element={<Producto />} />
          <Route path="/traspaso" element={<Traspaso />} />
          <Route path="/conteo" element={<Conteo />} />
          <Route path="/sucursales" element={<Sucursales />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ProveedorUbicacion>
  )
}

function PantallaCargando() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-papel text-tinta-tenue">
      <Girador className="size-7" />
    </div>
  )
}
