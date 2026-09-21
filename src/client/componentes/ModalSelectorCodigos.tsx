/**
 * Modal táctil para seleccionar entre múltiples códigos de barras detectados en una caja.
 *
 * Permite al usuario elegir con un solo toque el código que necesita
 * (evitando confusiones entre SN, IMEI 1, IMEI 2 y EAN) o cargar simultáneamente
 * IMEI 1 e IMEI 2 cuando ambos están presentes en la misma imagen.
 */

import { Barcode, CheckCheck, Crop, Hash, ScanLine, Smartphone, X } from 'lucide-react'
import type { CodigoDetectado } from '../escaner/lecturaCodigo'
import { Boton } from './Boton'

export interface ModalSelectorCodigosProps {
  abierto: boolean
  codigos: CodigoDetectado[]
  campoDestinoNombre?: string
  onSeleccionarCodigo: (codigo: string) => void
  onSeleccionarAmbosImeis?: (imeis: { imei1: string; imei2: string }) => void
  onRecortarManualmente?: () => void
  onCancelar: () => void
}

export function ModalSelectorCodigos({
  abierto,
  codigos,
  campoDestinoNombre,
  onSeleccionarCodigo,
  onSeleccionarAmbosImeis,
  onRecortarManualmente,
  onCancelar,
}: ModalSelectorCodigosProps) {
  if (!abierto || codigos.length === 0) return null

  // Identificar si existen ambos IMEIs detectados
  const imei1 = codigos.find((c) => c.tipo === 'imei' && (c.etiqueta.includes('1') || c.etiqueta === 'IMEI'))
  const imei2 = codigos.find((c) => c.tipo === 'imei' && c.etiqueta.includes('2'))
  const hayAmbosImeis = Boolean(imei1 && imei2 && onSeleccionarAmbosImeis && imei1.valorLimpio !== imei2.valorLimpio)

  const obtenerIcono = (tipo: CodigoDetectado['tipo']) => {
    switch (tipo) {
      case 'imei':
        return <Smartphone className="size-5 shrink-0 text-accion" strokeWidth={2} />
      case 'ean':
        return <Barcode className="size-5 shrink-0 text-tinta-suave" strokeWidth={2} />
      case 'serie':
        return <Hash className="size-5 shrink-0 text-tinta-suave" strokeWidth={2} />
      default:
        return <ScanLine className="size-5 shrink-0 text-tinta-suave" strokeWidth={2} />
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-selector-codigos"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl border border-borde bg-superficie shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-borde px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="titulo-selector-codigos" className="text-[1.0625rem] font-bold text-tinta truncate leading-none">
              Códigos detectados en la caja
            </h2>
            <p className="mt-1 text-[0.8125rem] text-tinta-suave">
              {campoDestinoNombre
                ? `Elige el código que deseas usar para ${campoDestinoNombre}:`
                : 'Se detectaron varios códigos. Toca el que deseas usar:'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Cerrar selector de códigos"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-tinta-suave hover:bg-papel-hundido active:bg-papel-hundido transition ml-2"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        {/* Contenido con desplazamiento */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3">
          {/* Opción rápida: Rellenar ambos IMEIs si están presentes */}
          {hayAmbosImeis && imei1 && imei2 && (
            <button
              type="button"
              onClick={() => {
                onSeleccionarAmbosImeis?.({
                  imei1: imei1.valorLimpio,
                  imei2: imei2.valorLimpio,
                })
              }}
              className="flex flex-col gap-2 rounded-2xl border-2 border-accion bg-accion/5 p-4 text-left shadow-xs transition hover:bg-accion/10 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center justify-center gap-2 rounded-full bg-accion px-3 py-1 text-[0.75rem] font-bold text-white leading-none">
                  <CheckCheck className="size-3.5" strokeWidth={2.5} />
                  <span>Recomendado</span>
                </span>
                <span className="text-[0.75rem] font-semibold text-accion">1 solo toque</span>
              </div>
              <div>
                <p className="text-[1rem] font-bold text-tinta leading-snug">
                  Rellenar IMEI 1 e IMEI 2 juntos
                </p>
                <p className="text-[0.8125rem] text-tinta-suave mt-0.5">
                  Carga simultáneamente ambos números en el formulario
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 rounded-xl bg-white p-2.5 border border-accion/20 text-[0.8125rem] font-mono font-medium">
                <div>
                  <span className="text-[0.6875rem] font-sans font-semibold text-tinta-suave block">IMEI 1</span>
                  <span className="text-tinta font-bold truncate block">{imei1.valorLimpio}</span>
                </div>
                <div>
                  <span className="text-[0.6875rem] font-sans font-semibold text-tinta-suave block">IMEI 2</span>
                  <span className="text-tinta font-bold truncate block">{imei2.valorLimpio}</span>
                </div>
              </div>
            </button>
          )}

          {/* Listado individual de códigos */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.75rem] font-bold uppercase tracking-wider text-tinta-suave px-1">
              Seleccionar individualmente
            </span>
            {codigos.map((c, index) => {
              const esImei = c.tipo === 'imei'
              return (
                <button
                  key={`${c.valorLimpio}-${index}`}
                  type="button"
                  onClick={() => onSeleccionarCodigo(c.valorLimpio)}
                  className="flex items-center gap-3.5 rounded-2xl border border-borde bg-white p-3.5 text-left transition hover:border-borde-fuerte active:scale-[0.99] active:bg-papel-hundido shadow-xs"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-papel-hundido border border-borde">
                    {obtenerIcono(c.tipo)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[0.6875rem] font-bold leading-none ${
                          esImei
                            ? 'bg-accion-tenue text-accion'
                            : 'bg-papel-hundido text-tinta-suave'
                        }`}
                      >
                        {c.etiqueta}
                      </span>
                      {c.formato && c.formato !== 'Desconocido' && (
                        <span className="text-[0.6875rem] text-tinta-tenue font-mono truncate">
                          {c.formato}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[1rem] font-bold tracking-wide text-tinta truncate">
                      {c.valorLimpio}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Pie de modal */}
        <div className="border-t border-borde bg-papel-hundido/50 p-3 sm:p-4 flex items-center justify-between gap-2">
          {onRecortarManualmente ? (
            <button
              type="button"
              onClick={onRecortarManualmente}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[0.8125rem] font-semibold text-tinta-suave hover:text-tinta active:scale-95 transition"
            >
              <Crop className="size-4" strokeWidth={2} />
              <span>Recortar imagen a mano</span>
            </button>
          ) : (
            <div />
          )}
          <Boton tono="contorno" onClick={onCancelar} className="px-4 text-[0.875rem] font-semibold">
            Cancelar
          </Boton>
        </div>
      </div>
    </div>
  )
}
