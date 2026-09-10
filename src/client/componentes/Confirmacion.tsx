import { Boton } from './Boton'

/** Confirmación visible para cambios que no se deben ejecutar por accidente. */
export function Confirmacion({
  abierta, titulo, detalle, confirmar, peligro = false, onCancelar, onConfirmar,
}: {
  abierta: boolean
  titulo: string
  detalle: string
  confirmar: string
  peligro?: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  if (!abierta) return null
  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
    <button type="button" aria-label="Cancelar" className="absolute inset-0 bg-tinta/45 backdrop-blur-sm" onClick={onCancelar} />
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirmacion-titulo" className="animar-aviso relative w-full max-w-sm rounded-3xl border border-borde bg-superficie p-5 shadow-2xl">
      <div className={`mb-3 flex size-11 items-center justify-center rounded-2xl ${peligro ? 'bg-falta-tenue text-falta' : 'bg-alerta-tenue text-alerta'}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-6" fill="none"><path d="M12 8v4m0 4h.01M10.2 4.5 3.8 16a2 2 0 0 0 1.75 3h12.9a2 2 0 0 0 1.75-3L13.8 4.5a2.06 2.06 0 0 0-3.6 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </div>
      <h2 id="confirmacion-titulo" className="text-[1.125rem] font-semibold">{titulo}</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-tinta-suave">{detalle}</p>
      <div className="mt-5 grid grid-cols-2 gap-2.5"><Boton tono="contorno" onClick={onCancelar}>Cancelar</Boton><Boton tono={peligro ? 'peligro' : 'accion'} onClick={onConfirmar}>{confirmar}</Boton></div>
    </section>
  </div>
}
