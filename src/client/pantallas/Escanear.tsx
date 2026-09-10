/** Registro de productos y equipos con escaneo opcional por campo. */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, PackagePlus } from 'lucide-react'
import { FormularioProducto } from '../componentes/FormularioProducto'
import { HojaInferior } from '../componentes/HojaInferior'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { VistaCamara } from '../escaner/VistaCamara'
import { useEscaner } from '../escaner/useEscaner'

type CampoEscaneable = 'codigo' | 'imei1' | 'imei2'

const NOMBRE_CAMPO: Record<CampoEscaneable, string> = {
  codigo: 'código de barras',
  imei1: 'IMEI 1',
  imei2: 'IMEI 2',
}

export function Escanear() {
  const navegar = useNavigate()
  const avisos = useAvisos()
  const cliente = useQueryClient()
  const [campo, setCampo] = useState<CampoEscaneable | null>(null)
  const [lectura, setLectura] = useState<{ campo: CampoEscaneable; valor: string } | null>(null)

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
    <Marco titulo="Registrar">
      <div className="flex flex-col gap-5">
        <section className="flex items-start gap-3 rounded-2xl border border-accion/20 bg-accion-tenue p-3.5 text-accion">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accion text-white">
            <PackagePlus className="size-5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[0.9375rem] font-semibold">Nuevo producto o equipo</h2>
            <p className="mt-0.5 text-[0.8125rem] leading-snug text-tinta-suave">Escribe los datos o usa la cámara al lado de cada código.</p>
          </div>
        </section>

        <FormularioProducto
          lectura={lectura}
          onEscanear={setCampo}
          onCancelar={() => navegar(-1)}
          onCreado={(producto) => {
            void cliente.invalidateQueries({ queryKey: ['inicio'] })
            void cliente.invalidateQueries({ queryKey: ['buscar'] })
            avisos.exito(`${producto.nombre} registrado`)
            navegar(`/producto/${producto.id}`)
          }}
        />
      </div>

      <HojaInferior abierta={campo !== null} onCerrar={() => setCampo(null)} titulo={campo === null ? 'Escanear' : `Escanear ${NOMBRE_CAMPO[campo]}`}>
        <div className="-mx-5 flex h-[65vh] flex-col overflow-hidden bg-tinta">
          <VistaCamara escaner={escaner} indicacion={campo === null ? undefined : `Apunta al ${NOMBRE_CAMPO[campo]}`} onEscribirCodigo={() => setCampo(null)} />
          <div className="flex shrink-0 items-center gap-2 bg-tinta px-4 py-3 text-[0.8125rem] text-white/80"><Camera aria-hidden="true" className="size-4" strokeWidth={2} /><span>La lectura se colocará en el campo abierto.</span></div>
        </div>
      </HojaInferior>
    </Marco>
  )
}
