/**
 * Busqueda de productos en tres pasadas, de la mas precisa a la mas tolerante.
 *
 *   1. Codigo de barras exacto. Es lo que ocurre al escanear, y no tiene
 *      sentido puntuar nada: o es ese producto o no es.
 *   2. Indice FTS5 por prefijo, sin acentos. Cubre la mayoria de lo que se
 *      escribe a mano.
 *   3. Trigramas puntuados, solo si la pasada anterior trajo poco. Es la que
 *      salva los errores de dedo.
 *
 * Se para en cuanto una pasada da suficientes resultados. Las pasadas caras
 * solo se pagan cuando las baratas no alcanzaron.
 */

import type { ProductoConStock, ResultadoBusqueda } from '@compartido/tipos'
import { aProducto, type FilaProducto } from '../db/mapeo'
import { buscarPorCodigo, conStock } from '../db/productos'
import {
  LARGO_MINIMO_CONSULTA,
  UMBRAL_APROXIMADO,
  consultaFts5,
  generarTrigramas,
  normalizar,
  proporcionCoincidente,
} from './trigramas'

/** Debajo de esta cantidad de resultados se intenta la busqueda aproximada. */
const RESULTADOS_SUFICIENTES = 3

const COLUMNAS = `
  p.id, p.barcode, p.name, p.brand, p.model, p.category_id,
  c.name AS category_name,
  p.unit, p.cost_price, p.sale_price, p.image_key, p.min_stock, p.notes, p.is_active
`

const DESDE = 'FROM products p LEFT JOIN categories c ON c.id = p.category_id'

/**
 * Un codigo de barras de fabrica son 8 digitos o mas, todos numeros.
 *
 * Se distingue del texto para no gastar la busqueda de texto en algo que tiene
 * una respuesta exacta, y para que escanear sea instantaneo.
 */
function pareceCodigo(consulta: string): boolean {
  return /^[0-9]{8,}$/.test(consulta)
}

/**
 * Arma la expresion de prefijo para FTS5.
 *
 * Cada palabra va entrecomillada, con las comillas internas duplicadas, y
 * unida con `AND`: al escribir "cable tipo" se esperan los productos que
 * tengan ambas palabras, no los que tengan cualquiera de las dos.
 */
function consultaPrefijo(consulta: string): string {
  const palabras = normalizar(consulta)
    .split(' ')
    .filter((p) => p.length > 0)

  if (palabras.length === 0) return ''

  return palabras.map((p) => `"${p.replaceAll('"', '""')}"*`).join(' AND ')
}

async function porPrefijo(
  db: D1Database,
  consulta: string,
  limite: number,
): Promise<ProductoConStock[]> {
  const expresion = consultaPrefijo(consulta)
  if (expresion === '') return []

  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS}
       ${DESDE}
       JOIN products_fts f ON f.product_id = p.id
       WHERE products_fts MATCH ? AND p.is_active = 1
       ORDER BY rank
       LIMIT ?`,
    )
    .bind(expresion, limite)
    .all<FilaProducto>()

  return conStock(db, results.map(aProducto))
}

/**
 * Pasada tolerante a errores.
 *
 * La base solo entrega candidatos: el orden se decide aqui, por proporcion de
 * trigramas coincidentes. Ordenar con `rank` de FTS5 pondria arriba los textos
 * mas cortos, que ante "samsng" seria justo lo contrario de lo esperado.
 */
async function porAproximacion(
  db: D1Database,
  consulta: string,
  limite: number,
  yaVistos: ReadonlySet<string>,
): Promise<ProductoConStock[]> {
  const trigramas = generarTrigramas(consulta)
  if (trigramas.length === 0) return []

  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS}
       ${DESDE}
       JOIN products_trg t ON t.product_id = p.id
       WHERE products_trg MATCH ? AND p.is_active = 1
       LIMIT ?`,
    )
    // Se piden mas candidatos de los que se van a devolver porque muchos
    // caeran debajo del umbral al puntuarlos.
    .bind(consultaFts5(trigramas), limite * 5)
    .all<FilaProducto>()

  const puntuados = results
    .map(aProducto)
    .filter((p) => !yaVistos.has(p.id))
    .map((p) => ({
      producto: p,
      puntos: proporcionCoincidente(
        trigramas,
        `${p.nombre} ${p.marca ?? ''} ${p.modelo ?? ''}`,
      ),
    }))
    .filter((x) => x.puntos >= UMBRAL_APROXIMADO)
    .sort((a, b) => b.puntos - a.puntos || a.producto.nombre.localeCompare(b.producto.nombre))
    .slice(0, limite)

  return conStock(
    db,
    puntuados.map((x) => x.producto),
  )
}

/** Los mas recientes, para cuando el buscador esta vacio. */
async function recientes(db: D1Database, limite: number): Promise<ProductoConStock[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNAS} ${DESDE}
       WHERE p.is_active = 1
       ORDER BY p.updated_at DESC
       LIMIT ?`,
    )
    .bind(limite)
    .all<FilaProducto>()

  return conStock(db, results.map(aProducto))
}

export async function buscarProductos(
  db: D1Database,
  consulta: string,
  limite: number,
): Promise<ResultadoBusqueda[]> {
  const texto = consulta.trim()

  if (texto === '') {
    return (await recientes(db, limite)).map((p) => ({ ...p, coincidencia: 'texto' as const }))
  }

  if (pareceCodigo(texto)) {
    const producto = await buscarPorCodigo(db, texto)
    if (producto !== null) {
      const [conjunto] = await conStock(db, [producto])
      if (conjunto !== undefined) return [{ ...conjunto, coincidencia: 'codigo' }]
    }
    // Si el codigo no existe, se sigue con las demas pasadas: puede ser un
    // codigo escrito a medias o el numero de modelo del producto.
  }

  const exactos: ResultadoBusqueda[] = (await porPrefijo(db, texto, limite)).map((p) => ({
    ...p,
    coincidencia: 'texto' as const,
  }))

  if (exactos.length >= RESULTADOS_SUFICIENTES || texto.length < LARGO_MINIMO_CONSULTA) {
    return exactos
  }

  const aproximados: ResultadoBusqueda[] = (
    await porAproximacion(db, texto, limite - exactos.length, new Set(exactos.map((p) => p.id)))
  ).map((p) => ({ ...p, coincidencia: 'aproximado' as const }))

  return [...exactos, ...aproximados]
}
