import {
  Building2,
  House,
  Landmark,
  Package,
  ShoppingBag,
  Store,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

const ICONOS: Record<string, LucideIcon> = {
  warehouse: Warehouse,
  store: Store,
  building: Building2,
  landmark: Landmark,
  package: Package,
  shopping_bag: ShoppingBag,
  house: House,
  truck: Truck,
}

const ICONOS_ANTIGUOS: Record<string, string> = {
  '🏭': 'warehouse',
  '🏬': 'store',
  '🏪': 'store',
  '🏢': 'building',
  '📦': 'package',
  '🛒': 'shopping_bag',
  '🏠': 'house',
  '🚚': 'truck',
}

export const OPCIONES_ICONO_UBICACION = ['warehouse', 'store', 'building', 'landmark', 'package', 'shopping_bag', 'house', 'truck'] as const

export function normalizarIconoUbicacion(icono: string | null | undefined, tipo: string): string {
  const normalizado = icono === null || icono === undefined ? undefined : ICONOS_ANTIGUOS[icono] ?? icono
  return normalizado !== undefined && ICONOS[normalizado] !== undefined ? normalizado : tipo === 'warehouse' ? 'warehouse' : 'store'
}

export function IconoUbicacion({ icono, tipo, className = 'size-5' }: { icono?: string | null; tipo: string; className?: string }) {
  const Icono = ICONOS[normalizarIconoUbicacion(icono, tipo)] ?? Store
  return <Icono aria-hidden="true" className={className} strokeWidth={1.9} />
}
