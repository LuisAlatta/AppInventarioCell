import { describe, expect, test } from "vitest";
import type { Movimiento } from "@compartido/tipos";
import { filtrarMovimientos, type FiltrosHistorial } from "./historial";

function movimiento(cambios: Partial<Movimiento> = {}): Movimiento {
  return {
    id: "mov_1",
    tipo: "sale",
    productoId: "prod_1",
    productoNombre: "Xiaomi 14",
    productoModelo: "14 Ultra",
    claveImagenProducto: null,
    equipoId: null,
    cantidad: 1,
    ubicacionOrigenId: "tienda_1",
    ubicacionOrigenNombre: "Tienda Centro",
    ubicacionDestinoId: null,
    ubicacionDestinoNombre: null,
    costoUnitario: 100,
    precioVentaUnitario: 250,
    precioVentaHistorico: true,
    nota: null,
    loteId: null,
    revertidoEn: null,
    creadoEn: "2026-09-10 18:30:00",
    ...cambios,
  };
}

const sinFiltros: FiltrosHistorial = {
  consulta: "",
  tipo: "todos",
  ubicacionId: "todas",
  desde: "",
  hasta: "",
};

describe("filtros del historial", () => {
  test("encuentra un movimiento por modelo aunque no coincida el nombre", () => {
    const resultados = filtrarMovimientos(
      [
        movimiento({ id: "mov_xiaomi", productoModelo: "Redmi Ñote 14 Pro" }),
        movimiento({
          id: "mov_samsung",
          productoNombre: "Galaxy S24",
          productoModelo: "Ultra",
        }),
      ],
      { ...sinFiltros, consulta: "note 14" },
    );

    expect(resultados.map((item) => item.id)).toEqual(["mov_xiaomi"]);
  });

  test("combina tipo, ubicación y rango de fechas inclusivo", () => {
    const resultados = filtrarMovimientos(
      [
        movimiento({ id: "mov_venta_dia", creadoEn: "2026-09-10 18:30:00" }),
        movimiento({
          id: "mov_entrada_dia",
          tipo: "purchase_in",
          creadoEn: "2026-09-10 17:00:00",
        }),
        movimiento({
          id: "mov_venta_otro_dia",
          creadoEn: "2026-09-11 18:30:00",
        }),
        movimiento({
          id: "mov_venta_otro_local",
          ubicacionOrigenId: "tienda_2",
          creadoEn: "2026-09-10 18:30:00",
        }),
      ],
      {
        ...sinFiltros,
        tipo: "sale",
        ubicacionId: "tienda_1",
        desde: "2026-09-10",
        hasta: "2026-09-10",
      },
    );

    expect(resultados.map((item) => item.id)).toEqual(["mov_venta_dia"]);
  });
});
