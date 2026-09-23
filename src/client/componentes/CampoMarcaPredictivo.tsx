/**
 * Campo predictivo de Marca.
 *
 * Permite al usuario digitar cualquier marca libremente, buscar entre las
 * marcas existentes con autocompletado en tiempo real, o crear y guardar una
 * nueva marca al instante para que quede disponible en la lista para siempre.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Plus, Tag, X } from 'lucide-react'
import { api } from '../api/cliente'

interface CampoMarcaPredictivoProps {
  value: string
  onChange: (marca: string) => void
  etiqueta?: string
  error?: string | undefined
  ayuda?: string | undefined
  placeholder?: string
  autoFocus?: boolean
}

const MARCAS_DESTACADAS = [
  'Apple',
  'Samsung',
  'Xiaomi',
  'Motorola',
  'Honor',
  'Infinix',
  'OPPO',
  'Realme',
  'Vivo',
  'ZTE',
  'Huawei',
  'Poco',
  'Google',
  'Tecno',
]

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function CampoMarcaPredictivo({
  value,
  onChange,
  etiqueta = 'Marca',
  error,
  ayuda,
  placeholder = '',
  autoFocus = false,
}: CampoMarcaPredictivoProps) {
  const id = useId()
  const idError = `${id}-error`
  const idAyuda = `${id}-ayuda`
  const idLista = `${id}-lista`

  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()

  const [abierto, setAbierto] = useState(false)
  const [creando, setCreando] = useState(false)

  const marcasQuery = useQuery({
    queryKey: ['marcas'],
    queryFn: api.marcas,
    staleTime: 1000 * 60 * 5,
  })

  const marcas = marcasQuery.data?.marcas ?? []

  // Cerrar al tocar o hacer clic fuera del componente
  useEffect(() => {
    if (!abierto) return

    const tocarFuera = (evento: PointerEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false)
      }
    }

    document.addEventListener('pointerdown', tocarFuera)
    return () => document.removeEventListener('pointerdown', tocarFuera)
  }, [abierto])

  const consultaLimpia = normalizar(value)

  // Filtramos y ordenamos marcas predictivamente priorizando las más usadas
  const sugerencias = useMemo(() => {
    if (consultaLimpia === '') {
      const mapa = new Map(marcas.map((m) => [m.nombre.toLowerCase(), m]))
      const prioritarias: typeof marcas = []
      for (const dest of MARCAS_DESTACADAS) {
        const item = mapa.get(dest.toLowerCase())
        if (item) prioritarias.push(item)
      }
      return prioritarias.length > 0 ? prioritarias : marcas.slice(0, 10)
    }

    const queEmpiezan = marcas.filter((m) =>
      normalizar(m.nombre).startsWith(consultaLimpia),
    )
    const queContienen = marcas.filter(
      (m) =>
        !normalizar(m.nombre).startsWith(consultaLimpia) &&
        normalizar(m.nombre).includes(consultaLimpia),
    )

    const ordenarRelevancia = (lista: typeof marcas) =>
      [...lista].sort((a, b) => {
        const esDestA = MARCAS_DESTACADAS.some((d) => d.toLowerCase() === a.nombre.toLowerCase())
        const esDestB = MARCAS_DESTACADAS.some((d) => d.toLowerCase() === b.nombre.toLowerCase())
        if (esDestA && !esDestB) return -1
        if (!esDestA && esDestB) return 1
        return a.nombre.localeCompare(b.nombre)
      })

    return [...ordenarRelevancia(queEmpiezan), ...ordenarRelevancia(queContienen)].slice(0, 10)
  }, [marcas, consultaLimpia])

  // Verificamos si lo que escribió el usuario ya existe idéntico en las marcas
  const coincidenciaExacta = useMemo(() => {
    if (consultaLimpia === '') return true
    return marcas.some((m) => normalizar(m.nombre) === consultaLimpia)
  }, [marcas, consultaLimpia])

  const seleccionar = (nombreMarca: string) => {
    onChange(nombreMarca)
    setAbierto(false)
    inputRef.current?.focus()
  }

  const crearYGuardar = async (nombreMarca: string) => {
    const limpio = nombreMarca.trim()
    if (limpio === '') return

    setCreando(true)
    onChange(limpio)
    setAbierto(false)

    try {
      await api.crearMarca(limpio)
      void queryClient.invalidateQueries({ queryKey: ['marcas'] })
    } catch {
      // Si la petición previa falla o la marca ya se guardará al enviar el formulario,
      // el valor local ya quedó seleccionado.
    } finally {
      setCreando(false)
      inputRef.current?.focus()
    }
  }

  const limpiar = () => {
    onChange('')
    setAbierto(true)
    inputRef.current?.focus()
  }

  return (
    <div ref={contenedorRef} className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold text-tinta-suave">
        {etiqueta}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          aria-controls={abierto ? idLista : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            onChange(e.target.value)
            setAbierto(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAbierto(false)
            } else if (e.key === 'Enter') {
              if (abierto && sugerencias.length > 0 && sugerencias[0]) {
                e.preventDefault()
                seleccionar(sugerencias[0].nombre)
              }
            }
          }}
          aria-invalid={error !== undefined}
          aria-describedby={
            [error !== undefined ? idError : null, ayuda !== undefined ? idAyuda : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={[
            'w-full rounded-xl bg-superficie py-2.5 pl-3 pr-20',
            'text-[1.0625rem] text-tinta placeholder:text-tinta-tenue',
            'border transition-colors duration-100',
            'focus:outline-none focus:border-accion focus:ring-2 focus:ring-accion/15',
            error === undefined ? 'border-borde' : 'border-falta',
          ].join(' ')}
        />

        <div className="absolute inset-y-1 right-1 flex items-center gap-1">
          {value.trim() !== '' && (
            <button
              type="button"
              aria-label="Borrar marca"
              onClick={limpiar}
              className="flex size-8 items-center justify-center rounded-lg text-tinta-tenue hover:text-tinta active:bg-papel-hundido"
            >
              <X className="size-4" strokeWidth={2.25} />
            </button>
          )}

          <button
            type="button"
            aria-label={abierto ? 'Cerrar lista de marcas' : 'Abrir lista de marcas'}
            aria-expanded={abierto}
            onClick={() => setAbierto((prev) => !prev)}
            className="flex size-8 items-center justify-center rounded-lg text-accion hover:bg-accion-tenue active:bg-accion-tenue"
          >
            <ChevronDown
              className={`size-4.5 transition-transform duration-150 ${abierto ? 'rotate-180' : ''}`}
              strokeWidth={2.25}
            />
          </button>
        </div>
      </div>

      {abierto && (
        <div
          id={idLista}
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-borde bg-superficie p-1 shadow-lg ring-1 ring-black/5"
        >
          {/* Opción para crear la marca que está escribiendo si no existe idéntica */}
          {value.trim() !== '' && !coincidenciaExacta && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              disabled={creando}
              onClick={() => void crearYGuardar(value)}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-accion transition active:bg-accion-tenue"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accion-tenue text-accion">
                <Plus className="size-4" strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-semibold">
                  Crear y usar <span className="underline decoration-accion/50 font-bold">«{value.trim()}»</span>
                </p>
                <p className="text-[0.75rem] text-tinta-suave">Se guardará en la lista de marcas</p>
              </div>
            </button>
          )}

          {/* Lista de sugerencias predictivas */}
          {sugerencias.length > 0 ? (
            sugerencias.map((item) => {
              const estaSeleccionada =
                normalizar(item.nombre) === normalizar(value)

              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={estaSeleccionada}
                  onClick={() => seleccionar(item.nombre)}
                  className={[
                    'flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left transition',
                    estaSeleccionada
                      ? 'bg-accion-tenue text-accion font-semibold'
                      : 'text-tinta hover:bg-papel-hundido active:bg-accion-tenue',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Tag className="size-4 shrink-0 text-tinta-tenue" strokeWidth={2} />
                    <span className="truncate text-[0.875rem]">{item.nombre}</span>
                  </div>
                  {estaSeleccionada && (
                    <Check className="size-4 shrink-0 text-accion" strokeWidth={2.5} />
                  )}
                </button>
              )
            })
          ) : value.trim() !== '' && coincidenciaExacta ? null : (
            <div className="px-3 py-2 text-[0.8125rem] text-tinta-tenue">
              {value.trim() === ''
                ? 'No hay marcas registradas aún. Escribe una para agregarla.'
                : 'No se encontraron marcas coincidentes.'}
            </div>
          )}
        </div>
      )}

      {ayuda !== undefined && error === undefined && (
        <p id={idAyuda} className="text-[0.75rem] text-tinta-tenue">
          {ayuda}
        </p>
      )}
      {error !== undefined && (
        <p id={idError} className="text-[0.8125rem] font-medium text-falta">
          {error}
        </p>
      )}
    </div>
  )
}
