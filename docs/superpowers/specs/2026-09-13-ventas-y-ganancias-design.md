# Ventas y ganancias

## Objetivo

Concentrar la consulta, el registro de ventas y la lectura de ganancias en una
pantalla móvil llamada **Ventas**, sin perder la trazabilidad del inventario.
Los productos agotados dejan de aparecer en la búsqueda operativa, pero su
historial se conserva.

## Flujo de usuario

1. Inicio añade el botón **Ventas** junto a Buscar y Traspaso.
2. Ventas permite encontrar mercancía disponible por código, nombre, modelo o
   IMEI. Una coincidencia de IMEI identifica la unidad física exacta.
3. Al elegir un producto o equipo, el formulario precarga el costo y el precio
   de catálogo. Ambos campos son editables para registrar el costo real y el
   precio final negociado.
4. La confirmación crea el movimiento de venta, descuenta el stock y, si hay
   IMEI, da de baja solo el equipo elegido, como ocurre hoy.
5. La parte superior de la pantalla presenta ganancias por día o semana, y un
   desglose por producto y ubicación.

## Datos y reglas

- `movements.unit_cost` guarda el costo unitario definitivo de cada venta.
- `movements.unit_sale_price` guarda el importe final de venta. Ambos valores
  se reciben en el registro de venta y no se recalculan desde el catálogo.
- Ganancia bruta = `(precio final - costo real) × cantidad`, solo para ventas
  no revertidas.
- Las ventas históricas que no tengan precio final congelado se muestran como
  referencia de catálogo, sin mezclarse como ganancia histórica exacta.
- Un producto con stock total cero se excluye de Buscar. Sus movimientos,
  equipos vendidos y reportes permanecen accesibles.
- Una búsqueda de IMEI vendido informa su estado y no permite venderlo de
  nuevo.

## API y componentes

- El endpoint de venta acepta costo unitario y precio final opcionales,
  validados como importes no negativos. Si faltan, conserva el valor del
  catálogo para compatibilidad con otros flujos.
- Un endpoint de reporte de ventas recibe periodo `día` o `semana` y devuelve
  resumen, series por periodo, productos y ubicaciones.
- `Ventas.tsx` integra el buscador, el formulario de venta y los reportes.
  Reutiliza los componentes de resultados y de selección de IMEI existentes.
- `Inicio.tsx` añade el acceso directo; Buscar aplica el filtro de stock
  disponible por defecto.

## Errores y pruebas

- Se conserva la validación de stock e IMEI antes de escribir una venta.
- Se prueban el guardado de ambos importes y una ganancia calculada con el
  precio final, incluso después de editar el catálogo.
- Se prueban los filtros de reporte por día y semana, y que una venta revertida
  no incremente las ganancias.
- Se prueba que Buscar no devuelve productos agotados y que el historial sigue
  devolviendo sus movimientos.
