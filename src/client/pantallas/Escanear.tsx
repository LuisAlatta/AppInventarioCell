/** Registro de productos y equipos con escaneo opcional por campo. */

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { FormularioProducto, type CampoEscaneable } from '../componentes/FormularioProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { IconoUbicacion } from '../componentes/IconoUbicacion'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { useUbicacion } from '../contexto/Ubicacion'
import { VistaCamara } from '../escaner/VistaCamara'
import { useEscaner } from '../escaner/useEscaner'

function nombreCampo(campo: CampoEscaneable): string {
  if (campo === 'codigo') return 'código del equipo'
  return campo.startsWith('imei1:') ? 'IMEI 1' : 'IMEI 2'
}

export function Escanear() {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const { activa, ubicaciones } = useUbicacion()

  const ubicacionesOrdenadas = useMemo(() => {
    return ubicaciones
      .filter((u) => u.activa)
      .sort((a, b) => {
        const esAlmacenA = a.tipo === 'warehouse' || a.nombre.toLowerCase().includes('almac')
        const esAlmacenB = b.tipo === 'warehouse' || b.nombre.toLowerCase().includes('almac')
        if (esAlmacenA && !esAlmacenB) return -1
        if (!esAlmacenA && esAlmacenB) return 1
        return a.nombre.localeCompare(b.nombre)
      })
  }, [ubicaciones])

  const [ubicacionDestinoId, setUbicacionDestinoId] = useState<string>(() => {
    const almacen = ubicaciones.find(
      (u) => u.activa && (u.tipo === 'warehouse' || u.nombre.toLowerCase().includes('almac')),
    )
    return almacen?.id ?? activa?.id ?? ubicaciones.find((u) => u.activa)?.id ?? ''
  })
  const [campo, setCampo] = useState<CampoEscaneable | null>(null)
  const [lectura, setLectura] = useState<{ campo: CampoEscaneable; valor: string } | null>(null)
  const [fotoParaRecortar, setFotoParaRecortar] = useState<{
    campo: CampoEscaneable
    archivo: Blob
  } | null>(null)

  useEffect(() => {
    if (!ubicacionDestinoId) {
      const almacen = ubicaciones.find(
        (u) => u.activa && (u.tipo === 'warehouse' || u.nombre.toLowerCase().includes('almac')),
      )
      setUbicacionDestinoId(almacen?.id ?? activa?.id ?? '')
    }
  }, [activa, ubicacionDestinoId, ubicaciones])

  // El desplazamiento vive dentro de Marco, no en window. Registrar siempre
  // empieza por el código de barras, nunca a mitad del formulario.
  useLayoutEffect(() => {
    document.getElementById('contenido-principal')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  const escaner = useEscaner((valor) => {
    if (campo === null) return
    setLectura({ campo, valor })
    setCampo(null)
  })

  useEffect(() => {
    if (campo !== null) {
      escaner.iniciar()
      return escaner.detener
    }
    escaner.detener()
    return undefined
  }, [campo, escaner.iniciar, escaner.detener])

  return (
    <Marco titulo="Registrar" claseMain="pb-28 flex flex-col min-h-0">
      <div className="flex flex-1 flex-col justify-between gap-2.5 min-h-0">
        {/* Selector de tienda o almacén en una sola fila simétrica */}
        <div className="flex flex-col gap-1">
          <span className="text-[0.875rem] font-semibold text-tinta-suave">
            Seleccione el local
          </span>
          <div className="grid grid-flow-col auto-cols-fr gap-1.5 w-full">
            {ubicacionesOrdenadas.map((u) => {
              const elegida = u.id === ubicacionDestinoId
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUbicacionDestinoId(u.id)}
                  aria-pressed={elegida}
                  className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-center text-[0.8125rem] font-semibold leading-none transition active:scale-[0.98] ${
                    elegida
                      ? 'border-accion bg-accion text-white shadow-xs'
                      : 'border-borde bg-white text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
                  }`}
                >
                  <IconoUbicacion icono={u.icono} tipo={u.tipo} className="size-3.5 shrink-0" />
                  <span className="truncate">{u.nombre}</span>
                </button>
              )
            })}
          </div>
        </div>

        <FormularioProducto
          ubicacionDestinoId={ubicacionDestinoId}
          onCambiarUbicacion={setUbicacionDestinoId}
          lectura={lectura}
          fotoParaRecortar={fotoParaRecortar}
          onEscanear={setCampo}
          onCancelar={() => navegar(-1)}
          onCreado={(producto, ubicacionNombre) => {
            void cliente.invalidateQueries({ queryKey: ['inicio'] })
            void cliente.invalidateQueries({ queryKey: ['movimientos'] })
            void cliente.invalidateQueries({ queryKey: ['buscar'] })
            avisos.exito(
              `${producto.nombre} registrado con éxito${ubicacionNombre ? ` en ${ubicacionNombre}` : ''}`,
            )
            navegar(`/producto/${producto.id}`)
          }}
        />
      </div>

      <HojaInferior abierta={campo !== null} onCerrar={() => setCampo(null)} titulo={campo === null ? 'Escanear' : `Escanear ${nombreCampo(campo)}`}>
        <div className="-mx-5 flex h-[65vh] flex-col overflow-hidden bg-tinta">
          <VistaCamara
            escaner={escaner}
            indicacion={campo === null ? undefined : `Apunta al ${nombreCampo(campo)}`}
            onEscribirCodigo={() => setCampo(null)}
            onTomarFoto={(blob) => {
              if (campo !== null) {
                setFotoParaRecortar({ campo, archivo: blob })
                setCampo(null)
              }
            }}
          />
          <div className="flex shrink-0 items-center gap-2 bg-tinta px-4 py-3 text-[0.8125rem] text-white/80"><Camera aria-hidden="true" className="size-4" strokeWidth={2} /><span>Apunta al código para leerlo o toma una foto para recortar.</span></div>
        </div>
      </HojaInferior>
    </Marco>
  )
}
