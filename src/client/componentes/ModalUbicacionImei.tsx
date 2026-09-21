/**
 * Modal que muestra la ubicación y detalles de un equipo celular ya registrado.
 *
 * Se abre cuando el usuario intenta registrar un IMEI existente y presiona
 * el enlace "Ver" para saber en qué tienda o almacén se encuentra dicha unidad.
 */

import { CheckCircle2, MapPin, Package, Smartphone, Store, X } from 'lucide-react'
import type { Equipo } from '@compartido/tipos'
import { Boton } from './Boton'

export interface ModalUbicacionImeiProps {
  abierto: boolean
  equipo: Equipo | null
  imeiConsultado?: string
  onCerrar: () => void
}

export function ModalUbicacionImei({
  abierto,
  equipo,
  imeiConsultado,
  onCerrar,
}: ModalUbicacionImeiProps) {
  if (!abierto || equipo === null) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ubicacion-imei"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl border border-borde bg-superficie shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-borde px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-falta/10 text-falta">
              <MapPin className="size-5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h2 id="titulo-ubicacion-imei" className="text-[1rem] font-bold text-tinta truncate leading-none">
                Equipo ya registrado
              </h2>
              <p className="mt-1 text-[0.75rem] text-tinta-suave truncate">
                IMEI: <span className="font-mono font-bold text-tinta">{imeiConsultado || equipo.imei1}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar ventana de ubicación"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-tinta-suave hover:bg-papel-hundido active:bg-papel-hundido transition ml-2"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">
          {/* Tarjeta destacada de la tienda / almacén donde está ubicado */}
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-accion bg-accion/5 p-4">
            <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-accion">
              Ubicación actual en sistema
            </span>
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accion text-white shadow-xs">
                <Store className="size-6" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[1.1875rem] font-black text-tinta leading-snug">
                  {equipo.ubicacionNombre}
                </p>
                <p className="text-[0.8125rem] text-tinta-suave">
                  {equipo.activo ? 'En inventario disponible' : 'Equipo vendido / inactivo'}
                </p>
              </div>
            </div>
          </div>

          {/* Ficha de datos del equipo */}
          <div className="flex flex-col gap-2.5 rounded-2xl border border-borde bg-white p-4 text-[0.875rem] shadow-xs">
            <div className="flex items-start gap-2.5 pb-2.5 border-b border-borde">
              <Package className="size-4.5 shrink-0 text-tinta-suave mt-0.5" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <span className="text-[0.6875rem] font-semibold text-tinta-suave uppercase tracking-wider block">
                  Modelo / Producto
                </span>
                <p className="font-bold text-tinta leading-snug truncate">
                  {equipo.productoNombre}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-xl bg-papel-hundido p-2.5">
                <span className="text-[0.6875rem] font-semibold text-tinta-suave block">IMEI 1</span>
                <span className="font-mono text-[0.8125rem] font-bold text-tinta truncate block">
                  {equipo.imei1 || '—'}
                </span>
              </div>
              <div className="rounded-xl bg-papel-hundido p-2.5">
                <span className="text-[0.6875rem] font-semibold text-tinta-suave block">IMEI 2</span>
                <span className="font-mono text-[0.8125rem] font-bold text-tinta truncate block">
                  {equipo.imei2 || 'No registrado'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[0.75rem] pt-1">
              <div className="flex items-center gap-1.5 text-tinta-suave">
                <CheckCircle2 className="size-3.5 shrink-0 text-exito" strokeWidth={2} />
                <span>
                  Condición: <strong className="text-tinta">{equipo.condicion === 'new' ? 'Nuevo' : 'Usado'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-tinta-suave">
                <Smartphone className="size-3.5 shrink-0 text-accion" strokeWidth={2} />
                <span>
                  Lista: <strong className="text-tinta">{equipo.listaBlanca === 'registered' ? 'Registrado' : 'No reg.'}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pie con botón de cierre */}
        <div className="border-t border-borde bg-papel-hundido/50 p-4 flex justify-end">
          <Boton tono="accion" onClick={onCerrar} className="w-full sm:w-auto px-6 text-[0.9375rem] font-semibold">
            Entendido
          </Boton>
        </div>
      </div>
    </div>
  )
}
