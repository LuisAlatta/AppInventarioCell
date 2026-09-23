/** Bitácora consultable de todas las entradas, salidas y traspasos. */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import type { Movimiento, TipoMovimiento } from "@compartido/tipos";
import { api } from "../api/cliente";
import { Esqueleto, ErrorEnPantalla, Vacio } from "../componentes/Estados";
import { Miniatura } from "../componentes/FichaProducto";
import { Marco } from "../componentes/Marco";
import { dinero, fechaLarga, NOMBRE_MOVIMIENTO, numero } from "../lib/formato";
import { filtrarMovimientos, type FiltrosHistorial } from "../lib/historial";

const FILTROS_INICIALES: FiltrosHistorial = {
  consulta: "",
  tipo: "todos",
  ubicacionId: "todas",
  desde: "",
  hasta: "",
};
const TIPOS: readonly (readonly [FiltrosHistorial["tipo"], string])[] = [
  ["todos", "Todos"],
  ["sale", "Ventas"],
  ["purchase_in", "Entradas"],
  ["transfer", "Traspasos"],
  ["return", "Devoluciones"],
  ["loss", "Mermas"],
  ["adjustment", "Ajustes"],
  ["count", "Conteos"],
];

export function Historial() {
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState<FiltrosHistorial>(FILTROS_INICIALES);
  const historial = useQuery({
    queryKey: ["movimientos"],
    queryFn: () => api.movimientos(1000),
  });
  const movimientos = historial.data?.movimientos ?? [];
  const filtrados = useMemo(
    () => filtrarMovimientos(movimientos, filtros),
    [movimientos, filtros],
  );
  const ubicaciones = useMemo(() => ubicacionesDe(movimientos), [movimientos]);
  const resumen = useMemo(() => resumenDe(filtrados), [filtrados]);
  const hayFiltros =
    filtros.consulta !== "" ||
    filtros.tipo !== "todos" ||
    filtros.ubicacionId !== "todas" ||
    filtros.desde !== "" ||
    filtros.hasta !== "";

  return (
    <Marco titulo="Movimientos" atras>
      <div className="flex flex-col gap-3 pb-2">
        <section
          className="rounded-2xl border border-borde bg-superficie p-3"
          aria-label="Buscar y filtrar movimientos"
        >
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-5 text-tinta-tenue"
              aria-hidden="true"
              fill="none"
            >
              <circle
                cx="11"
                cy="11"
                r="6.5"
                stroke="currentColor"
                strokeWidth="1.9"
              />
              <path
                d="M16 16l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              value={filtros.consulta}
              onChange={(evento) =>
                setFiltros((actual) => ({
                  ...actual,
                  consulta: evento.target.value,
                }))
              }
              placeholder="Buscar por nombre o modelo"
              aria-label="Buscar por nombre o modelo"
              enterKeyHint="search"
              autoComplete="off"
              className="min-h-toque w-full rounded-xl border border-borde bg-papel pl-11 pr-11 text-[1rem] placeholder:text-tinta-tenue focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {filtros.consulta !== "" && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() =>
                  setFiltros((actual) => ({ ...actual, consulta: "" }))
                }
                className="absolute inset-y-0 right-1 my-auto flex size-11 items-center justify-center rounded-lg text-tinta-tenue active:bg-papel-hundido"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  aria-hidden="true"
                  fill="none"
                >
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
          <div
            className="mt-3 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
            aria-label="Filtrar por tipo"
          >
            {TIPOS.map(([tipo, nombre]) => (
              <button
                key={tipo}
                type="button"
                aria-pressed={filtros.tipo === tipo}
                onClick={() => setFiltros((actual) => ({ ...actual, tipo }))}
                className={`min-h-10 shrink-0 rounded-xl border px-3 text-[0.8125rem] font-semibold ${filtros.tipo === tipo ? "border-accion bg-accion-tenue text-accion" : "border-borde bg-superficie text-tinta-suave active:bg-papel-hundido"}`}
              >
                {nombre}
              </button>
            ))}
          </div>
          <details className="mt-2 border-t border-borde pt-2">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 text-[0.875rem] font-semibold text-tinta-suave active:bg-papel-hundido">
              <span>Fecha y ubicación</span>
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                aria-hidden="true"
                fill="none"
              >
                <path
                  d="m7 10 5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1 text-[0.75rem] font-semibold text-tinta-suave">
                Ubicación
                <select
                  value={filtros.ubicacionId}
                  onChange={(evento) =>
                    setFiltros((actual) => ({
                      ...actual,
                      ubicacionId: evento.target.value,
                    }))
                  }
                  className="min-h-11 rounded-xl border border-borde bg-papel px-3 text-[0.9375rem] font-normal text-tinta focus:border-accion focus:outline-none"
                >
                  <option value="todas">Todas las ubicaciones</option>
                  {ubicaciones.map((ubicacion) => (
                    <option key={ubicacion.id} value={ubicacion.id}>
                      {ubicacion.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <CampoFecha
                etiqueta="Desde"
                valor={filtros.desde}
                alCambiar={(desde) =>
                  setFiltros((actual) => ({ ...actual, desde }))
                }
              />
              <CampoFecha
                etiqueta="Hasta"
                valor={filtros.hasta}
                alCambiar={(hasta) =>
                  setFiltros((actual) => ({ ...actual, hasta }))
                }
              />
            </div>
          </details>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => setFiltros(FILTROS_INICIALES)}
              className="mt-2 min-h-10 px-2 text-[0.8125rem] font-semibold text-accion active:bg-accion-tenue"
            >
              Limpiar filtros
            </button>
          )}
        </section>

        {historial.isPending && <Esqueleto filas={6} />}
        {historial.isError && (
          <ErrorEnPantalla
            mensaje="No se pudo cargar el historial."
            onReintentar={() => void historial.refetch()}
          />
        )}
        {historial.isSuccess && movimientos.length === 0 && (
          <Vacio
            titulo="Aún no hay movimientos"
            detalle="Las entradas, ventas y traspasos aparecerán aquí."
          />
        )}
        {historial.isSuccess && movimientos.length > 0 && (
          <>
            <section
              className="grid grid-cols-3 gap-2"
              aria-label="Resumen de resultados"
            >
              <DatoResumen
                etiqueta="Mostrados"
                valor={numero(filtrados.length)}
                detalle={`de ${numero(movimientos.length)}`}
              />
              <DatoResumen
                etiqueta="Ventas"
                valor={dinero(resumen.ventas)}
                detalle={`${numero(resumen.operacionesVenta)} operaciones`}
                tono="text-exito"
              />
              <DatoResumen
                etiqueta="Compras"
                valor={dinero(resumen.compras)}
                detalle={`${numero(resumen.operacionesCompra)} operaciones`}
                tono="text-accion"
              />
            </section>
            {filtrados.length === 0 ? (
              <Vacio
                titulo="No hay movimientos con esos filtros"
                detalle="Prueba con otro texto, tipo, fecha o ubicación."
                accion={
                  hayFiltros
                    ? {
                        texto: "Limpiar filtros",
                        onClick: () => setFiltros(FILTROS_INICIALES),
                      }
                    : undefined
                }
              />
            ) : (
              <>
                <p
                  role="status"
                  className="px-1 text-[0.75rem] text-tinta-tenue"
                >
                  Toca un movimiento para abrir el producto. Las fechas incluyen
                  hora local.
                </p>
                <ul className="flex flex-col gap-2">
                  {filtrados.map((movimiento) => (
                    <li key={movimiento.id}>
                      <RenglonMovimiento
                        movimiento={movimiento}
                        alAbrir={() =>
                          navegar(`/producto/${movimiento.productoId}`)
                        }
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </Marco>
  );
}

function CampoFecha({
  etiqueta,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[0.75rem] font-semibold text-tinta-suave">
      {etiqueta}
      <input
        type="date"
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        className="min-h-11 rounded-xl border border-borde bg-papel px-2 text-[0.875rem] font-normal text-tinta focus:border-accion focus:outline-none"
      />
    </label>
  );
}

function DatoResumen({
  etiqueta,
  valor,
  detalle,
  tono = "text-tinta",
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-borde bg-superficie p-2.5">
      <p className="truncate text-[0.6875rem] font-semibold uppercase tracking-wide text-tinta-tenue">
        {etiqueta}
      </p>
      <p
        className={`cifras mt-1 truncate text-[0.9375rem] font-semibold ${tono}`}
      >
        {valor}
      </p>
      <p className="truncate text-[0.6875rem] text-tinta-tenue">{detalle}</p>
    </div>
  );
}

function RenglonMovimiento({
  movimiento,
  alAbrir,
}: {
  movimiento: Movimiento;
  alAbrir: () => void;
}) {
  const entrada =
    movimiento.ubicacionDestinoId !== null &&
    movimiento.ubicacionOrigenId === null;
  const salida =
    movimiento.ubicacionOrigenId !== null &&
    movimiento.ubicacionDestinoId === null;
  const color = entrada ? "text-exito" : salida ? "text-falta" : "text-accion";
  const total =
    movimiento.tipo === "purchase_in"
      ? movimiento.costoUnitario * movimiento.cantidad
      : movimiento.precioVentaUnitario * movimiento.cantidad;

  return (
    <button
      type="button"
      onClick={alAbrir}
      className="w-full overflow-hidden rounded-2xl border border-borde bg-superficie text-left active:bg-papel-hundido"
    >
      <div className="flex items-start gap-3 px-3.5 pb-2 pt-3">
        <Miniatura
          nombre={movimiento.productoNombre}
          claveImagen={movimiento.claveImagenProducto}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
              {movimiento.productoNombre}
            </p>
            <span
              className={`cifras shrink-0 inline-flex items-center gap-0.5 text-[1rem] font-semibold ${movimiento.revertidoEn !== null ? "text-tinta-tenue line-through" : color}`}
            >
              {entrada ? "+" : salida ? "−" : <ArrowLeftRight className="h-3.5 w-3.5" />}
              {numero(movimiento.cantidad)}
            </span>
          </div>
          {movimiento.productoModelo !== null &&
            movimiento.productoModelo !== "" && (
              <p className="truncate text-[0.75rem] text-tinta-suave">
                {movimiento.productoModelo}
              </p>
            )}
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold ${tonoTipo(movimiento.tipo)}`}
            >
              {NOMBRE_MOVIMIENTO[movimiento.tipo] ?? movimiento.tipo}
            </span>
            {movimiento.ubicacionOrigenNombre !== null && movimiento.ubicacionDestinoNombre !== null ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-[0.75rem] text-tinta-tenue">
                <span className="truncate">{movimiento.ubicacionOrigenNombre}</span>
                <ArrowRight className="h-3 w-3 shrink-0 opacity-70" />
                <span className="truncate">{movimiento.ubicacionDestinoNombre}</span>
              </span>
            ) : (
              <p className="truncate text-[0.75rem] text-tinta-tenue">
                {movimiento.ubicacionDestinoNombre ??
                  movimiento.ubicacionOrigenNombre ??
                  "Sin ubicación"}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-borde bg-papel/60 px-3.5 py-2">
        <Precio etiqueta="Compra" valor={dinero(movimiento.costoUnitario)} />
        <Precio
          etiqueta={movimiento.precioVentaHistorico ? "Venta" : "Venta actual"}
          valor={dinero(movimiento.precioVentaUnitario)}
        />
        <Precio
          etiqueta={
            movimiento.tipo === "purchase_in" ? "Costo total" : "Venta total"
          }
          valor={dinero(total)}
          final
        />
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-2.5 text-[0.75rem] text-tinta-tenue">
        <p>{fechaLarga(movimiento.creadoEn)}</p>
        {!movimiento.precioVentaHistorico && (
          <p>
            Precio de venta actual; este movimiento es anterior al registro
            histórico.
          </p>
        )}
        {movimiento.nota !== null && movimiento.nota !== "" && (
          <p className="text-tinta-suave">{movimiento.nota}</p>
        )}
        {movimiento.revertidoEn !== null && (
          <p className="font-semibold text-alerta">Movimiento revertido</p>
        )}
      </div>
    </button>
  );
}

function Precio({
  etiqueta,
  valor,
  final = false,
}: {
  etiqueta: string;
  valor: string;
  final?: boolean;
}) {
  return (
    <div
      className={`min-w-0 ${final ? "pl-2 text-right" : "border-r border-borde pr-2"}`}
    >
      <p className="truncate text-[0.625rem] font-semibold uppercase tracking-wide text-tinta-tenue">
        {etiqueta}
      </p>
      <p className="cifras truncate text-[0.8125rem] font-semibold text-tinta">
        {valor}
      </p>
    </div>
  );
}
function tonoTipo(tipo: TipoMovimiento): string {
  if (tipo === "sale" || tipo === "loss") return "bg-falta-tenue text-falta";
  if (tipo === "purchase_in" || tipo === "return")
    return "bg-exito-tenue text-exito";
  return "bg-accion-tenue text-accion";
}
function ubicacionesDe(
  movimientos: readonly Movimiento[],
): { id: string; nombre: string }[] {
  const porId = new Map<string, string>();
  for (const movimiento of movimientos) {
    if (
      movimiento.ubicacionOrigenId !== null &&
      movimiento.ubicacionOrigenNombre !== null
    )
      porId.set(movimiento.ubicacionOrigenId, movimiento.ubicacionOrigenNombre);
    if (
      movimiento.ubicacionDestinoId !== null &&
      movimiento.ubicacionDestinoNombre !== null
    )
      porId.set(
        movimiento.ubicacionDestinoId,
        movimiento.ubicacionDestinoNombre,
      );
  }
  return [...porId]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
function resumenDe(movimientos: readonly Movimiento[]) {
  let ventas = 0;
  let compras = 0;
  let operacionesVenta = 0;
  let operacionesCompra = 0;
  for (const movimiento of movimientos) {
    if (movimiento.revertidoEn !== null) continue;
    if (movimiento.tipo === "sale") {
      ventas += movimiento.precioVentaUnitario * movimiento.cantidad;
      operacionesVenta += 1;
    }
    if (movimiento.tipo === "purchase_in") {
      compras += movimiento.costoUnitario * movimiento.cantidad;
      operacionesCompra += 1;
    }
  }
  return { ventas, compras, operacionesVenta, operacionesCompra };
}
