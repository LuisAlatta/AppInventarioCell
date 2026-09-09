/**
 * Escritura del stock.
 *
 * ## Por que hacen falta dos sentencias y no un upsert
 *
 * La forma obvia seria un solo upsert:
 *
 *     INSERT INTO stock (product_id, location_id, qty) VALUES (?, ?, delta)
 *     ON CONFLICT (product_id, location_id)
 *     DO UPDATE SET qty = qty + excluded.qty
 *
 * No funciona con deltas negativos. SQLite evalua las restricciones CHECK
 * sobre la **fila candidata del INSERT** antes de resolver el `ON CONFLICT`,
 * asi que un delta de -3 viola `CHECK (qty >= 0)` aunque ya existieran 10
 * piezas y el resultado final fuera 7. Verificado contra una D1 real: la
 * comprobacion previa veia 10 y la escritura fallaba igual.
 *
 * La solucion son dos sentencias que van juntas en el mismo batch:
 *
 *   1. Asegurar que la fila exista con cantidad 0. La fila candidata es 0, que
 *      pasa el CHECK sin problema.
 *   2. Aplicar el delta con un UPDATE. Aqui el CHECK si mide el valor final,
 *      que es justo lo que debe vigilar.
 *
 * Si no habia fila y el delta es negativo, el UPDATE deja un negativo, el
 * CHECK lo rechaza y el batch entero se revierte. Es el comportamiento
 * correcto: no se puede sacar lo que nunca entro.
 */

/**
 * Sentencias que suman un delta al stock de un producto en una ubicacion.
 *
 * Devuelve varias a proposito: quien las use tiene que meterlas todas en el
 * mismo `batch()` que el movimiento que las causa.
 */
export function sentenciasDeStock(
  db: D1Database,
  productoId: string,
  ubicacionId: string,
  delta: number,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO stock (product_id, location_id, qty)
         VALUES (?, ?, 0)
         ON CONFLICT (product_id, location_id) DO NOTHING`,
      )
      .bind(productoId, ubicacionId),

    db
      .prepare(
        `UPDATE stock
         SET qty = qty + ?, updated_at = datetime('now')
         WHERE product_id = ? AND location_id = ?`,
      )
      .bind(delta, productoId, ubicacionId),
  ]
}
