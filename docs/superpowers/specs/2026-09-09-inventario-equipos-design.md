# Inventario de equipos celulares

## Objetivo

Convertir el inventario actual, orientado a cantidades, en una herramienta para una tienda de celulares que conserve cada equipo individual, sin perder la vista agrupada por modelo ni los movimientos existentes.

La experiencia debe seguir siendo rápida en teléfono: escanear un código, identificar el modelo, registrar las unidades y saber qué hay en cada tienda con pocos toques.

## Alcance

- Mover el resumen de inventario debajo de las acciones rápidas del inicio.
- Mostrar allí los modelos con menor stock de la ubicación activa, con acceso directo a su detalle o reposición.
- Agrupar el catálogo por modelo y mostrar los equipos individuales dentro de cada grupo.
- Registrar equipos por código de barras, manualmente o con cámara; cada equipo puede tener IMEI 1 e IMEI 2 opcionales.
- Guardar por equipo: ubicación, estado de lista blanca, condición (nuevo o segunda mano), fecha y hora exactas de alta, notas y su historial.
- Permitir hasta cinco imágenes por modelo, con una imagen principal.
- Reutilizar marcas y categorías ya registradas.
- Personalizar almacén principal y tres tiendas: nombre, icono y color.
- Añadir administración de catálogo, filtros y vistas configurables.

Los precios se presentan y se introducen en soles peruanos (S/).

## Modelo de datos

`products` continuará siendo el modelo agrupador: por ejemplo, “iPhone 15 Pro 256 GB”. Conserva código de barras, marca, categoría, precio, mínimo, descripción y estado activo.

Se añadirá `devices`, una fila por equipo físico:

- `id`, `product_id`, `imei1`, `imei2`
- `whitelist_status`: `registered` o `not_registered`
- `condition`: `new` o `used`
- `location_id` actual
- `created_at`: fecha y hora de alta, inmutable
- `notes`, `is_active`, `deactivated_at`

Los IMEI son opcionales para permitir una alta inicial rápida. Cuando existan, cada IMEI será único en toda la base; el segundo IMEI también se validará contra ambos campos para impedir duplicados.

Se añadirán `brands` y `product_images`. Una marca nueva se guarda al registrar un modelo y queda disponible como sugerencia en el siguiente alta. `product_images` guarda hasta cinco claves de imagen y el orden; la primera es la principal. Las imágenes se mantienen en KV bajo claves del producto.

Las ubicaciones recibirán un color elegido por el usuario. La instalación conserva las ubicaciones existentes y garantiza una ubicación marcada como almacén principal y hasta tres tiendas editables; no borra datos de las ubicaciones actuales.

## Movimientos y consistencia

Los movimientos existentes seguirán siendo la fuente de verdad del stock agregado. Cada entrada, traslado, venta, devolución o ajuste de un equipo identificado añadirá una referencia opcional al dispositivo en el movimiento y actualizará su ubicación o estado dentro de la misma transacción.

El sistema rechazará vender, trasladar o desactivar un equipo que no esté activo o no se encuentre en la ubicación elegida. El stock del modelo seguirá reflejando el total de sus unidades, tanto identificadas como las unidades genéricas ya existentes.

Los datos ya registrados no se modifican: los productos actuales continúan como inventario agregado y pueden pasar a tener equipos identificados desde ese momento.

## Flujos móviles

### Alta de un modelo y sus equipos

1. El usuario escanea el código de barras del modelo o lo escribe.
2. Si el modelo existe, puede añadir unidades; si no existe, crea el modelo.
3. El formulario muestra marca y categoría con sugerencias reutilizables y opción de crear una nueva.
4. Se añaden uno o varios equipos. Cada ficha tiene IMEI 1, IMEI 2, lista blanca, condición, ubicación y nota opcional.
5. Antes de guardar, una pantalla de revisión muestra el modelo, las unidades y el destino. Al confirmar, cada equipo queda con su fecha y hora exactas de alta.

El escáner de cámara y la digitación estarán disponibles tanto para el código de barras como para los IMEI.

### Catálogo, búsqueda y detalle

La búsqueda presenta modelos agrupados. Al abrir uno, se ven las unidades individuales con sus IMEI, condición, estado de lista blanca, ubicación y fecha de alta. Los filtros rápidos incluyen:

- lista blanca registrada / no registrada;
- nuevo / segunda mano;
- disponible, agotado y stock bajo;
- ubicación activa.

La pantalla admite lista o cuadrícula. La preferencia del usuario se guarda en el dispositivo e incluye una, dos o tres columnas y miniaturas pequeñas, medianas o grandes. En móvil, los controles no bajan de 44 px y las cuadrículas conservan texto legible.

### Edición, desactivación y eliminación

El usuario puede editar modelo, equipo, notas, imágenes, precio, marca, categoría y ubicación. Antes de cada guardado sensible o cambio de estado se presenta un modal que siempre nombra el modelo o equipo afectado.

Ejemplos: “¿Guardar cambios en iPhone 15 Pro · IMEI …1234?” y “¿Desactivar iPhone 15 Pro · IMEI …1234?”.

Para un equipo o modelo con historial, el modal ofrece:

1. **Desactivar y conservar historial**, la opción recomendada.
2. **Eliminar definitivamente**, visible pero deshabilitada con una explicación cuando rompería la trazabilidad.

Un registro sin movimientos puede eliminarse definitivamente tras una confirmación final. Todos los modales incluyen Cancelar y describen el resultado antes de actuar.

## Interfaz visual

La paleta mantiene el papel cálido actual y asigna color por significado:

- azul: navegación, edición y acciones generales;
- verde: entradas, equipos registrados en lista blanca y confirmaciones correctas;
- ámbar: equipo pendiente, stock bajo y advertencias;
- rojo: faltantes, desactivación y eliminación.

Los iconos son SVG de trazo consistente y con etiquetas accesibles: cámara para escanear, teléfono para equipos, escudo para lista blanca, etiqueta para condición, edificio para ubicación, imágenes para galería y cuadrícula/lista para la vista. El color complementa al texto, nunca es la única señal.

## Errores y validaciones

- Se informa el campo exacto si un IMEI está repetido, es inválido o se intenta registrar más de cinco imágenes.
- Los cambios de stock y de ubicación se validan en servidor, no solo en la pantalla.
- Las operaciones de imagen muestran progreso y conservan las fotos existentes si una carga falla.
- Si la conexión se recupera durante una edición, el borrador permanece visible hasta que el usuario lo guarde o cancele.

## Pruebas y verificación

- Migraciones y API: unicidad de ambos IMEI, límite de imágenes, transacciones de movimiento por dispositivo, restricciones de ubicación y borrado seguro.
- Lógica de interfaz: agrupación, filtros combinados, preferencias de cuadrícula y reglas de confirmación.
- Flujos de navegador: alta por cámara y digitación, edición, desactivación, intento de eliminación con historial, traspaso y venta.
- Revisión visual a 320 px y 390 px: sin desplazamiento horizontal, objetivos táctiles de al menos 44 px, textos largos, modales y áreas seguras de iPhone.
