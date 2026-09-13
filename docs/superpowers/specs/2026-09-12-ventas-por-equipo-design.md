# Ventas y precios por equipo

## Objetivo

Convertir el inventario en una aplicación exclusiva para celulares, donde cada
unidad física identificada por IMEI tiene su propio costo y precio de venta.
Registrar ventas con valores históricos exactos, ofrecer un reporte de ventas,
y mejorar la consulta del historial de movimientos.

## Alcance

- Cada equipo tiene `precio de compra` y `precio de venta` independientes.
- El último precio guardado en un equipo se propone al registrar el siguiente
  equipo del mismo modelo, sin cambiar unidades ya existentes.
- Una venta puede modificar ambos precios por equipo antes de confirmarse.
- Se conserva una venta inmutable con equipo, IMEI, modelo, precios, sucursal y
  fecha.
- Inicio muestra solo tres movimientos y enlaza a un historial completo.
- La nueva pantalla Ventas combina el reporte del período con la lista de
  ventas por fecha.
- Los IMEI pueden capturarse manualmente, con cámara en vivo o desde una foto
  tomada o escogida desde la galería.
- Un modelo sin stock activo puede eliminarse del catálogo visible conservando
  todo su historial.

## Modelo de datos

### Equipos

La tabla `devices` incorporará `cost_price` y `sale_price`, ambos numéricos no
negativos. Los equipos existentes recibirán, durante la migración, los precios
del producto al que pertenecen. Los campos de precio del producto se conservarán
temporalmente para compatibilidad, pero no determinarán el precio de nuevos
equipos ni de ventas.

La sugerencia del siguiente equipo de un modelo se obtiene del equipo más
recientemente creado o actualizado de ese modelo. No se necesita una tabla de
precios separada: el origen de la sugerencia es trazable y coincide con el
último dato confirmado por la persona usuaria.

### Ventas

Se creará una tabla `sales` con una fila por celular vendido. Tendrá:

- identificador de la venta;
- identificador del movimiento y del equipo;
- nombre del modelo e IMEI copiados al confirmar la venta;
- costo y precio de venta finales copiados al confirmar;
- sucursal, fecha, nota y estado de reversión.

Guardar copias evita que una modificación posterior del modelo, equipo,
ubicación o IMEI altere los reportes históricos. Una venta de varios teléfonos
crea varias filas, una por equipo, y cada una conserva sus propios precios.

Al deshacer una venta, se marca como revertida tanto el movimiento como la fila
de venta; no se borra nada. Los totales excluyen ventas revertidas.

### Eliminación de modelos

Eliminar un modelo significa retirarlo del catálogo operativo mediante
`is_active = 0`. Está permitido únicamente si la suma de stock de todas las
ubicaciones es cero y no hay equipos activos. La ficha, los IMEI vendidos,
movimientos y ventas permanecen disponibles en el histórico. Esto protege la
auditoría y permite presentar la acción como «Eliminar modelo» sin perder datos
financieros.

## API

- El alta y edición de equipos aceptan y devuelven `precioCosto` y
  `precioVenta`.
- La consulta de sugerencia devuelve los últimos importes usados por el modelo.
- La venta de celulares recibe una lista de equipos con precios finales; el
  servidor valida que cada uno pertenezca al modelo, esté activo y esté en la
  sucursal indicada. En una única transacción crea movimientos, ventas, baja
  equipos y descuenta stock.
- `GET /movimientos` acepta límite, fechas, tipo y sucursal; devuelve datos
  suficientes para mostrar IMEI y precios cuando correspondan.
- `GET /ventas` acepta rango de fechas y sucursal; devuelve totales de ingresos,
  costo, ganancia y piezas, más la lista ordenada de más reciente a más antigua.

Las ventas existentes no tienen precio final histórico. Seguirán visibles como
movimientos, señaladas como «sin precio de venta histórico», y no aportarán a
los totales de ingresos o ganancia.

## Experiencia de usuario

### Alta y ficha de equipo

Cada fila de alta de un equipo muestra IMEI 1 e IMEI 2 en controles separados y
apilados verticalmente: cada campo ocupa todo el ancho disponible para poder
leer y corregir el número completo. Debajo van estado de lista blanca,
condición, costo y precio de venta. Los precios se inician desde la sugerencia
del modelo y siempre se pueden editar. La ficha del modelo lista sus equipos
con sus precios individuales, costo, precio de venta y margen.

Cada campo IMEI ofrece ingreso manual, cámara en vivo y «leer desde foto». La
opción de foto abre cámara o galería, procesa la imagen localmente, extrae el
código de barras y normaliza sus dígitos. El resultado se muestra en el campo
para que sea comprobado antes de guardar. Si no hay lectura válida, el equipo
no se guarda y se ofrece ingresar el IMEI manualmente.

### Venta

Después de seleccionar los IMEI, la venta muestra una fila por equipo con su
costo, precio de venta y margen. Se puede cambiar costo y venta en cada fila
antes de confirmar. Confirmar actualiza los valores del equipo, registra los
valores copiados en `sales` y crea el movimiento correspondiente. No se admite
una venta sin IMEI.

### Movimientos

Inicio renderiza los tres movimientos más recientes y un enlace «Ver todo el
historial». La nueva pantalla de historial permite filtrar por rango de fechas,
tipo y sucursal. Para cada evento se muestran fecha/hora, modelo, IMEI si lo
tiene, cantidades, origen/destino, costo, precio de venta, nota y estado de
reversión.

### Ventas y reporte

La navegación principal tendrá la pestaña Ventas. La pantalla presenta filtros
de período y sucursal, tarjetas de ingresos, costo, ganancia y celulares
vendidos, y una lista de ventas que contiene modelo, IMEI, costo, precio final,
ganancia, sucursal y fecha. Esta pantalla cubre tanto el apartado operativo de
ventas como el reporte solicitado.

## Reglas y errores

- El costo y el precio de venta deben ser importes no negativos, con hasta dos
  decimales.
- Cada IMEI es único. Un código leído de foto debe normalizarse a un IMEI de 14
  a 17 dígitos antes de aceptarse.
- Un equipo vendido, perdido o inactivo no puede volver a venderse.
- Los equipos seleccionados deben coincidir con el modelo y la ubicación de la
  venta.
- No se permite eliminar un modelo con stock total positivo o equipos activos.
- Una imagen sin código legible o con un dato no válido conserva el formulario y
  presenta una explicación; nunca crea un equipo parcialmente registrado.

## Pruebas y verificación

- Migración: los equipos existentes conservan como valores iniciales los
  precios anteriores del modelo.
- Servicio de ventas: una venta con uno o varios IMEI crea datos por equipo,
  descuenta stock y persiste precios independientes.
- Reversión: la venta y sus totales quedan excluidos después de deshacerla.
- Reporte: los filtros de fecha y sucursal calculan ingresos, costo, ganancia y
  cantidad solo sobre ventas vigentes.
- Catálogo: eliminar queda bloqueado mientras exista stock y retira del catálogo
  un modelo agotado sin borrar su historial.
- Cliente: los formularios muestran sugerencias, permiten editar precios y
  muestran los tres últimos movimientos con navegación al histórico.
- Lector desde foto: normaliza el resultado correcto y rechaza imágenes sin un
  IMEI válido.

## Fuera de alcance

- Clientes, comprobantes, impuestos, descuentos, pagos parciales o facturación.
- Precios por unidad en inventarios no celulares.
- Corrección automática de ventas históricas que no registraron precio final.
