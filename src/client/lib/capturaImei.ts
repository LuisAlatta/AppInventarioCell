export type FuenteCaptura = 'camara' | 'galeria'

/** Decide cuál de los dos flujos puede abrirse tras elegir el origen de la foto. */
export function destinoCapturaDeImagen<T extends string>(
  campo: T,
  fuente: FuenteCaptura,
): { campoCamara: T | null; campoGaleria: T | null } {
  return fuente === 'camara'
    ? { campoCamara: campo, campoGaleria: null }
    : { campoCamara: null, campoGaleria: campo }
}
