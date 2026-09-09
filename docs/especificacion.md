# Inventario — Especificación funcional y técnica

Aplicación web instalable (PWA) para controlar el inventario de un almacén central y tres
sucursales. El objetivo del negocio no es solo "llevar la cuenta": es **detectar y disuadir
mermas** comparando lo que debería haber contra lo que realmente hay, sucursal por sucursal.

## 1. Contexto y problema

La dueña del negocio llevaba el inventario a mano en papel. El proceso es lento, se presta a
errores y, sobre todo, no permite saber dónde se está perdiendo mercancía. Sospecha de robo
interno pero no tiene números para sostenerlo.

Restricciones reales que definen el diseño:

- **Un solo usuario**: la dueña. No hay cuentas para los trabajadores.
- **Cuatro ubicaciones**: un almacén central y tres sucursales.
- **iPhone**, usando la app instalada desde Safari.
- **Costo cero** de operación.
- Los productos **ya traen código de barras de fábrica** (EAN/UPC). No hay que imprimir etiquetas.
- Siempre hay WiFi. La app es online-only, con una cola de reintentos únicamente para escaneos.

## 2. Objetivos

1. Registrar inventario escaneando, sin escribir a mano.
2. Saber en todo momento cuánto hay de cada producto en cada ubicación.
3. Detectar faltantes por sucursal, en piezas y en dinero.
4. Buscar cualquier producto en menos de un segundo, tolerando errores de escritura.

## 3. Fuera de alcance

Punto de venta, facturación fiscal, contabilidad, nómina, cuentas para trabajadores,
multi-empresa y compras automáticas a proveedor. Se documenta para evitar que el alcance crezca
sin decisión explícita.

## 4. Arquitectura

Un repositorio y un solo despliegue. El mismo Worker sirve la aplicación y la API, así que no
hay CORS ni dos dominios que mantener.

```
iPhone — PWA instalada
  React + Vite + TypeScript + Tailwind
  Escáner: zxing-wasm (Safari no soporta BarcodeDetector)
    |
    |  fetch  ->  /api/*
    v
Cloudflare Worker  (Hono + Zod)
  |-- D1  SQLite: catálogo, stock, movimientos, conteos
  |-- KV  fotos de productos y sucursales
  +-- Assets estáticos de la PWA
```

### Por qué este stack

Cloudflare cubre el caso completo dentro de su capa gratuita (100.000 peticiones al día, 5 GB de
base de datos, 1 GB de almacenamiento para fotos) y no suspende proyectos por inactividad, a
diferencia de otras plataformas gratuitas. Para un negocio en operación esa diferencia es decisiva.

Las fotos van en **Workers KV** y no en R2, que seria la herramienta natural para archivos. El
motivo no es técnico sino de acceso: el login OAuth de wrangler **no incluye ningún permiso de
R2**, ese scope no existe en su lista. Usar R2 exigiría un token de API aparte y un segundo
mecanismo de credenciales solo para las fotos. KV entra en `workers_kv:write`, que sí está en el
login normal, así que todo el proyecto se administra con una sola sesión.

El costo de esa decisión son los límites del plan gratuito de KV: 1 GB y 1000 escrituras al día.
Con fotos de unos 60 KB eso son unas 16.000 fotos y mil altas de producto en un mismo día. Para
este negocio sobra, y si algún día no alcanzara, el cambio a R2 toca un solo archivo.

Las fotos se redimensionan **en el teléfono** antes de subirlas (canvas a WebP de 800 px, unos
60 KB). Así se evita un servicio de imágenes de pago.

### Módulos

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `shared/` | Tipos y esquemas Zod usados por cliente y servidor | nada |
| `server/db/` | Consultas a D1. Única capa que escribe SQL | D1 |
| `server/services/` | Reglas de negocio: stock, movimientos, conteos, mermas | `server/db` |
| `server/routes/` | Endpoints HTTP, validación y autenticación | `server/services` |
| `client/api/` | Cliente tipado de la API | `shared` |
| `client/pantallas/` | Un archivo por pantalla | `client/api` |
| `client/componentes/` | Piezas compartidas entre pantallas | `client/api` |
| `client/escaner/` | Cámara y decodificación de códigos, aislado del resto | nada |

El escáner queda aislado a propósito: es la parte más dependiente del navegador y la más
probable de tener que reemplazarse.

## 5. Modelo de datos

Regla central: **el stock nunca se edita a mano, se deriva de los movimientos.** La tabla `stock`
es una materialización que se actualiza en la misma transacción que el movimiento que la causa.
Si algo falla, no queda a medias.

### `locations`

Almacén y sucursales. `id`, `name`, `type` (`warehouse` | `store`), `icon`, `image_key`,
`address`, `phone`, `is_active`, `created_at`.

### `categories`

`id`, `name`, `icon`.

### `products`

`id`, `barcode` (único), `name`, `brand`, `model`, `category_id`, `unit`, `cost_price`,
`sale_price`, `image_key`, `min_stock`, `notes`, `is_active`, `created_at`, `updated_at`.

### `stock`

`product_id`, `location_id`, `qty`. Clave primaria compuesta. Nunca negativo.

### `movements`

Bitácora inmutable. `id`, `type`, `product_id`, `qty`, `from_location_id`, `to_location_id`,
`unit_cost`, `note`, `count_session_id`, `created_at`, `created_by`.

Tipos de movimiento y su efecto:

| Tipo | Origen | Destino | Uso |
|---|---|---|---|
| `purchase_in` | — | almacén | Compra a proveedor |
| `transfer` | almacén | sucursal | Reparto |
| `sale` | sucursal | — | Venta registrada |
| `return` | — | sucursal | Devolución de cliente |
| `loss` | ubicación | — | Merma reconocida: roto, caducado |
| `adjustment` | ± | ± | Corrección manual, siempre con nota |
| `count` | ± | ± | Ajuste generado al cerrar un conteo físico |

### `count_sessions`

`id`, `location_id`, `status` (`open` | `closed`), `started_at`, `closed_at`, `note`.

### `count_items`

`count_session_id`, `product_id`, `counted_qty`, `expected_qty`, `diff`, `scanned_at`.

`expected_qty` se congela al momento del escaneo, no se recalcula después. De otro modo el
reporte de mermas cambiaría con el tiempo y perdería valor como evidencia.

### `products_fts`

Tabla virtual FTS5 sobre nombre, marca, modelo, código y categoría.

### `users`

`id`, `name`, `pin_hash`, `pin_salt`, `role`, `created_at`, `last_login_at`.

## 6. Detección de mermas

El cálculo que sostiene todo el módulo:

```
Esperado = traspasos recibidos + devoluciones − ventas registradas − mermas reconocidas
Real     = lo contado escaneando en el conteo físico
Faltante = Real − Esperado          (negativo significa mercancía perdida)
```

Esa fórmula **explica** el número, pero no es como se calcula. El "Esperado" se toma del stock
que la aplicación tenía en el instante del escaneo, que ya es el resultado acumulado de todos los
movimientos. Recorrer la fórmula por separado abriría la puerta a que sumara distinto que el
stock por olvidar un tipo de movimiento, y entonces habría dos verdades.

Ese valor se **congela** en el renglón del conteo y no se recalcula nunca: si se recalculara, el
reporte de un conteo de marzo iría cambiando con cada venta de abril y dejaría de servir como
evidencia.

Hay un segundo número que es fácil confundir con el anterior. Al cerrar el conteo ajustando el
inventario, el movimiento de ajuste se calcula contra el stock **de ese momento**, no contra el
congelado: el objetivo del ajuste es dejar el sistema igual a la realidad física de ahora. Son
dos preguntas distintas, "cuánto faltó" y "en cuánto hay que dejarlo".

El reporte presenta tres vistas:

1. **Ranking de sucursales por merma**, en piezas y en dinero al costo. Una sucursal que pierde
   4% del valor mientras las otras pierden 0,3% señala por sí sola dónde investigar.
2. **Ranking de productos más faltantes**. Suele ser lo caro y pequeño.
3. **Tendencia mensual por sucursal**. Un pico se cruza con quién estaba en turno.

El propósito es convertir una sospecha en un número verificable.

## 7. Búsqueda

Dos pasadas sobre FTS5, sin servicios de IA:

1. **Prefijo**, con el tokenizador `unicode61` y `remove_diacritics 2`. Cubre la mayoría de los
   casos e ignora acentos: "generico" encuentra "Genérico". Busca en nombre, marca, modelo,
   código y categoría, así que "audifonos" trae toda la categoría.
2. Si la primera pasada devuelve menos de tres resultados, **trigramas puntuados**.

Sobre el segundo paso hay que ser preciso, porque es fácil suponer de más: el tokenizador
`trigram` de SQLite hace coincidencia de **subcadena**, no distancia de edición. `MATCH 'samsng'`
no encuentra "Samsung" — verificado contra una D1 real. La tolerancia se consigue partiendo la
consulta en trigramas en el servidor y buscándolos con `OR`:

```
"samsng"  ->  sam, ams, msn, sng
MATCH '"sam" OR "ams" OR "msn" OR "sng"'
```

"Samsung" comparte dos de esos cuatro trigramas, suficiente para aparecer. El orden no se deja a
`bm25`, que premia los textos cortos y descoloca los resultados: se puntúa por **proporción de
trigramas de la consulta que el producto contiene**, con un mínimo del 40% para descartar
coincidencias casuales.

Un código de barras escaneado o escrito completo es una búsqueda exacta y salta ambas pasadas.

Resultados en menos de 150 ms para 10.000 productos, con debounce de 120 ms y cancelación de la
petición anterior.

## 8. Pantallas

Todas de un solo pulgar, con botones de 56 px mínimo, en español y sin jerga técnica.

1. **Acceso** — PIN de seis dígitos, sesión larga, bloqueo por inactividad.
2. **Inicio** — Selector de ubicación. Cuatro acciones grandes: Escanear, Buscar, Traspaso,
   Conteo. Debajo, alertas: stock bajo y faltantes detectados.
3. **Escanear** — Cámara a pantalla completa con detección continua. Al leer un código: vibración
   y sonido, y una hoja inferior con la foto, el stock en cada ubicación y botones grandes de
   entrada, venta y cantidad manual. Si el código no existe, ofrece crear el producto con el
   código ya cargado.
4. **Buscar** — Resultados mientras se escribe, con miniatura y stock por ubicación.
5. **Producto** — Fotos, precios, stock por ubicación e historial completo de movimientos.
6. **Traspaso** — Origen y destino, escaneo en ráfaga, confirmación única.
7. **Conteo físico** — Ubicación, escaneo de todo con barra de progreso, y al cerrar el reporte
   de diferencias queda guardado como histórico.
8. **Sucursales** — Crear, editar y desactivar, con icono o foto de la fachada.
9. **Reportes** — Mermas por sucursal, stock bajo, valor del inventario y productos sin
   movimiento en 60 días.
10. **Ajustes** — Cambio de PIN, categorías y datos del negocio.

### Detalles que deciden si la app se usa o se abandona

- **Deshacer** en cada movimiento, con un aviso de cinco segundos. Escanear rápido implica
  equivocarse; sin deshacer, la dueña deja de confiar en la herramienta.
- Vibración y sonido en cada lectura, para no tener que mirar la pantalla.
- Escaneo en ráfaga sin tocar nada entre productos.
- Cero pantallas de carga en blanco: siempre un esqueleto o el dato anterior.

## 9. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Código no encontrado | Ofrece crear el producto, con el código ya cargado |
| Sin red al registrar un movimiento | Se encola y reintenta; un indicador muestra los pendientes |
| Stock quedaría negativo | Se rechaza y se explica; se ofrece registrarlo como ajuste con nota |
| Permiso de cámara denegado | Instrucción concreta para Safari en iPhone, con opción de escribir el código |
| Sesión expirada | Vuelve al PIN y conserva la acción pendiente |
| Traspaso a medias | La transacción se revierte completa; nunca hay stock duplicado ni perdido |

Ningún error se descarta en silencio. Todo fallo de escritura se registra en el servidor.

## 10. Seguridad

PIN con PBKDF2 mediante WebCrypto, sesión en cookie `httpOnly` `Secure` `SameSite=Lax`, límite de
intentos de acceso y validación con Zod de toda entrada antes de tocar la base de datos. Los
secretos viven en variables de entorno de Cloudflare, nunca en el código. Las fotos se sirven a
través del Worker y exigen sesión: el almacenamiento no es público, así que una foto no queda
accesible por una URL adivinable.

## 11. Pruebas

- **Unitarias** (Vitest): reglas de stock y motor de búsqueda. Cada tipo de movimiento y sus
  casos de borde, incluido el rechazo de stock negativo.
- **Integración** (Vitest con `@cloudflare/vitest-pool-workers`): la API contra una D1 real
  local, verificando que las transacciones no dejen datos a medias.
- **End-to-end** (Playwright con viewport de iPhone): escanear y vender, traspaso completo, y un
  conteo que detecta un faltante.

Cobertura mínima de 80% en `server/services`, donde vive el dinero.

## 12. Fases

| Fase | Entrega |
|---|---|
| 1 | Ubicaciones, productos, escaneo, stock, entradas, ventas, traspasos y búsqueda |
| 2 | Conteo físico y reporte de mermas |
| 3 | Reportes, valorización, alertas de stock bajo y pulido de interacción |
| 4 | Opcional: acceso con Face ID, búsqueda por voz, exportar a Excel, varios usuarios |

Cada fase se entrega desplegada y funcionando, no como código a medias.
