/**
 * Busqueda tolerante a errores de escritura, sobre trigramas.
 *
 * El tokenizador `trigram` de SQLite hace coincidencia de subcadena, no
 * distancia de edicion: `MATCH 'samsng'` no encuentra "Samsung". La tolerancia
 * se consigue partiendo la consulta en trigramas aqui y buscandolos con `OR`,
 * para luego puntuar cuantos de ellos contiene cada candidato.
 *
 * Estas funciones son puras a proposito: son la parte de la busqueda que se
 * puede probar sin base de datos.
 */

/** Largo de la ventana. Debe coincidir con el tokenizador `trigram` de SQLite. */
const LARGO_TRIGRAMA = 3

/**
 * Proporcion minima de trigramas de la consulta que un producto debe contener
 * para considerarse una coincidencia aproximada. Por debajo de esto los
 * resultados dejan de parecerse a lo que se escribio.
 */
export const UMBRAL_APROXIMADO = 0.4

/** Consultas mas cortas que esto no generan ningun trigrama. */
export const LARGO_MINIMO_CONSULTA = LARGO_TRIGRAMA

/**
 * Deja el texto en la misma forma que usa el indice de SQLite.
 *
 * Debe seguir al tokenizador `trigram remove_diacritics 1`, que pasa a
 * minusculas y pliega los diacriticos, la enie incluida. Si esta funcion se
 * separara de ese comportamiento, la base devolveria candidatos que la
 * puntuacion calcularia en cero y se descartarian sin aviso.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    // Marcas diacriticas combinantes: acentos, dieresis y la tilde de la enie.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parte el texto en trigramas, palabra por palabra y sin repetir.
 *
 * Se excluyen los trigramas que cruzan un espacio. El tokenizador de SQLite si
 * los genera, pero un trigrama con un espacio dentro de comillas se interpreta
 * como frase y descuadra la consulta.
 */
export function generarTrigramas(texto: string): string[] {
  const trigramas = new Set<string>()

  for (const palabra of normalizar(texto).split(' ')) {
    if (palabra.length < LARGO_TRIGRAMA) continue
    for (let i = 0; i + LARGO_TRIGRAMA <= palabra.length; i += 1) {
      trigramas.add(palabra.slice(i, i + LARGO_TRIGRAMA))
    }
  }

  return [...trigramas]
}

/**
 * Arma la expresion `MATCH` de FTS5 que busca cualquiera de los trigramas.
 *
 * Entrecomillar cada termino y duplicar las comillas de su interior es lo que
 * evita que el texto escrito por el usuario se interprete como sintaxis de
 * FTS5. No es cosmetico: sin eso, un termino con comilla rompe la consulta.
 */
export function consultaFts5(trigramas: string[]): string {
  return trigramas.map((t) => `"${t.replaceAll('"', '""')}"`).join(' OR ')
}

/**
 * Proporcion de los trigramas de la consulta que aparecen en el texto, de 0 a 1.
 *
 * Se usa para ordenar en lugar de `bm25`, que premia los textos cortos: con
 * bm25 un "Cargador" suelto le gana a "Audifonos Samsung Galaxy Buds" ante la
 * consulta "samsng", que es justo al reves de lo esperado.
 */
export function proporcionCoincidente(trigramasConsulta: string[], texto: string): number {
  if (trigramasConsulta.length === 0) return 0

  const objetivo = normalizar(texto)
  let encontrados = 0
  for (const trigrama of trigramasConsulta) {
    if (objetivo.includes(trigrama)) encontrados += 1
  }

  return encontrados / trigramasConsulta.length
}
