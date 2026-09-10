# Inventario de equipos celulares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir equipos individuales por IMEI, agrupados por modelo, para una tienda de celulares.

**Architecture:** `products` conservará el modelo y el stock agregado. Una fila `devices` guardará cada teléfono y su ubicación; las mutaciones escriben dispositivo, movimiento y stock dentro de un solo `D1Database.batch()`.

**Tech Stack:** React, TypeScript, TanStack Query, Hono, Zod, Cloudflare D1 y KV.

**Spec:** `docs/superpowers/specs/2026-09-09-inventario-equipos-design.md`

## Global Constraints

- Importes en `S/`; IMEI 1/2 opcionales y globalmente únicos si existen.
- `created_at` del equipo no se puede editar.
- Modal con nombre del producto o equipo antes de guardar, desactivar, eliminar o mover.
- Eliminar se permite únicamente sin movimientos; con historial se ofrece desactivar.
- La interfaz móvil conserva controles de 44 px y no se desborda a 320 px.

### Task 1: Migración, tipos y validaciones

**Files:**
- Create: `migrations/0002_equipos_celulares.sql`
- Modify: `src/shared/tipos.ts`, `src/shared/esquemas.ts`, `src/server/db/mapeo.ts`, `src/server/api.api.test.ts`

**Interfaces:** `Equipo`, `ImagenProducto`, `Marca`, `esquemaEquipo`, `esquemaEquipoParcial` y filtros `listaBlanca`/`condicion`.

- [ ] **Step 1: Write failing uniqueness test.**

```ts
expect((await conSesion(cookie, '/api/equipos', { metodo: 'POST', cuerpo: {
  productoId, ubicacionId: almacenId, equipos: [{ imei1: '356000000000001' }],
}})).status).toBe(201)
expect((await conSesion(cookie, '/api/equipos', { metodo: 'POST', cuerpo: {
  productoId, ubicacionId: almacenId, equipos: [{ imei2: '356000000000001' }],
}})).status).toBe(409)
```

- [ ] **Step 2: Verify red.** Run `node node_modules/vitest/vitest.mjs run --project api -t "equipos por IMEI"`; expected: endpoint missing.

- [ ] **Step 3: Add minimal schema.**

```sql
CREATE TABLE devices (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT, imei1 TEXT, imei2 TEXT, whitelist_status TEXT NOT NULL DEFAULT 'not_registered' CHECK(whitelist_status IN ('registered','not_registered')), condition TEXT NOT NULL DEFAULT 'new' CHECK(condition IN ('new','used')), location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT, notes TEXT, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE UNIQUE INDEX idx_devices_imei1 ON devices(imei1) WHERE imei1 IS NOT NULL;
CREATE UNIQUE INDEX idx_devices_imei2 ON devices(imei2) WHERE imei2 IS NOT NULL;
ALTER TABLE movements ADD COLUMN device_id TEXT REFERENCES devices(id) ON DELETE RESTRICT;
ALTER TABLE locations ADD COLUMN color TEXT NOT NULL DEFAULT '#315DB8';
CREATE TABLE brands (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE TABLE product_images (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, image_key TEXT NOT NULL UNIQUE, position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 4), UNIQUE(product_id, position));
```

- [ ] **Step 4: Verify green.** Run the focused API test; expected: unique error and immutable timestamp pass.
- [ ] **Step 5: Commit.** Run `git add migrations/0002_equipos_celulares.sql src/shared src/server/db/mapeo.ts src/server/api.api.test.ts` then `git commit -m "base para equipos por imei"`.

### Task 2: API y movimientos atómicos

**Files:**
- Create: `src/server/db/equipos.ts`, `src/server/services/equipos.ts`, `src/server/routes/equipos.ts`
- Modify: `src/server/index.ts`, `src/server/services/inventario.ts`, `src/server/db/movimientos.ts`, `src/server/api.api.test.ts`

**Interfaces:** `crearEquipos`, `actualizarEquipo`, `desactivarEquipo`, `equiposDeProducto`; `POST /api/equipos`, `PATCH /api/equipos/:id`, `POST /api/equipos/:id/desactivar`, `GET /api/productos/:id/equipos`.

- [ ] **Step 1: Write failing device-entry and transfer test.**

```ts
const alta = await conSesion(cookie, '/api/equipos', { metodo: 'POST', cuerpo: {
  productoId, ubicacionId: almacenId, equipos: [{ imei1: '356000000000001' }],
}})
expect(alta.status).toBe(201)
expect((await conSesion(cookie, `/api/equipos/${equipoId}/traspaso`, { metodo: 'POST', cuerpo: { destinoId: sucursalId } })).status).toBe(201)
```

- [ ] **Step 2: Verify red.** Run `node node_modules/vitest/vitest.mjs run --project api -t "movimientos de equipo"`; expected: missing routes.
- [ ] **Step 3: Implement atomic helpers.** `crearEquipos` validates every IMEI and reference before a single batch that inserts devices, purchase movements with `device_id`, and stock deltas. Transfer, sale and loss update `location_id`/`is_active` in the same batch as the existing movement.
- [ ] **Step 4: Verify green.** Focused test passes and rejected batches leave no partial stock.
- [ ] **Step 5: Commit.** Run `git add src/server && git commit -m "movimientos para equipos"`.

### Task 3: Marcas, galería y catálogo seguro

**Files:**
- Create: `src/server/db/marcas.ts`
- Modify: `src/server/db/productos.ts`, `src/server/routes/catalogo.ts`, `src/server/routes/imagenes.ts`, `src/server/imagenes.api.test.ts`, `src/client/api/cliente.ts`

**Interfaces:** `GET /api/marcas`, `GET/POST/DELETE /api/productos/:id/imagenes`, `api.marcas()`, `api.imagenesProducto()`, `api.eliminarImagenProducto()`.

- [ ] **Step 1: Write failing gallery test.**

```ts
for (let i = 0; i < 5; i += 1) expect((await subir(cookie, `/api/imagenes/producto/${productoId}`, PNG_1X1, 'image/png')).status).toBe(201)
expect((await subir(cookie, `/api/imagenes/producto/${productoId}`, PNG_1X1, 'image/png')).status).toBe(422)
```

- [ ] **Step 2: Verify red.** Run `node node_modules/vitest/vitest.mjs run --project api src/server/imagenes.api.test.ts`; expected: sixth image accepted.
- [ ] **Step 3: Implement.** Normalize nonempty brand and persist with `INSERT OR IGNORE`; return suggestions alphabetically. Store ordered gallery records, maximum positions 0–4, and synchronize first image with `products.image_key`. Reject product deletion when movements exist and expose deactivation.
- [ ] **Step 4: Verify green.** Image/catalog tests pass.
- [ ] **Step 5: Commit.** Run `git add src/server src/client/api/cliente.ts && git commit -m "galeria y marcas de productos"`.

### Task 4: Alta y gestión móvil de equipos

**Files:**
- Create: `src/client/componentes/FormularioEquipo.tsx`, `src/client/componentes/GaleriaProducto.tsx`, `src/client/componentes/Confirmacion.tsx`, `src/client/lib/equipos.ts`, `src/client/lib/equipos.test.ts`
- Modify: `src/client/componentes/FormularioProducto.tsx`, `src/client/pantallas/Escanear.tsx`, `src/client/pantallas/Producto.tsx`, `src/client/lib/formato.ts`

**Interfaces:** `FormularioEquipo({ productoId, ubicacionId, onGuardado })`; `Confirmacion({ abierta, titulo, detalle, accion, peligro, onConfirmar, onCancelar })`.

- [ ] **Step 1: Write failing display tests.**

```ts
expect(imeiCorto('356000000000001')).toBe('…0001')
expect(dinero(1250)).toBe('S/ 1,250.00')
```

- [ ] **Step 2: Verify red.** Run `node node_modules/vitest/vitest.mjs run --project unidad src/client/lib/equipos.test.ts`; expected: helpers unavailable and old dollar format.
- [ ] **Step 3: Implement.** Form uses brand/category suggestions, camera/manual IMEI inputs, registered/not-registered and new/used chips, a multi-device queue and review confirmation naming the model. Gallery processes and uploads five images sequentially. All sensitive saves, moves, deactivation and deletion use `Confirmacion`.
- [ ] **Step 4: Verify green.** Run focused unit test and `npm run typecheck`.
- [ ] **Step 5: Commit.** Run `git add src/client && git commit -m "alta movil de equipos"`.

### Task 5: Búsqueda, vista configurable y prioridades

**Files:**
- Create: `src/client/componentes/SelectorVistaCatalogo.tsx`, `src/client/lib/preferencias_catalogo.ts`, `src/client/lib/preferencias_catalogo.test.ts`
- Modify: `src/client/pantallas/Buscar.tsx`, `src/client/componentes/FichaProducto.tsx`, `src/client/pantallas/Producto.tsx`, `src/client/pantallas/Inicio.tsx`, `src/client/pantallas/Sucursales.tsx`, `src/client/estilos.css`, `src/server/services/busqueda.ts`, `src/server/routes/catalogo.ts`, `src/server/api.api.test.ts`

**Interfaces:** `PreferenciasCatalogo = { vista: 'lista' | 'cuadricula'; columnas: 1 | 2 | 3; imagen: 'pequena' | 'mediana' | 'grande' }`; query filters `listaBlanca` and `condicion`.

- [ ] **Step 1: Write failing preference/filter test.**

```ts
expect(normalizarPreferencias({ vista: 'cuadricula', columnas: 9, imagen: 'grande' })).toEqual({ vista: 'cuadricula', columnas: 3, imagen: 'grande' })
expect((await conSesion(cookie, '/api/productos?listaBlanca=registered')).status).toBe(200)
```

- [ ] **Step 2: Verify red.** Run `node node_modules/vitest/vitest.mjs run --project unidad src/client/lib/preferencias_catalogo.test.ts`; expected: filter and preferences absent.
- [ ] **Step 3: Implement.** Search filters models using `EXISTS` active devices. Save validated list/grid, 1/2/3-column and thumbnail choices in `localStorage`, mapping only fixed classes. Move dashboard after quick actions and render four lowest local groups directly. Add editable location color, consistent SVG icons, blue action/editing, green registered, amber warning and red destructive states with text labels.
- [ ] **Step 4: Verify green.** Run API/unit tests, then `npm run typecheck`.
- [ ] **Step 5: Commit.** Run `git add src/client src/server && git commit -m "catalogo y prioridades de equipos"`.

### Task 6: Regression, mobile review and release

**Files:**
- Modify: `README.md`, `docs/especificacion.md`, API test files

- [ ] **Step 1: Add safety regression.**

```ts
test('no elimina un equipo con movimientos y permite desactivarlo', async () => {
  // Create device, record movement, expect deletion conflict and deactivation success.
})
```

- [ ] **Step 2: Verify all code.** Run `node node_modules/vitest/vitest.mjs run && npm run typecheck && npm run build`; expected: every test passes and PWA assets build.
- [ ] **Step 3: Review 320×740 and 390×844.** Inspect device entry, gallery, confirmation, grouped search and 1/2/3-column grids. Verify `document.documentElement.scrollWidth === innerWidth`, 44 px targets, S/ prices and safe-area buttons.
- [ ] **Step 4: Detect and release.** Run `C:/Users/luis-/.codex/plugins/cache/impeccable/impeccable/4.3.1/skills/impeccable/scripts/impeccable.cmd detect --json src/client/pantallas/Inicio.tsx src/client/pantallas/Buscar.tsx src/client/pantallas/Producto.tsx src/client/componentes/FormularioProducto.tsx`; expected: `[]`. Then update docs, commit `inventario de equipos celulares`, push and deploy.
