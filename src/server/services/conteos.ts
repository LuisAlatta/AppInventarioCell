/**
 * Conteos fisicos y deteccion de mermas.
 *
 * ## Dos numeros distintos que es facil confundir
 *
 * Al escanear un producto durante un conteo se congela `expected_qty`: el
 * stock que la aplicacion creia tener en ese instante. La diferencia contra lo
 * contado es la **evidencia**, y no se vuelve a calcular nunca. Si se
 * recalculara, el reporte de un conteo de marzo iria cambiando con cada venta
 * de abril y dejaria de servir para sostener una conversacion.
 *
 * Al cerrar el conteo ajustando el stock, en cambio, el movimiento se calcula
 * contra el stock **de ese momento**, no contra el congelado. El objetivo del
 * ajuste es dejar el sistema igual a la realidad fisica; usar el valor
 * congelado dejaria el stock en un numero que ya no corresponde a nada si algo
 * se movio durante el conteo.
 *
 * Son dos preguntas diferentes: "cuanto falto" y "en cuanto hay que dejarlo".
 */

import type { ReporteMerma, RenglonConteo, SesionConteo } from '@compartido/tipos'
import { ErrorApp, noEncontrado } from '../lib/errores'
import { nuevoId } from '../lib/id'
import { exigirProducto, stockEn } from '../db/productos'
import { exigirUbicacion } from '../db/ubicaciones'
import { sentenciasDeStock } from '../db/stock'

interface FilaSesion {
  id: string
  location_id: string
  location_name: string
  status: string
  started_at: string
  closed_at: string | null
  note: string | null
  contados: number
  esperados: number
}

const SELECT_SESION = `
  SELECT s.id, s.location_id, l.name AS location_name, s.status,
         s.started_at, s.closed_at, s.note,
         (SELECT COUNT(*) FROM count_items i WHERE i.count_session_id = s.id) AS contados,
         (SELECT COUNT(*) FROM stock st
           WHERE st.location_id = s.location_id AND st.qty > 0) AS esperados
  FROM count_sessions s
  JOIN locations l ON l.id = s.location_id
`

function aSesion(f: FilaSesion): SesionConteo {
  return {
    id: f.id,
    ubicacionId: f.location_id,
    ubicacionNombre: f.location_name,
    estado: f.status as SesionConteo['estado'],
    iniciadoEn: f.started_at,
    cerradoEn: f.closed_at,
    nota: f.note,
    contados: f.contados,
    esperados: f.esperados,
  }
}

export async function obtenerConteo(db: D1Database, id: string): Promise<SesionConteo | null> {
  const fila = await db.prepare(`${SELECT_SESION} WHERE s.id = ?`).bind(id).first<FilaSesion>()
  return fila === null ? null : aSesion(fila)
}

export async function exigirConteo(db: D1Database, id: string): Promise<SesionConteo> {
  const sesion = await obtenerConteo(db, id)
  if (sesion === null) throw noEncontrado('el conteo')
  return sesion
}

/** El conteo abierto de una ubicacion, si hay alguno. */
export async function conteoAbierto(
  db: D1Database,
  ubicacionId: string,
): Promise<SesionConteo | null> {
  const fila = await db
    .prepare(`${SELECT_SESION} WHERE s.location_id = ? AND s.status = 'open'`)
    .bind(ubicacionId)
    .first<FilaSesion>()

  return fila === null ? null : aSesion(fila)
}

export async function listarConteos(db: D1Database, limite = 20): Promise<SesionConteo[]> {
  const { results } = await db
    .prepare(`${SELECT_SESION} ORDER BY s.started_at DESC LIMIT ?`)
    .bind(limite)
    .all<FilaSesion>()

  return results.map(aSesion)
}

/**
 * Abre un conteo.
 *
 * El indice unico parcial de la base impide dos conteos abiertos en la misma
 * ubicacion. Aqui se comprueba antes para poder devolver el conteo que ya
 * existe en lugar de un error: quien vuelve a entrar a "Conteo" casi siempre
 * quiere continuar el que dejo a medias.
 */
export async function abrirConteo(
  db: D1Database,
  ubicacionId: string,
  nota: string | null,
  usuarioId: string,
): Promise<{ sesion: SesionConteo; yaExistia: boolean }> {
  await exigirUbicacion(db, ubicacionId)

  const abierto = await conteoAbierto(db, ubicacionId)
  if (abierto !== null) return { sesion: abierto, yaExistia: true }

  const id = nuevoId('cnt')
  await db
    .prepare('INSERT INTO count_sessions (id, location_id, note, created_by) VALUES (?, ?, ?, ?)')
    .bind(id, ubicacionId, nota, usuarioId)
    .run()

  return { sesion: await exigirConteo(db, id), yaExistia: false }
}

/**
 * Registra lo contado de un producto.
 *
 * Volver a escanear el mismo producto reemplaza la cantidad en lugar de
 * sumarla. Al contar fisicamente se cuenta un monton completo, y si el segundo
 * escaneo sumara, corregir un error obligaria a reiniciar el conteo.
 *
 * `expected_qty` y `unit_cost` se congelan en el primer registro y no se
 * vuelven a tocar.
 */
export async function registrarConteo(
  db: D1Database,
  sesionId: string,
  productoId: string,
  cantidad: number,
): Promise<RenglonConteo> {
  const sesion = await exigirConteo(db, sesionId)
  if (sesion.estado !== 'open') {
    throw new ErrorApp('conflicto', 'Ese conteo ya está cerrado')
  }

  const producto = await exigirProducto(db, productoId)
  const esperado = await stockEn(db, productoId, sesion.ubicacionId)

  await db
    .prepare(
      `INSERT INTO count_items
         (count_session_id, product_id, counted_qty, expected_qty, diff, unit_cost)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (count_session_id, product_id)
       DO UPDATE SET
         counted_qty = excluded.counted_qty,
         diff        = excluded.counted_qty - count_items.expected_qty,
         scanned_at  = datetime('now')`,
    )
    .bind(sesionId, productoId, cantidad, esperado, cantidad - esperado, producto.precioCosto)
    .run()

  const fila = await db
    .prepare(
      `SELECT counted_qty, expected_qty, diff, unit_cost
       FROM count_items WHERE count_session_id = ? AND product_id = ?`,
    )
    .bind(sesionId, productoId)
    .first<{ counted_qty: number; expected_qty: number; diff: number; unit_cost: number }>()

  if (fila === null) throw noEncontrado('el renglón del conteo')

  return {
    productoId,
    productoNombre: producto.nombre,
    codigo: producto.codigo,
    cantidadContada: fila.counted_qty,
    cantidadEsperada: fila.expected_qty,
    diferencia: fila.diff,
    costoUnitario: fila.unit_cost,
  }
}

interface FilaRenglon {
  product_id: string
  product_name: string
  barcode: string
  counted_qty: number
  expected_qty: number
  diff: number
  unit_cost: number
}

async function renglonesDe(db: D1Database, sesionId: string): Promise<RenglonConteo[]> {
  const { results } = await db
    .prepare(
      `SELECT i.product_id, p.name AS product_name, p.barcode,
              i.counted_qty, i.expected_qty, i.diff, i.unit_cost
       FROM count_items i
       JOIN products p ON p.id = i.product_id
       WHERE i.count_session_id = ?
       ORDER BY i.diff ASC, p.name`,
    )
    .bind(sesionId)
    .all<FilaRenglon>()

  return results.map((f) => ({
    productoId: f.product_id,
    productoNombre: f.product_name,
    codigo: f.barcode,
    cantidadContada: f.counted_qty,
    cantidadEsperada: f.expected_qty,
    diferencia: f.diff,
    costoUnitario: f.unit_cost,
  }))
}

/**
 * Cierra el conteo y, si se pide, deja el stock igual a lo contado.
 *
 * Todo va en un solo batch: los movimientos de ajuste, los cambios de stock y
 * el cierre de la sesion. Un cierre a medias dejaria una sesion cerrada con
 * stock sin ajustar, o al contrario, y en ambos casos el reporte mentiria.
 */
export async function cerrarConteo(
  db: D1Database,
  sesionId: string,
  ajustarStock: boolean,
  nota: string | null,
  usuarioId: string,
): Promise<ReporteMerma> {
  const sesion = await exigirConteo(db, sesionId)
  if (sesion.estado !== 'open') {
    throw new ErrorApp('conflicto', 'Ese conteo ya está cerrado')
  }

  const renglones = await renglonesDe(db, sesionId)
  const sentencias: D1PreparedStatement[] = []

  if (ajustarStock) {
    for (const renglon of renglones) {
      // Contra el stock actual, no contra el congelado: el ajuste debe dejar
      // el sistema igual a la realidad fisica de ahora.
      const actual = await stockEn(db, renglon.productoId, sesion.ubicacionId)
      const delta = renglon.cantidadContada - actual
      if (delta === 0) continue

      const suma = delta > 0
      sentencias.push(
        db
          .prepare(
            `INSERT INTO movements
               (id, type, product_id, qty, from_location_id, to_location_id,
                unit_cost, note, count_session_id, created_by)
             VALUES (?, 'count', ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            nuevoId('mov'),
            renglon.productoId,
            Math.abs(delta),
            suma ? null : sesion.ubicacionId,
            suma ? sesion.ubicacionId : null,
            renglon.costoUnitario,
            `Conteo físico en ${sesion.ubicacionNombre}`,
            sesionId,
            usuarioId,
          ),
      )

      sentencias.push(...sentenciasDeStock(db, renglon.productoId, sesion.ubicacionId, delta))
    }
  }

  sentencias.push(
    db
      .prepare(
        `UPDATE count_sessions
         SET status = 'closed', closed_at = datetime('now'), note = COALESCE(?, note)
         WHERE id = ?`,
      )
      .bind(nota, sesionId),
  )

  await db.batch(sentencias)

  return reporteDeConteo(db, sesionId)
}

/** Cancela un conteo sin tocar el stock. */
export async function cancelarConteo(db: D1Database, sesionId: string): Promise<void> {
  const sesion = await exigirConteo(db, sesionId)
  if (sesion.estado !== 'open') {
    throw new ErrorApp('conflicto', 'Ese conteo ya está cerrado')
  }

  await db
    .prepare(`UPDATE count_sessions SET status = 'cancelled', closed_at = datetime('now') WHERE id = ?`)
    .bind(sesionId)
    .run()
}

/**
 * Reporte de un conteo: piezas y dinero faltantes, y el porcentaje sobre el
 * valor esperado.
 *
 * El porcentaje se calcula sobre el valor que **deberia** haber, no sobre lo
 * contado. Sobre lo contado, una sucursal que pierde casi todo daria un
 * porcentaje pequeno justo cuando el problema es mayor.
 */
export async function reporteDeConteo(db: D1Database, sesionId: string): Promise<ReporteMerma> {
  const sesion = await exigirConteo(db, sesionId)
  const renglones = await renglonesDe(db, sesionId)

  let piezasFaltantes = 0
  let dineroFaltante = 0
  let piezasSobrantes = 0
  let valorEsperado = 0

  for (const r of renglones) {
    valorEsperado += r.cantidadEsperada * r.costoUnitario
    if (r.diferencia < 0) {
      piezasFaltantes += -r.diferencia
      dineroFaltante += -r.diferencia * r.costoUnitario
    } else if (r.diferencia > 0) {
      piezasSobrantes += r.diferencia
    }
  }

  const redondear = (n: number): number => Math.round(n * 100) / 100

  return {
    sesionId,
    ubicacionId: sesion.ubicacionId,
    ubicacionNombre: sesion.ubicacionNombre,
    cerradoEn: sesion.cerradoEn,
    piezasFaltantes,
    dineroFaltante: redondear(dineroFaltante),
    piezasSobrantes,
    valorEsperado: redondear(valorEsperado),
    porcentajeMerma: valorEsperado === 0 ? 0 : redondear((dineroFaltante / valorEsperado) * 100),
    // Los renglones vienen ordenados por diferencia ascendente, asi que lo que
    // mas falta queda arriba sin que la interfaz tenga que reordenar.
    renglones,
  }
}

/**
 * Ranking de mermas por ubicacion sobre los conteos cerrados.
 *
 * Es la vista que responde la pregunta del negocio: donde se esta perdiendo
 * mercancia. Una sucursal con 4% frente a otras con 0,3% senala por si sola
 * donde mirar.
 */
export async function mermasPorUbicacion(
  db: D1Database,
  meses = 6,
): Promise<
  {
    ubicacionId: string
    ubicacionNombre: string
    conteos: number
    piezasFaltantes: number
    dineroFaltante: number
    valorEsperado: number
    porcentajeMerma: number
  }[]
> {
  const { results } = await db
    .prepare(
      `SELECT l.id AS ubicacionId, l.name AS ubicacionNombre,
              COUNT(DISTINCT s.id) AS conteos,
              COALESCE(SUM(CASE WHEN i.diff < 0 THEN -i.diff ELSE 0 END), 0) AS piezasFaltantes,
              COALESCE(SUM(CASE WHEN i.diff < 0 THEN -i.diff * i.unit_cost ELSE 0 END), 0) AS dineroFaltante,
              COALESCE(SUM(i.expected_qty * i.unit_cost), 0) AS valorEsperado
       FROM count_sessions s
       JOIN locations l ON l.id = s.location_id
       LEFT JOIN count_items i ON i.count_session_id = s.id
       WHERE s.status = 'closed' AND s.closed_at >= datetime('now', ?)
       GROUP BY l.id, l.name
       ORDER BY dineroFaltante DESC`,
    )
    .bind(`-${meses} months`)
    .all<{
      ubicacionId: string
      ubicacionNombre: string
      conteos: number
      piezasFaltantes: number
      dineroFaltante: number
      valorEsperado: number
    }>()

  return results.map((r) => ({
    ...r,
    dineroFaltante: Math.round(r.dineroFaltante * 100) / 100,
    valorEsperado: Math.round(r.valorEsperado * 100) / 100,
    porcentajeMerma:
      r.valorEsperado === 0 ? 0 : Math.round((r.dineroFaltante / r.valorEsperado) * 10000) / 100,
  }))
}

/** Los productos que mas se pierden, sumando todos los conteos cerrados. */
export async function productosMasFaltantes(
  db: D1Database,
  meses = 6,
  limite = 20,
): Promise<
  { productoId: string; productoNombre: string; piezas: number; dinero: number }[]
> {
  const { results } = await db
    .prepare(
      `SELECT i.product_id AS productoId, p.name AS productoNombre,
              SUM(-i.diff) AS piezas,
              SUM(-i.diff * i.unit_cost) AS dinero
       FROM count_items i
       JOIN count_sessions s ON s.id = i.count_session_id
       JOIN products p ON p.id = i.product_id
       WHERE s.status = 'closed' AND s.closed_at >= datetime('now', ?) AND i.diff < 0
       GROUP BY i.product_id, p.name
       ORDER BY dinero DESC
       LIMIT ?`,
    )
    .bind(`-${meses} months`, limite)
    .all<{ productoId: string; productoNombre: string; piezas: number; dinero: number }>()

  return results.map((r) => ({ ...r, dinero: Math.round(r.dinero * 100) / 100 }))
}
