/** Une los criterios que deben coincidir en el índice de productos. */
export function construirConsultaBusqueda(
  modelo: string,
  ram: string,
  almacenamiento: string,
  color: string,
): string {
  return [modelo, ram, almacenamiento, color]
    .map((criterio) => criterio.trim())
    .filter(Boolean)
    .join(' ')
}
