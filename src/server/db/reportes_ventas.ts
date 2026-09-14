/**
 * Agregaciones de ventas calculadas sobre el movimiento que conserva sus
 * importes definitivos. No se usa el precio vigente del catálogo: hacerlo
 * alteraría el pasado cada vez que se actualiza un producto.
 */

import type { AgrupacionVentas, ReporteVentas } from '@compartido/tipos'

const fuenteVentas = `
  FROM movements m
  JOIN products p ON p.id = m.product_id
  JOIN locations l ON l.id = m.from_location_id
  WHERE m.type = 'sale'
    AND m.reverted_at IS NULL
    AND m.unit_sale_price IS NOT NULL
    AND m.created_at >= datetime('now', ?)
`

const redondear = (valor: number): number => Math.round(valor * 100) / 100

type FilaResumen = {
  unidades: number
  ventas: number
  costo: number
  ganancia: number
  operaciones: number
}

type FilaDesglose = {
  unidades: number
  ventas: number
  costo: number
  ganancia: number
}

export async function reporteVentas(
  db: D1Database,
  agrupacion: AgrupacionVentas,
  dias: number,
): Promise<ReporteVentas> {
  const desde = `-${dias} days`
  // America/Lima mantiene UTC-5; el día y la semana son los del negocio.
  const periodo = agrupacion === 'dia'
    ? "date(m.created_at, '-5 hours')"
    : "date(m.created_at, '-5 hours', '-6 days', 'weekday 1')"

  const [resumenFila, periodosResultado, productosResultado, ubicacionesResultado] = await Promise.all([
    db.prepare(
      `SELECT COALESCE(SUM(m.qty), 0) AS unidades,
              COALESCE(SUM(m.qty * m.unit_sale_price), 0) AS ventas,
              COALESCE(SUM(m.qty * m.unit_cost), 0) AS costo,
              COALESCE(SUM(m.qty * (m.unit_sale_price - m.unit_cost)), 0) AS ganancia,
              COUNT(*) AS operaciones
       ${fuenteVentas}`,
    ).bind(desde).first<FilaResumen>(),
    db.prepare(
      `SELECT ${periodo} AS inicio,
              COALESCE(SUM(m.qty), 0) AS unidades,
              COALESCE(SUM(m.qty * m.unit_sale_price), 0) AS ventas,
              COALESCE(SUM(m.qty * m.unit_cost), 0) AS costo,
              COALESCE(SUM(m.qty * (m.unit_sale_price - m.unit_cost)), 0) AS ganancia
       ${fuenteVentas}
       GROUP BY inicio
       ORDER BY inicio ASC`,
    ).bind(desde).all<FilaDesglose & { inicio: string }>(),
    db.prepare(
      `SELECT p.id AS productoId, p.name AS productoNombre,
              COALESCE(SUM(m.qty), 0) AS unidades,
              COALESCE(SUM(m.qty * m.unit_sale_price), 0) AS ventas,
              COALESCE(SUM(m.qty * m.unit_cost), 0) AS costo,
              COALESCE(SUM(m.qty * (m.unit_sale_price - m.unit_cost)), 0) AS ganancia
       ${fuenteVentas}
       GROUP BY p.id, p.name
       ORDER BY ganancia DESC, productoNombre ASC`,
    ).bind(desde).all<FilaDesglose & { productoId: string; productoNombre: string }>(),
    db.prepare(
      `SELECT l.id AS ubicacionId, l.name AS ubicacionNombre,
              COALESCE(SUM(m.qty), 0) AS unidades,
              COALESCE(SUM(m.qty * m.unit_sale_price), 0) AS ventas,
              COALESCE(SUM(m.qty * m.unit_cost), 0) AS costo,
              COALESCE(SUM(m.qty * (m.unit_sale_price - m.unit_cost)), 0) AS ganancia
       ${fuenteVentas}
       GROUP BY l.id, l.name
       ORDER BY ganancia DESC, ubicacionNombre ASC`,
    ).bind(desde).all<FilaDesglose & { ubicacionId: string; ubicacionNombre: string }>(),
  ])

  const importes = <T extends FilaDesglose>(fila: T): T => ({
    ...fila,
    ventas: redondear(fila.ventas),
    costo: redondear(fila.costo),
    ganancia: redondear(fila.ganancia),
  })
  const resumen = resumenFila ?? { unidades: 0, ventas: 0, costo: 0, ganancia: 0, operaciones: 0 }

  return {
    agrupacion,
    dias,
    resumen: importes(resumen),
    periodos: periodosResultado.results.map((fila) => ({ ...importes(fila), etiqueta: fila.inicio })),
    productos: productosResultado.results.map(importes),
    ubicaciones: ubicacionesResultado.results.map(importes),
  }
}
