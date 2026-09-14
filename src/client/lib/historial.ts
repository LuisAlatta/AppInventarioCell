import type { Movimiento, TipoMovimiento } from "@compartido/tipos";
import { desdeSqlite } from "./formato";

export interface FiltrosHistorial {
  consulta: string;
  tipo: TipoMovimiento | "todos";
  ubicacionId: string | "todas";
  desde: string;
  hasta: string;
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

function fechaLocal(textoSqlite: string): string {
  const fecha = desdeSqlite(textoSqlite);
  if (Number.isNaN(fecha.getTime())) return "";

  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Aplica los filtros locales a los 200 movimientos cargados en la bitácora. */
export function filtrarMovimientos(
  movimientos: readonly Movimiento[],
  filtros: FiltrosHistorial,
): Movimiento[] {
  const consulta = normalizar(filtros.consulta.trim());

  return movimientos.filter((movimiento) => {
    const coincideTexto =
      consulta === "" ||
      normalizar(
        `${movimiento.productoNombre} ${movimiento.productoModelo ?? ""}`,
      ).includes(consulta);
    if (
      !coincideTexto ||
      (filtros.tipo !== "todos" && movimiento.tipo !== filtros.tipo)
    )
      return false;

    const coincideUbicacion =
      filtros.ubicacionId === "todas" ||
      movimiento.ubicacionOrigenId === filtros.ubicacionId ||
      movimiento.ubicacionDestinoId === filtros.ubicacionId;
    if (!coincideUbicacion) return false;

    const fecha = fechaLocal(movimiento.creadoEn);
    return (
      (filtros.desde === "" || fecha >= filtros.desde) &&
      (filtros.hasta === "" || fecha <= filtros.hasta)
    );
  });
}
