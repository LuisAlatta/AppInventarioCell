# Ventas y ganancias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar ventas con costo real y precio final, consultar ganancias por día o semana y vender únicamente inventario disponible desde una pantalla móvil de Ventas.

**Architecture:** Se mantendrá `movements` como la fuente de verdad: una venta guarda el costo y precio final que se usaron en ella, y el nuevo reporte agrega exclusivamente ventas no revertidas. Un repositorio de consulta en servidor entrega un contrato tipado para la pantalla `Ventas`; la interfaz consume ese contrato, encuentra productos disponibles o un IMEI preciso y registra la salida usando las reglas de stock y equipos ya existentes.

**Tech Stack:** React 19, TypeScript, TanStack Query, React Router, Tailwind CSS, Hono, Zod, Cloudflare D1, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-ventas-y-ganancias-design.md`

## Global Constraints

- La pantalla debe ser táctil, legible y completa en un teléfono, sin cambiar la navegación inferior de cinco acciones.
- Buscar solo muestra productos activos con stock disponible; los movimientos, equipos vendidos y reportes conservan el historial completo.
- `costoUnitario` y `precioVentaUnitario` son importes no negativos con máximo 9,999,999 y dos decimales.
- El servidor conserva los valores de catálogo cuando una venta antigua u otro flujo no envía los dos importes nuevos.
- La ganancia bruta es `(precio final - costo real) × cantidad` y solo suma movimientos `sale` no revertidos con precio final congelado.
- Un IMEI inactivo puede mostrarse como vendido, pero nunca vuelve a ser elegible para una salida.
- No se agrega una migración: `movements.unit_cost` y `movements.unit_sale_price` ya existen en D1.
- Cada cambio significativo se confirma y publica con un commit breve en español, sin referencias a IA.

---

## File structure

- Modify: `src/shared/esquemas.ts` — acepta y normaliza costo y precio final en `esquemaVenta`; valida los parámetros de consulta del reporte.
- Modify: `src/shared/tipos.ts` — contrato compartido de `ReporteVentas` y sus filas de período, producto y ubicación.
- Create: `src/server/db/reportes_ventas.ts` — una única consulta de lectura que calcula resumen, serie y desgloses a partir de ventas congeladas no revertidas.
- Modify: `src/server/routes/movimientos.ts` — persiste el costo real y precio final recibidos, incluso para equipos IMEI.
- Modify: `src/server/routes/catalogo.ts` — expone `GET /reportes/ventas` junto a los demás reportes de catálogo.
- Modify: `src/server/db/equipos.ts` and `src/server/routes/equipos.ts` — busca un IMEI exacto, activo o vendido, y devuelve su producto/equipo para que la venta por IMEI sea inequívoca.
- Modify: `src/client/api/cliente.ts` — tipa la venta extendida, el reporte y la búsqueda de IMEI.
- Modify: `src/client/pantallas/Buscar.tsx` — usa `filtro: 'disponibles'` en la búsqueda operativa normal.
- Modify: `src/client/pantallas/Inicio.tsx` — incorpora el acceso Ventas en la fila de acciones diarias y conserva el acceso al historial completo.
- Modify: `src/client/App.tsx` — registra la ruta `/ventas`.
- Create: `src/client/pantallas/Ventas.tsx` — pantalla de consulta, formulario de venta y reporte de ganancias.
- Create: `src/client/lib/ventas.ts` and `src/client/lib/ventas.test.ts` — funciones puras de interfaz para convertir importes, decidir estado de un IMEI y formatear la ganancia sin lógica duplicada en JSX.
- Modify: `src/server/api.api.test.ts` — pruebas de contrato y de regresión del flujo API completo.

## Task 1: Contratos de importes definitivos y salida de inventario

**Files:**
- Modify: `src/shared/esquemas.ts:116-128`
- Modify: `src/client/api/cliente.ts:244-252`
- Modify: `src/server/routes/movimientos.ts:76-118`
- Test: `src/server/api.api.test.ts`

**Interfaces:**
- Consumes: `dinero`, `esquemaVenta`, `aplicarMovimiento()` y `aplicarSalidaDeEquipos()` ya existentes.
- Produces: `DatosVenta` con `costoUnitario?: number` y `precioVentaUnitario?: number`; `api.venta()` acepta los mismos campos y ambos tipos de venta congelan los importes enviados.

- [ ] **Step 1: Escribir la prueba API que falla para precio final y costo reales.**

  En `src/server/api.api.test.ts`, dentro del bloque de movimientos, crear una venta de la mercancía de `escenario(cookie)` con `costoUnitario: 125.5` y `precioVentaUnitario: 310.25`. Comprobar la respuesta y leer `/api/movimientos`:

  ```ts
  const venta = await conSesion(cookie, '/api/movimientos/venta', {
    method: 'POST',
    body: JSON.stringify({
      productoId: datos.producto.id,
      ubicacionId: datos.almacen.id,
      cantidad: 1,
      costoUnitario: 125.5,
      precioVentaUnitario: 310.25,
    }),
  })
  expect(venta.status).toBe(201)
  const movimiento = (await json<{ movimiento: Movimiento }>(venta)).movimiento
  expect(movimiento.costoUnitario).toBe(125.5)
  expect(movimiento.precioVentaUnitario).toBe(310.25)
  ```

  Repetir la venta con un `equipoIds: [equipo.id]` de un equipo activo y comprobar que cada movimiento de esa rama conserva los mismos dos importes.

- [ ] **Step 2: Ejecutar la prueba nueva y confirmar el fallo.**

  Run: `npm test -- src/server/api.api.test.ts`

  Expected: FAIL porque la ruta actual ignora los dos campos y usa `producto.precioCosto` y `producto.precioVenta`.

- [ ] **Step 3: Extender el esquema y cliente sin cambiar el comportamiento compatible.**

  Modificar el objeto de `esquemaVenta` y la firma de `api.venta`:

  ```ts
  export const esquemaVenta = z.object({
    productoId: id,
    ubicacionId: id,
    cantidad: cantidadPositiva,
    costoUnitario: dinero.optional(),
    precioVentaUnitario: dinero.optional(),
    equipoIds: z.array(id).min(1).max(500).optional(),
    nota: nota.nullish(),
  }).refine((datos) => datos.equipoIds === undefined || datos.equipoIds.length === datos.cantidad, {
    message: 'La cantidad debe coincidir con los equipos elegidos',
    path: ['cantidad'],
  })
  ```

  ```ts
  venta: (datos: {
    productoId: string
    ubicacionId: string
    cantidad: number
    costoUnitario?: number
    precioVentaUnitario?: number
    equipoIds?: string[]
    nota?: string | null
  }) => pedir('/movimientos/venta', { metodo: 'POST', cuerpo: datos })
  ```

- [ ] **Step 4: Usar los valores validados en las dos ramas de `/venta`.**

  Después de obtener el producto, calcular una vez los valores definitivos y pasarlos tanto a `aplicarSalidaDeEquipos` como a `aplicarMovimiento`:

  ```ts
  const costoUnitario = datos.costoUnitario ?? producto.precioCosto
  const precioVentaUnitario = datos.precioVentaUnitario ?? producto.precioVenta
  ```

  Los objetos de movimiento deben usar esas variables exactas, no volver a consultar ni tomar los precios desde el producto. Dejar intactas las comprobaciones de stock e IMEI de `aplicarMovimiento` y `aplicarSalidaDeEquipos`.

- [ ] **Step 5: Añadir los dos rechazos de validación y ejecutar la prueba.**

  En la misma prueba API, enviar `costoUnitario: -1` y `precioVentaUnitario: 10_000_000`; comprobar HTTP 400 y que el stock no cambió. Ejecutar:

  Run: `npm test -- src/server/api.api.test.ts`

  Expected: PASS, incluyendo venta normal, venta IMEI y validación de importes.

- [ ] **Step 6: Confirmar el contrato aislado.**

  ```bash
  git add src/shared/esquemas.ts src/client/api/cliente.ts src/server/routes/movimientos.ts src/server/api.api.test.ts
  git commit -m "guarda importes de venta"
  ```

## Task 2: Reporte de ventas y ganancias calculado en servidor

**Files:**
- Modify: `src/shared/esquemas.ts`
- Modify: `src/shared/tipos.ts:165-205`
- Create: `src/server/db/reportes_ventas.ts`
- Modify: `src/server/routes/catalogo.ts:202-216`
- Modify: `src/client/api/cliente.ts:347-354`
- Test: `src/server/api.api.test.ts`

**Interfaces:**
- Consumes: columnas `movements.type`, `unit_cost`, `unit_sale_price`, `quantity`, `created_at`, `reverted_at`, `products.name` y `locations.name`.
- Produces:

  ```ts
  export type AgrupacionVentas = 'dia' | 'semana'
  export interface ReporteVentas {
    agrupacion: AgrupacionVentas
    dias: number
    resumen: { unidades: number; ventas: number; costo: number; ganancia: number; operaciones: number }
    periodos: { inicio: string; etiqueta: string; unidades: number; ventas: number; costo: number; ganancia: number }[]
    productos: { productoId: string; productoNombre: string; unidades: number; ventas: number; costo: number; ganancia: number }[]
    ubicaciones: { ubicacionId: string; ubicacionNombre: string; unidades: number; ventas: number; costo: number; ganancia: number }[]
  }
  ```

  `reporteVentas(db, agrupacion, dias): Promise<ReporteVentas>` y `api.reporteVentas(agrupacion, dias)`.

- [ ] **Step 1: Definir el test de ganancias antes de crear la consulta.**

  En `src/server/api.api.test.ts`, registrar tres ventas dentro del escenario: dos con los pares `(100, 250)` y `(120, 300)`, y una tercera que se deshace con `POST /api/movimientos/:id/deshacer`. Consultar `GET /api/reportes/ventas?agrupacion=dia&dias=30` y comprobar:

  ```ts
  expect(reporte.resumen.unidades).toBe(2)
  expect(reporte.resumen.ventas).toBe(550)
  expect(reporte.resumen.costo).toBe(220)
  expect(reporte.resumen.ganancia).toBe(330)
  expect(reporte.productos[0]).toMatchObject({
    productoId: datos.producto.id,
    unidades: 2,
    ventas: 550,
    costo: 220,
    ganancia: 330,
  })
  ```

  Consultar además `agrupacion=semana` y verificar que los totales no cambian y que cada período empieza un lunes ISO usando `date(created_at, '-6 days', 'weekday 1')`.

- [ ] **Step 2: Ejecutar el test y confirmar que la ruta no existe.**

  Run: `npm test -- src/server/api.api.test.ts`

  Expected: FAIL con 404 para `/api/reportes/ventas`.

- [ ] **Step 3: Declarar los tipos y parámetros compartidos.**

  Añadir `AgrupacionVentas` y `ReporteVentas` a `src/shared/tipos.ts`. En `src/shared/esquemas.ts`, crear:

  ```ts
  export const esquemaReporteVentas = z.object({
    agrupacion: z.enum(['dia', 'semana']).default('dia'),
    dias: z.coerce.number().int().min(1).max(365).default(30),
  })
  ```

  Importar `ReporteVentas` en el cliente y agregar `api.reporteVentas(agrupacion: AgrupacionVentas = 'dia', dias = 30)` construyendo los parámetros con `URLSearchParams`.

- [ ] **Step 4: Implementar un repositorio de reporte sin mezclar la lógica con la ruta.**

  Crear `src/server/db/reportes_ventas.ts`. Definir una fuente común que excluya ventas sin precio histórico y ventas revertidas:

  ```sql
  FROM movements m
  JOIN products p ON p.id = m.product_id
  JOIN locations l ON l.id = m.origin_location_id
  WHERE m.type = 'sale'
    AND m.reverted_at IS NULL
    AND m.unit_sale_price IS NOT NULL
    AND m.created_at >= datetime('now', ?)
  ```

  Usar `?` ligado a `-${dias} days`. Para cada fila calcular `m.quantity * m.unit_sale_price AS ventas`, `m.quantity * m.unit_cost AS costo` y la diferencia como `ganancia`. Emitir tres consultas de agregación: resumen, productos y ubicaciones. Para la serie usar una expresión fija por agrupación:

  ```ts
  const periodo = agrupacion === 'dia'
    ? "date(m.created_at)"
    : "date(m.created_at, '-6 days', 'weekday 1')"
  ```

  Ordenar períodos por `inicio ASC`, productos por `ganancia DESC, productoNombre ASC` y ubicaciones por `ganancia DESC, ubicacionNombre ASC`. Redondear cada suma a dos decimales al mapear la fila, usando `Math.round(valor * 100) / 100`.

- [ ] **Step 5: Exponer la ruta protegida con el validador compartido.**

  En `src/server/routes/catalogo.ts`, importar `esquemaReporteVentas` y `reporteVentas`, y añadir junto a los otros reportes:

  ```ts
  rutasCatalogo.get('/reportes/ventas', zValidator('query', esquemaReporteVentas), async (c) => {
    const { agrupacion, dias } = c.req.valid('query')
    return c.json(await reporteVentas(c.env.DB, agrupacion, dias))
  })
  ```

- [ ] **Step 6: Cubrir el límite de datos históricos incompletos.**

  En el test API, después de registrar una venta completa, actualizar solamente esa fila de prueba mediante D1 y dejar `unit_sale_price` nulo:

  ```ts
  await env.DB.prepare('UPDATE movements SET unit_sale_price = NULL WHERE id = ?')
    .bind(movimiento.id)
    .run()
  ```

  Consultar de nuevo el reporte y verificar que no cambia ni `resumen.ganancia` ni los importes de ningún desglose. Ejecutar:

  Run: `npm test -- src/server/api.api.test.ts`

  Expected: PASS para agrupación día/semana, ventas revertidas y filas históricas sin importe definitivo.

- [ ] **Step 7: Confirmar el reporte.**

  ```bash
  git add src/shared/esquemas.ts src/shared/tipos.ts src/server/db/reportes_ventas.ts src/server/routes/catalogo.ts src/client/api/cliente.ts src/server/api.api.test.ts
  git commit -m "agrega reporte de ganancias"
  ```

## Task 3: Búsqueda disponible y búsqueda exacta de IMEI

**Files:**
- Modify: `src/client/pantallas/Buscar.tsx:39-42`
- Modify: `src/server/db/equipos.ts`
- Modify: `src/server/routes/equipos.ts`
- Modify: `src/client/api/cliente.ts`
- Test: `src/server/api.api.test.ts`

**Interfaces:**
- Consumes: `condicionStock(..., { filtro: 'disponibles' })`, tabla `device_imeis` y `Equipo.activo`.
- Produces: `api.buscarEquipoPorImei(imei: string): Promise<{ equipo: Equipo | null }>` backed by `GET /equipos/imei/:imei`; Buscar normal never passes `filtro: 'todos'`.

- [ ] **Step 1: Escribir las regresiones de inventario agotado y de IMEI vendido.**

  En `src/server/api.api.test.ts`, vender la última unidad del producto y comprobar que `GET /api/productos?q=Audifonos&filtro=disponibles` devuelve `productos: []`, mientras `GET /api/movimientos` todavía contiene la venta. Crear un equipo, venderlo y comprobar:

  ```ts
  const encontrado = await conSesion(cookie, `/api/equipos/imei/${equipo.imei1}`)
  expect(encontrado.status).toBe(200)
  expect((await json<{ equipo: Equipo | null }>(encontrado)).equipo).toMatchObject({
    id: equipo.id,
    activo: false,
  })
  ```

- [ ] **Step 2: Ejecutar las regresiones y observar la falta de ruta IMEI.**

  Run: `npm test -- src/server/api.api.test.ts`

  Expected: FAIL para la ruta de IMEI; el producto agotado ya debe poder filtrarse por la infraestructura existente.

- [ ] **Step 3: Añadir la consulta por IMEI exacto en el repositorio de equipos.**

  En `src/server/db/equipos.ts`, exportar una función que mantiene el mismo mapeo `aEquipo`:

  ```ts
  export async function buscarEquipoPorImei(db: D1Database, imei: string): Promise<Equipo | null> {
    const fila = await db.prepare(`SELECT ${COLUMNAS} ${DESDE}
      WHERE di.imei = ? ${AGRUPACION}`).bind(imei).first<FilaEquipo>()
    return fila === null ? null : aEquipo(fila)
  }
  ```

  No filtrar `d.is_active`: la pantalla debe conocer y explicar que una unidad ya se vendió.

- [ ] **Step 4: Exponer y tipar la búsqueda de unidad física.**

  En `src/server/routes/equipos.ts`, agregar antes de `/producto/:productoId`:

  ```ts
  rutasEquipos.get('/imei/:imei', async (c) =>
    c.json({ equipo: await buscarEquipoPorImei(c.env.DB, c.req.param('imei')) }),
  )
  ```

  En `src/client/api/cliente.ts`, añadir `buscarEquipoPorImei` con `encodeURIComponent(imei)` y respuesta `{ equipo: Equipo | null }`.

- [ ] **Step 5: Hacer que Buscar muestre únicamente existencia disponible.**

  Reemplazar la constante de `src/client/pantallas/Buscar.tsx`:

  ```ts
  const filtroStock = vendidos ? 'todos' : 'disponibles'
  ```

  Mantener el modo Vendidos: se usa para historial de equipos y debe poder encontrar IMEI inactivos. Actualizar el comentario para que describa que los artículos agotados no se muestran en la búsqueda operativa, pero no se eliminan.

- [ ] **Step 6: Ejecutar las regresiones y la comprobación de tipos.**

  Run: `npm test -- src/server/api.api.test.ts && npm run typecheck`

  Expected: PASS; Buscar normal excluye stock cero, el historial existe y una unidad IMEI vendida se entrega como `activo: false`.

- [ ] **Step 7: Confirmar la búsqueda.**

  ```bash
  git add src/client/pantallas/Buscar.tsx src/server/db/equipos.ts src/server/routes/equipos.ts src/client/api/cliente.ts src/server/api.api.test.ts
  git commit -m "filtra stock y busca imei"
  ```

## Task 4: Utilidades puras de la pantalla Ventas

**Files:**
- Create: `src/client/lib/ventas.ts`
- Create: `src/client/lib/ventas.test.ts`

**Interfaces:**
- Consumes: valores numéricos de formulario y `Equipo`.
- Produces:

  ```ts
  export function importeDesdeCampo(valor: string): number | null
  export function gananciaDeVenta(costoUnitario: number, precioVentaUnitario: number, cantidad: number): number
  export function estadoEquipoVenta(equipo: Equipo | null): 'disponible' | 'vendido' | 'no_encontrado'
  ```

- [ ] **Step 1: Escribir las pruebas de importes y estados.**

  Crear `src/client/lib/ventas.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { estadoEquipoVenta, gananciaDeVenta, importeDesdeCampo } from './ventas'

  describe('importeDesdeCampo', () => {
    it('normaliza una cifra válida a dos decimales', () => expect(importeDesdeCampo(' 310.256 ')).toBe(310.26))
    it('rechaza vacíos, negativos y cifras mayores al límite', () => {
      expect(importeDesdeCampo('')).toBeNull()
      expect(importeDesdeCampo('-1')).toBeNull()
      expect(importeDesdeCampo('10000000')).toBeNull()
    })
  })
  it('calcula la ganancia de varias piezas', () => expect(gananciaDeVenta(125.5, 310.25, 2)).toBe(369.5))
  ```

  Añadir fixtures mínimos de `Equipo` activo e inactivo para esperar `disponible` y `vendido`; `null` debe ser `no_encontrado`.

- [ ] **Step 2: Ejecutar la prueba y confirmar que falla por módulos inexistentes.**

  Run: `npm test -- src/client/lib/ventas.test.ts`

  Expected: FAIL con resolución de `./ventas`.

- [ ] **Step 3: Implementar conversiones sin permitir importes ambiguos.**

  Crear `src/client/lib/ventas.ts`:

  ```ts
  export function importeDesdeCampo(valor: string): number | null {
    if (valor.trim() === '') return null
    const numero = Number(valor.replace(',', '.'))
    if (!Number.isFinite(numero) || numero < 0 || numero > 9_999_999) return null
    return Math.round(numero * 100) / 100
  }

  export function gananciaDeVenta(costoUnitario: number, precioVentaUnitario: number, cantidad: number): number {
    return Math.round((precioVentaUnitario - costoUnitario) * cantidad * 100) / 100
  }

  export function estadoEquipoVenta(equipo: Equipo | null): 'disponible' | 'vendido' | 'no_encontrado' {
    if (equipo === null) return 'no_encontrado'
    return equipo.activo ? 'disponible' : 'vendido'
  }
  ```

  Importar explícitamente `Equipo` como tipo compartido.

- [ ] **Step 4: Ejecutar utilidades y confirmar el commit.**

  Run: `npm test -- src/client/lib/ventas.test.ts && npm run typecheck`

  Expected: PASS.

  ```bash
  git add src/client/lib/ventas.ts src/client/lib/ventas.test.ts
  git commit -m "prepara utilidades de ventas"
  ```

## Task 5: Pantalla Ventas, formulario de salida y reporte móvil

**Files:**
- Create: `src/client/pantallas/Ventas.tsx`
- Modify: `src/client/App.tsx:20-31,143-156`
- Modify: `src/client/pantallas/Inicio.tsx:47-65`
- Test: `src/client/lib/ventas.test.ts`

**Interfaces:**
- Consumes: `api.buscar(q, signal, { ubicacionId, filtro: 'disponibles' })`, `api.buscarEquipoPorImei`, `api.venta`, `api.reporteVentas`, `importeDesdeCampo`, `gananciaDeVenta`, `estadoEquipoVenta`, `Boton`, `CampoNota`, `SelectorCantidad`, `Miniatura`, `Marco` y el contexto de ubicación.
- Produces: ruta autenticada `/ventas`; desde Inicio se puede abrir con un toque; un envío exitoso invalida `inicio`, `buscar`, `producto`, `movimientos` y `reporte-ventas`.

- [ ] **Step 1: Crear primero el esqueleto accesible de la pantalla.**

  Crear `Ventas.tsx` con `Marco titulo="Ventas" atras` y tres secciones en este orden: resumen de ganancias, buscador de artículo y formulario de registro. Usar `useUbicacion()` para fijar la ubicación activa, y si `activa === null` mostrar `ErrorEnPantalla` con el mensaje `"Crea una ubicación antes de registrar una venta."` sin mostrar un botón de envío.

  La cabecera de reporte usa controles con semántica de radio:

  ```tsx
  <fieldset aria-label="Agrupar reporte de ventas">
    <legend className="sr-only">Agrupar reporte de ventas</legend>
    {(['dia', 'semana'] as const).map((valor) => (
      <button type="button" aria-pressed={agrupacion === valor} onClick={() => setAgrupacion(valor)}>
        {valor === 'dia' ? 'Por día' : 'Por semana'}
      </button>
    ))}
  </fieldset>
  ```

- [ ] **Step 2: Conectar reporte y mostrar sus cuatro cifras principales.**

  Usar `useQuery({ queryKey: ['reporte-ventas', agrupacion, dias], queryFn: () => api.reporteVentas(agrupacion, dias) })`, con botones de período `7`, `30` y `90` días. Mostrar `ventas`, `costo`, `ganancia` y `unidades` usando `dinero()` y `numero()`. Bajo el resumen, renderizar:

  - serie `periodos` con fecha `etiqueta`, ventas y ganancia;
  - tabla/lista “Por producto” con nombre, unidades y ganancia;
  - tabla/lista “Por ubicación” con nombre, unidades y ganancia.

  Cuando una lista esté vacía, mostrar `Vacio` con `"Todavía no hay ventas con precio final en este período."`; no calcular ni inventar totales en cliente.

- [ ] **Step 3: Implementar búsqueda por texto, código y modelo.**

  Controlar `texto`, aplicar 120 ms de espera como `Buscar.tsx`, y ejecutar:

  ```ts
  api.buscar(consulta, signal, {
    ubicacionId: activa?.id,
    filtro: 'disponibles',
  })
  ```

  El placeholder debe ser `"Código, nombre, modelo o IMEI"`. Presentar resultados con `Miniatura`, nombre, modelo, stock en la ubicación y botón `Vender`. Al elegir el producto, inicializar `costoTexto` con `producto.precioCosto.toFixed(2)`, `precioTexto` con `producto.precioVenta.toFixed(2)`, `cantidad` en 1 y borrar cualquier equipo elegido.

- [ ] **Step 4: Resolver IMEI exacto sin dejar una venta doble.**

  Cuando el texto contiene solo de 14 a 17 dígitos, ejecutar además `api.buscarEquipoPorImei(consulta)`. Mostrar antes de los resultados de producto:

  - Si el estado es `disponible`, una tarjeta `"IMEI encontrado"` que selecciona su producto, fija cantidad 1, equipo id y ubicación del equipo. Si está en otra ubicación, mostrar su ubicación y no ofrecer vender desde la ubicación activa.
  - Si el estado es `vendido`, una tarjeta de alerta `"Este IMEI ya fue vendido y no se puede registrar otra vez."` sin botón de venta.
  - Si el estado es `no_encontrado`, dejar que continúe la búsqueda normal de texto/código.

  La acción de guardar debe enviar `equipoIds: [equipoElegido.id]` solo si se eligió una unidad activa y debe usar `equipoElegido.ubicacionId`; de ese modo la regla del servidor sigue siendo la autoridad ante una carrera o intento repetido.

- [ ] **Step 5: Implementar formulario de venta con importes visibles y editables.**

  Después de elegir un producto, presentar `SelectorCantidad` para productos sin IMEI, dos `<input type="text" inputMode="decimal">` con etiquetas `"Costo de compra real"` y `"Precio final de venta"`, y una vista previa:

  ```tsx
  <p role="status">
    Ganancia bruta: <strong>{dinero(gananciaDeVenta(costo, precio, cantidad))}</strong>
  </p>
  ```

  Al guardar, usar `importeDesdeCampo` en ambos campos. Si cualquiera devuelve `null`, escribir debajo del campo `"Ingresa un importe entre 0 y 9,999,999."` y no llamar a la API. Si son válidos, llamar exactamente:

  ```ts
  api.venta({
    productoId: producto.id,
    ubicacionId: ubicacionVenta.id,
    cantidad: equipoElegido === null ? cantidad : 1,
    costoUnitario: costo,
    precioVentaUnitario: precio,
    ...(equipoElegido === null ? {} : { equipoIds: [equipoElegido.id] }),
  })
  ```

  Deshabilitar guardar mientras se envía y hasta que el producto elegido tenga stock en `ubicacionVenta`. Mostrar el error de API con `useAvisos().error`, conservar los campos al fallar y, al éxito, mostrar un aviso de venta, limpiar la selección e invalidar las cinco claves de consulta indicadas en la interfaz.

- [ ] **Step 6: Conectar Inicio y enrutamiento sin alterar el acceso al historial.**

  En `App.tsx`, importar `Ventas` y añadir `<Route path="/ventas" element={<Ventas />} />`. En `Inicio.tsx`, cambiar solo el bloque bajo Registrar a tres columnas y añadir el botón Ventas entre Buscar y Traspaso:

  ```tsx
  <section className="grid grid-cols-3 gap-2.5">
    <div className="col-span-3">
      <BotonAccion tono="accion" icono={<IconoEscanear />} titulo="Registrar" detalle={activa === null ? undefined : `Registrar en ${activa.nombre}`} onClick={() => navegar('/escanear')} />
    </div>
    <BotonAccion icono={<IconoBuscar />} titulo="Buscar" onClick={() => navegar('/buscar')} />
    <BotonAccion icono={<IconoVentas />} titulo="Ventas" onClick={() => navegar('/ventas')} />
    <BotonAccion icono={<IconoTraspaso />} titulo="Traspaso" onClick={() => navegar('/traspaso')} />
  </section>
  ```

  Crear `IconoVentas` local con un icono SVG de etiqueta/moneda coherente con los demás iconos. Mantener el botón `Ver todos` sobre los últimos tres movimientos y su destino `/movimientos`.

- [ ] **Step 7: Ejecutar las comprobaciones de cliente y verificación manual móvil.**

  Run: `npm test -- src/client/lib/ventas.test.ts && npm run typecheck && npm run build`

  Expected: PASS.

  En el preview, verificar en un ancho de 375 px: la fila de Inicio tiene Buscar, Ventas y Traspaso sin corte; una venta permite sobrescribir ambos importes; el resumen cambia después de vender; un IMEI vendido queda informativo sin botón; Buscar ya no lista el producto agotado; Historial aún muestra la venta y conserva `Ver todos`.

- [ ] **Step 8: Confirmar la interfaz.**

  ```bash
  git add src/client/pantallas/Ventas.tsx src/client/App.tsx src/client/pantallas/Inicio.tsx src/client/lib/ventas.ts src/client/lib/ventas.test.ts
  git commit -m "agrega pantalla de ventas"
  ```

## Task 6: Verificación final, revisión y publicación

**Files:**
- Verify: cambios de Tasks 1-5

**Interfaces:**
- Consumes: build de Vite, suite Vitest, D1 existente sin migraciones y configuración de Wrangler.
- Produces: una versión publicada que ofrece la ruta de ventas y conserva compatibilidad con datos ya existentes.

- [ ] **Step 1: Ejecutar toda la suite y el compilador.**

  Run: `npm test && npm run typecheck && npm run build`

  Expected: todos los tests pasan, TypeScript no reporta errores y Vite genera `dist/inventario`.

- [ ] **Step 2: Revisar el diff centrado en regresiones de dominio.**

  Run: `git diff HEAD~5..HEAD -- src/shared/esquemas.ts src/shared/tipos.ts src/server/db/reportes_ventas.ts src/server/routes/movimientos.ts src/server/routes/catalogo.ts src/server/db/equipos.ts src/server/routes/equipos.ts src/client/api/cliente.ts src/client/pantallas/Buscar.tsx src/client/pantallas/Inicio.tsx src/client/pantallas/Ventas.tsx`

  Confirmar que cada venta usa los mismos valores en ambas ramas (normal/IMEI), que `reverted_at IS NULL` está presente en las tres agregaciones, que las ventas sin `unit_sale_price` no entran a la ganancia y que no se eliminó ningún producto agotado.

- [ ] **Step 3: Confirmar la cuenta de despliegue antes de publicar.**

  Run: `npx wrangler whoami`

  Expected: cuenta `newluisalattago@gmail.com` y account id `0acfa25b5f619f94d581b8cf882e2eec`. Si no coincide, detener la publicación y reportarlo.

- [ ] **Step 4: Desplegar sin ejecutar migraciones.**

  Run: `npm run deploy`

  Expected: Worker `inventario` publicado. No ejecutar `npm run db:migrar`: este cambio reutiliza columnas ya aplicadas.

- [ ] **Step 5: Verificar la API publicada y la instalación.**

  Con una sesión de prueba, abrir `https://inventario.luisalatta.workers.dev/ventas`, registrar una venta de prueba con costo y precio diferentes, consultar `/api/reportes/ventas?agrupacion=dia&dias=30` y verificar que la ganancia coincide con la vista previa. En iPhone, cerrar y abrir la PWA; si conserva recursos anteriores, limpiar los datos del sitio para `inventario.luisalatta.workers.dev` desde Safari y volver a instalarla, sin borrar datos de D1.

- [ ] **Step 6: Publicar los commits y comprobar el árbol final.**

  Run: `git status --short && git push origin main`

  Expected: no quedan archivos funcionales sin confirmar y la rama `main` se publica con commits breves en español.
