-- Datos de ejemplo para probar la aplicacion en local.
--
-- NO se aplica solo: se corre a mano con `npm run db:sembrar:local`. No es una
-- migracion, asi que vive aparte de los archivos numerados.
--
-- Sirve para dos cosas: tener con que probar sin capturar nada a mano, y poder
-- ensenarle la app a la clienta con numeros que se parezcan a su negocio.
--
-- El PIN no viene aqui. Su hash depende del secreto del servidor, asi que la
-- primera pantalla de la app es la que lo configura.

PRAGMA foreign_keys = ON;

-- Se limpia antes para que sembrar dos veces no duplique nada.
DELETE FROM movements;
DELETE FROM count_items;
DELETE FROM count_sessions;
DELETE FROM stock;
DELETE FROM products;
DELETE FROM categories;
DELETE FROM locations;

-- ---------------------------------------------------------------------------
-- Un almacen y tres sucursales
-- ---------------------------------------------------------------------------

INSERT INTO locations (id, name, type, icon, sort_order) VALUES
  ('ubi_almacen',  'Almacen Central',  'warehouse', '🏭', 0),
  ('ubi_centro',   'Sucursal Centro',  'store',     '🏬', 1),
  ('ubi_norte',    'Sucursal Norte',   'store',     '🏪', 2),
  ('ubi_sur',      'Sucursal Sur',     'store',     '🛒', 3);

INSERT INTO categories (id, name, icon) VALUES
  ('cat_audio',  'Audifonos',   '🎧'),
  ('cat_carga',  'Cargadores',  '🔌'),
  ('cat_micas',  'Micas',       '📱'),
  ('cat_fundas', 'Fundas',      '🛡️');

-- ---------------------------------------------------------------------------
-- Catalogo
-- ---------------------------------------------------------------------------

INSERT INTO products
  (id, barcode, name, brand, model, category_id, cost_price, sale_price, min_stock)
VALUES
  ('prod_buds',   '7501234567890', 'Audifonos Bluetooth Galaxy Buds',    'Samsung',  'SM-R175',  'cat_audio',   450,  899,  5),
  ('prod_carg25', '7501111111111', 'Cargador Turbo Tipo C 25W',          'Samsung',  'EP-TA800', 'cat_carga',   120,  299, 10),
  ('prod_mica15', '7502222222222', 'Mica de Cristal Templado iPhone 15', 'Generico', 'IP15',     'cat_micas',    15,   99, 20),
  ('prod_funda',  '7503333333333', 'Funda Silicon iPhone 14 Negra',      'Spigen',   'F14N',     'cat_fundas',   55,  189,  8),
  ('prod_airpod', '7504444444444', 'Audifonos AirPods Pro 2',            'Apple',    'MQD83',    'cat_audio',  3800, 5499,  2),
  ('prod_cable',  '7505555555555', 'Cable Lightning 1m',                 'Generico', 'CL1',      'cat_carga',    25,   89, 15),
  ('prod_power',  '7506666666666', 'Power Bank 10000mAh',                'Anker',    'A1263',    'cat_carga',   320,  649,  4),
  ('prod_micas24','7507777777777', 'Mica Privacidad Samsung S24',        'Generico', 'S24P',     'cat_micas',    22,  149, 12);

-- ---------------------------------------------------------------------------
-- Movimientos: compras al proveedor, reparto y ventas
--
-- Se escriben los movimientos y el stock se calcula despues a partir de ellos.
-- Es la misma regla que sigue la aplicacion, y aqui ademas evita que los
-- numeros del ejemplo se contradigan entre si.
-- ---------------------------------------------------------------------------

-- Compras: todo entra al almacen.
INSERT INTO movements (id, type, product_id, qty, to_location_id, unit_cost, note) VALUES
  ('mov_c1', 'purchase_in', 'prod_buds',    60, 'ubi_almacen',  450, 'Compra inicial'),
  ('mov_c2', 'purchase_in', 'prod_carg25', 120, 'ubi_almacen',  120, 'Compra inicial'),
  ('mov_c3', 'purchase_in', 'prod_mica15', 200, 'ubi_almacen',   15, 'Compra inicial'),
  ('mov_c4', 'purchase_in', 'prod_funda',   80, 'ubi_almacen',   55, 'Compra inicial'),
  ('mov_c5', 'purchase_in', 'prod_airpod',  20, 'ubi_almacen', 3800, 'Compra inicial'),
  ('mov_c6', 'purchase_in', 'prod_cable',  150, 'ubi_almacen',   25, 'Compra inicial'),
  ('mov_c7', 'purchase_in', 'prod_power',   40, 'ubi_almacen',  320, 'Compra inicial'),
  ('mov_c8', 'purchase_in', 'prod_micas24',100, 'ubi_almacen',   22, 'Compra inicial');

-- Reparto a las tres sucursales, agrupado por lote para poder deshacerlo junto.
INSERT INTO movements (id, type, product_id, qty, from_location_id, to_location_id, unit_cost, batch_id) VALUES
  ('mov_t01', 'transfer', 'prod_buds',   15, 'ubi_almacen', 'ubi_centro',  450, 'lote_centro'),
  ('mov_t02', 'transfer', 'prod_carg25', 30, 'ubi_almacen', 'ubi_centro',  120, 'lote_centro'),
  ('mov_t03', 'transfer', 'prod_mica15', 50, 'ubi_almacen', 'ubi_centro',   15, 'lote_centro'),
  ('mov_t04', 'transfer', 'prod_funda',  20, 'ubi_almacen', 'ubi_centro',   55, 'lote_centro'),
  ('mov_t05', 'transfer', 'prod_cable',  40, 'ubi_almacen', 'ubi_centro',   25, 'lote_centro'),
  ('mov_t06', 'transfer', 'prod_power',  10, 'ubi_almacen', 'ubi_centro',  320, 'lote_centro'),

  ('mov_t07', 'transfer', 'prod_buds',   15, 'ubi_almacen', 'ubi_norte',   450, 'lote_norte'),
  ('mov_t08', 'transfer', 'prod_carg25', 30, 'ubi_almacen', 'ubi_norte',   120, 'lote_norte'),
  ('mov_t09', 'transfer', 'prod_mica15', 50, 'ubi_almacen', 'ubi_norte',    15, 'lote_norte'),
  ('mov_t10', 'transfer', 'prod_funda',  20, 'ubi_almacen', 'ubi_norte',    55, 'lote_norte'),
  ('mov_t11', 'transfer', 'prod_cable',  40, 'ubi_almacen', 'ubi_norte',    25, 'lote_norte'),
  ('mov_t12', 'transfer', 'prod_power',  10, 'ubi_almacen', 'ubi_norte',   320, 'lote_norte'),

  ('mov_t13', 'transfer', 'prod_buds',   15, 'ubi_almacen', 'ubi_sur',     450, 'lote_sur'),
  ('mov_t14', 'transfer', 'prod_carg25', 30, 'ubi_almacen', 'ubi_sur',     120, 'lote_sur'),
  ('mov_t15', 'transfer', 'prod_mica15', 50, 'ubi_almacen', 'ubi_sur',      15, 'lote_sur'),
  ('mov_t16', 'transfer', 'prod_funda',  20, 'ubi_almacen', 'ubi_sur',      55, 'lote_sur'),
  ('mov_t17', 'transfer', 'prod_cable',  40, 'ubi_almacen', 'ubi_sur',      25, 'lote_sur'),
  ('mov_t18', 'transfer', 'prod_power',  10, 'ubi_almacen', 'ubi_sur',     320, 'lote_sur');

-- Ventas registradas, distintas en cada sucursal.
INSERT INTO movements (id, type, product_id, qty, from_location_id, unit_cost) VALUES
  ('mov_v01', 'sale', 'prod_buds',    6, 'ubi_centro',  450),
  ('mov_v02', 'sale', 'prod_carg25', 12, 'ubi_centro',  120),
  ('mov_v03', 'sale', 'prod_mica15', 20, 'ubi_centro',   15),
  ('mov_v04', 'sale', 'prod_cable',  15, 'ubi_centro',   25),

  ('mov_v05', 'sale', 'prod_buds',    4, 'ubi_norte',   450),
  ('mov_v06', 'sale', 'prod_carg25',  9, 'ubi_norte',   120),
  ('mov_v07', 'sale', 'prod_mica15', 14, 'ubi_norte',    15),
  ('mov_v08', 'sale', 'prod_cable',  10, 'ubi_norte',    25),

  ('mov_v09', 'sale', 'prod_buds',    5, 'ubi_sur',     450),
  ('mov_v10', 'sale', 'prod_carg25', 10, 'ubi_sur',     120),
  ('mov_v11', 'sale', 'prod_mica15', 18, 'ubi_sur',      15),
  ('mov_v12', 'sale', 'prod_cable',  12, 'ubi_sur',      25);

-- Una merma reconocida, para que el historial muestre tambien este caso.
INSERT INTO movements (id, type, product_id, qty, from_location_id, unit_cost, note) VALUES
  ('mov_m01', 'loss', 'prod_mica15', 2, 'ubi_norte', 15, 'Se rompieron al abrir la caja');

-- ---------------------------------------------------------------------------
-- Stock derivado de los movimientos
--
-- Calculado, no escrito a mano: cualquier numero de arriba que cambie se
-- refleja aqui sin tener que recalcular nada, y el ejemplo nunca queda
-- incoherente.
-- ---------------------------------------------------------------------------

INSERT INTO stock (product_id, location_id, qty)
SELECT product_id, location_id, SUM(delta) AS qty
FROM (
  SELECT product_id, to_location_id AS location_id, qty AS delta
  FROM movements
  WHERE to_location_id IS NOT NULL

  UNION ALL

  SELECT product_id, from_location_id AS location_id, -qty AS delta
  FROM movements
  WHERE from_location_id IS NOT NULL
)
GROUP BY product_id, location_id
HAVING SUM(delta) > 0;
