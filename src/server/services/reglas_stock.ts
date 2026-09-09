/**
 * Reglas de stock: que le hace cada movimiento al inventario.
 *
 * Es logica pura, sin base de datos, por dos razones. Se puede probar caso por
 * caso, y deja un unico lugar donde vive la respuesta a "cuanto suma y cuanto
 * resta esto". Si cada endpoint calculara sus propios deltas, bastaria un
 * signo invertido en uno de ellos para inventar mercancia.
 *
 * Las mismas reglas estan repetidas como CHECK en el esquema de la base. La
 * duplicacion es a proposito: la base es la ultima defensa si algun dia se
 * escribe un movimiento por otro camino.
 */

import type { TipoMovimiento } from '@compartido/tipos'

/** Un movimiento antes de guardarse, ya con origen y destino resueltos. */
export interface MovimientoNuevo {
  tipo: TipoMovimiento
  productoId: string
  /** Siempre positiva. El sentido lo da la combinacion de origen y destino. */
  cantidad: number
  ubicacionOrigenId: string | null
  ubicacionDestinoId: string | null
  costoUnitario: number
  nota: string | null
  loteId?: string | null
  sesionConteoId?: string | null
}

/** Cuanto cambia el stock de un producto en una ubicacion. */
export interface EfectoStock {
  ubicacionId: string
  delta: number
}

/** Violacion de una regla de negocio. La capa HTTP la traduce a un 422. */
export class ErrorRegla extends Error {
  override readonly name = 'ErrorRegla'

  constructor(mensaje: string) {
    super(mensaje)
  }
}

/** Tipos que exigen nota: los que pueden crear o destruir stock sin causa fisica. */
const EXIGEN_NOTA: ReadonlySet<TipoMovimiento> = new Set(['loss', 'adjustment'])

/**
 * Comprueba que el movimiento tenga la forma que su tipo exige.
 *
 * Lanza en lugar de devolver un booleano para que ninguna ruta pueda seguir
 * adelante ignorando el resultado por descuido.
 */
export function validarForma(m: MovimientoNuevo): void {
  if (!Number.isInteger(m.cantidad)) {
    throw new ErrorRegla('La cantidad debe ser un numero entero de piezas')
  }
  if (m.cantidad <= 0) {
    throw new ErrorRegla('La cantidad debe ser mayor que cero')
  }
  if (m.costoUnitario < 0) {
    throw new ErrorRegla('El costo no puede ser negativo')
  }

  const tieneOrigen = m.ubicacionOrigenId !== null
  const tieneDestino = m.ubicacionDestinoId !== null

  switch (m.tipo) {
    case 'purchase_in':
    case 'return': {
      if (!tieneDestino) throw new ErrorRegla('Falta la ubicacion de entrada')
      if (tieneOrigen) throw new ErrorRegla('Una entrada no puede tener ubicacion de origen')
      break
    }

    case 'sale':
    case 'loss': {
      if (!tieneOrigen) throw new ErrorRegla('Falta la ubicacion de donde sale')
      if (tieneDestino) throw new ErrorRegla('Una salida no puede tener ubicacion de destino')
      break
    }

    case 'transfer': {
      if (!tieneOrigen || !tieneDestino) {
        throw new ErrorRegla('Un traspaso necesita ubicacion de origen y de destino')
      }
      if (m.ubicacionOrigenId === m.ubicacionDestinoId) {
        throw new ErrorRegla('El origen y el destino no pueden ser la misma ubicacion')
      }
      break
    }

    case 'adjustment':
    case 'count': {
      if (tieneOrigen === tieneDestino) {
        throw new ErrorRegla('Un ajuste va contra una sola ubicacion')
      }
      break
    }
  }

  if (EXIGEN_NOTA.has(m.tipo) && (m.nota === null || m.nota.trim().length === 0)) {
    throw new ErrorRegla('Escribe el motivo')
  }
}

/**
 * Traduce un movimiento a los cambios de stock que provoca.
 *
 * Valida la forma primero: calcular el efecto de un movimiento mal armado
 * daria un resultado silenciosamente incorrecto.
 */
export function efectoDeMovimiento(m: MovimientoNuevo): EfectoStock[] {
  validarForma(m)

  const efectos: EfectoStock[] = []
  if (m.ubicacionOrigenId !== null) {
    efectos.push({ ubicacionId: m.ubicacionOrigenId, delta: -m.cantidad })
  }
  if (m.ubicacionDestinoId !== null) {
    efectos.push({ ubicacionId: m.ubicacionDestinoId, delta: m.cantidad })
  }

  return efectos
}

/**
 * Arma un ajuste a partir de una cantidad con signo.
 *
 * La interfaz pide "+4" o "-4" porque es como lo piensa quien corrige un
 * numero; la base guarda cantidades positivas y el sentido en origen/destino.
 * Esta funcion es la unica traduccion entre ambas formas.
 */
export function movimientoDeAjuste(
  productoId: string,
  ubicacionId: string,
  cantidadConSigno: number,
  nota: string,
): MovimientoNuevo {
  if (!Number.isInteger(cantidadConSigno) || cantidadConSigno === 0) {
    throw new ErrorRegla('El ajuste debe ser un numero entero distinto de cero')
  }

  const suma = cantidadConSigno > 0

  return {
    tipo: 'adjustment',
    productoId,
    cantidad: Math.abs(cantidadConSigno),
    ubicacionOrigenId: suma ? null : ubicacionId,
    ubicacionDestinoId: suma ? ubicacionId : null,
    costoUnitario: 0,
    nota,
  }
}

/**
 * Con que tipo se registra la reversion de cada movimiento.
 *
 * No basta con intercambiar origen y destino conservando el tipo: el inverso
 * de una venta quedaria como una venta sin ubicacion de origen, que es una
 * forma invalida.
 *
 * Casi todo se revierte como `adjustment`, no como su opuesto natural. Deshacer
 * una venta mal capturada no es una devolucion de cliente: si se guardara como
 * `return`, el reporte contaria una devolucion que nunca ocurrio. El traspaso
 * es la excepcion, porque devolver la mercancia a su origen si es un traspaso
 * real.
 */
const TIPO_DE_REVERSION: Readonly<Record<TipoMovimiento, TipoMovimiento>> = {
  purchase_in: 'adjustment',
  return: 'adjustment',
  sale: 'adjustment',
  loss: 'adjustment',
  adjustment: 'adjustment',
  transfer: 'transfer',
  count: 'count',
}

/**
 * Construye el movimiento contrario, para deshacer.
 *
 * Un movimiento no se borra nunca: se marca revertido y se guarda su opuesto.
 * Borrarlo dejaria el historial mintiendo sobre lo que paso, y el historial es
 * justamente la evidencia que sostiene el reporte de mermas.
 *
 * Conserva el costo unitario para que la valorizacion del inventario no se
 * descuadre al deshacer una compra.
 */
export function movimientoInverso(m: MovimientoNuevo): MovimientoNuevo {
  validarForma(m)

  return {
    ...m,
    tipo: TIPO_DE_REVERSION[m.tipo],
    ubicacionOrigenId: m.ubicacionDestinoId,
    ubicacionDestinoId: m.ubicacionOrigenId,
    nota: m.nota === null ? 'Reversion' : `Reversion: ${m.nota}`,
  }
}
