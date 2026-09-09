/**
 * Ajustes: PIN, categorias, ubicaciones y salida.
 *
 * Deliberadamente corta. Cada opcion que se agrega aquí es una decision mas que
 * alguien tiene que entender, y esta app la usa una sola persona que quiere
 * contar su mercancía, no configurar un sistema.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { CampoTexto } from '../componentes/Campo'
import { Etiqueta } from '../componentes/Estados'
import { HojaInferior } from '../componentes/HojaInferior'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'

export function Ajustes() {
  const navegar = useNavigate()
  const cliente = useQueryClient()

  const [cambiandoPin, setCambiandoPin] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState(false)

  const categorias = useQuery({ queryKey: ['categorias'], queryFn: api.categorias })

  const salir = async (): Promise<void> => {
    try {
      await api.salir()
    } finally {
      // Se limpia la cache siempre, incluso si la peticion fallo: dejar datos
      // del inventario en memoria tras cerrar sesion no tiene sentido.
      cliente.clear()
      window.location.href = '/'
    }
  }

  return (
    <Marco titulo="Ajustes" atras sinUbicacion>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <Etiqueta>Negocio</Etiqueta>

          <div className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            <Fila
              titulo="Almacén y sucursales"
              detalle="Crear, editar, activar o desactivar"
              onClick={() => navegar('/sucursales')}
            />
            <Fila
              titulo="Categorías"
              detalle={
                categorias.isSuccess
                  ? `${categorias.data.categorias.length} categorias`
                  : 'Cargando…'
              }
              onClick={() => setNuevaCategoria(true)}
            />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <Etiqueta>Seguridad</Etiqueta>

          <div className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            <Fila
              titulo="Cambiar el PIN"
              detalle="Los seis números con los que entras"
              onClick={() => setCambiandoPin(true)}
            />
          </div>

          <p className="px-1 text-[0.8125rem] leading-relaxed text-tinta-tenue">
            Nadie puede recuperar el PIN por ti: no se guarda en ningun lado en claro. Anótalo en
            un lugar seguro.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <Boton tono="contorno" ancho onClick={() => void salir()}>
            Cerrar sesion
          </Boton>
        </section>
      </div>

      <HojaInferior
        abierta={cambiandoPin}
        onCerrar={() => setCambiandoPin(false)}
        titulo="Cambiar el PIN"
      >
        <CambioPin onListo={() => setCambiandoPin(false)} />
      </HojaInferior>

      <HojaInferior
        abierta={nuevaCategoria}
        onCerrar={() => setNuevaCategoria(false)}
        titulo="Categorías"
      >
        <Categorias onListo={() => setNuevaCategoria(false)} />
      </HojaInferior>
    </Marco>
  )
}

function Fila({
  titulo,
  detalle,
  onClick,
}: {
  titulo: string
  detalle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-toque w-full items-center gap-3 px-3.5 text-left transition active:bg-papel-hundido"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[1rem] font-medium">{titulo}</span>
        <span className="truncate text-[0.8125rem] text-tinta-tenue">{detalle}</span>
      </span>

      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-tinta-tenue" aria-hidden="true" fill="none">
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function CambioPin({ onListo }: { onListo: () => void }) {
  const avisos = useAvisos()

  const [actual, setActual] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [repetido, setRepetido] = useState('')
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  const guardar = async (): Promise<void> => {
    const problemas: Record<string, string> = {}
    if (!/^[0-9]{6}$/.test(actual)) problemas.actual = 'Son 6 números'
    if (!/^[0-9]{6}$/.test(nuevo)) problemas.nuevo = 'Son 6 números'
    if (nuevo !== repetido) problemas.repetido = 'No coincide con el nuevo PIN'

    if (Object.keys(problemas).length > 0) {
      setCampos(problemas)
      return
    }

    setEnviando(true)
    setCampos({})

    try {
      await api.cambiarPin(actual, nuevo)
      avisos.exito('PIN cambiado')
      onListo()
    } catch (causa) {
      if (causa instanceof ErrorDeApi) {
        setCampos(causa.campos ?? { actual: causa.message })
        avisos.error(causa.message)
      } else {
        avisos.error('No se pudo cambiar el PIN')
      }
    } finally {
      setEnviando(false)
    }
  }

  const soloDigitos = (valor: string): string => valor.replace(/[^0-9]/g, '').slice(0, 6)

  return (
    <div className="flex flex-col gap-4 pb-3">
      <CampoTexto
        etiqueta="PIN actual"
        value={actual}
        error={campos.actual}
        onChange={(e) => setActual(soloDigitos(e.target.value))}
        inputMode="numeric"
        autoComplete="off"
        type="password"
      />
      <CampoTexto
        etiqueta="PIN nuevo"
        value={nuevo}
        error={campos.nuevo}
        onChange={(e) => setNuevo(soloDigitos(e.target.value))}
        inputMode="numeric"
        autoComplete="off"
        type="password"
      />
      <CampoTexto
        etiqueta="Repite el PIN nuevo"
        value={repetido}
        error={campos.repetido}
        onChange={(e) => setRepetido(soloDigitos(e.target.value))}
        inputMode="numeric"
        autoComplete="off"
        type="password"
      />

      <Boton ancho cargando={enviando} onClick={() => void guardar()}>
        Cambiar el PIN
      </Boton>
    </div>
  )
}

function Categorias({ onListo }: { onListo: () => void }) {
  const avisos = useAvisos()
  const cliente = useQueryClient()

  const [nombre, setNombre] = useState('')
  const [enviando, setEnviando] = useState(false)

  const categorias = useQuery({ queryKey: ['categorias'], queryFn: api.categorias })

  const crear = async (): Promise<void> => {
    if (nombre.trim().length === 0) return

    setEnviando(true)
    try {
      await api.crearCategoria(nombre.trim())
      setNombre('')
      avisos.exito('Categoría creada')
      void cliente.invalidateQueries({ queryKey: ['categorias'] })
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo crear')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-3">
      {categorias.isSuccess && categorias.data.categorias.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {categorias.data.categorias.map((categoria) => (
            <li
              key={categoria.id}
              className="rounded-xl border border-borde bg-superficie px-3 py-2 text-[0.9375rem]"
            >
              {categoria.nombre}
            </li>
          ))}
        </ul>
      )}

      <CampoTexto
        etiqueta="Nueva categoría"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Audífonos"
        autoComplete="off"
        autoFocus
      />

      <div className="grid grid-cols-[1fr_2fr] gap-2.5">
        <Boton tono="contorno" onClick={onListo} disabled={enviando}>
          Listo
        </Boton>
        <Boton
          cargando={enviando}
          disabled={nombre.trim().length === 0}
          onClick={() => void crear()}
        >
          Agregar
        </Boton>
      </div>
    </div>
  )
}
