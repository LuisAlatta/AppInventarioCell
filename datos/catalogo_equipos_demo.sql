-- Catálogo demostrativo para una tienda de celulares.
-- Crea cinco categorías, veinte modelos y cuatro equipos por modelo: una
-- unidad para cada combinación de lista blanca y condición. Es idempotente y
-- toma automáticamente el primer almacén disponible.

INSERT OR IGNORE INTO categories (id, name, icon) VALUES
  ('cat_demo_premium', 'Smartphones premium', '✨'),
  ('cat_demo_media', 'Smartphones gama media', '📱'),
  ('cat_demo_entrada', 'Smartphones de entrada', '📲'),
  ('cat_demo_tablets', 'Tablets', '▣'),
  ('cat_demo_wearables', 'Wearables', '⌚');

INSERT OR IGNORE INTO brands (id, name) VALUES
  ('brand_demo_apple', 'Apple'),
  ('brand_demo_samsung', 'Samsung'),
  ('brand_demo_xiaomi', 'Xiaomi'),
  ('brand_demo_motorola', 'Motorola'),
  ('brand_demo_oppo', 'OPPO'),
  ('brand_demo_huawei', 'Huawei'),
  ('brand_demo_lenovo', 'Lenovo');

WITH modelos(posicion, categoria_id, nombre, marca, modelo, costo, venta, minimo) AS (
  VALUES
    ( 1, 'cat_demo_premium',   'iPhone 15 Pro 128 GB',       'Apple',    'A3102',   3650, 4499, 2),
    ( 2, 'cat_demo_premium',   'Galaxy S24 Ultra 256 GB',    'Samsung',  'SM-S928', 3200, 3999, 2),
    ( 3, 'cat_demo_premium',   'Xiaomi 14 256 GB',           'Xiaomi',   '24031PN0DC', 2500, 3199, 2),
    ( 4, 'cat_demo_premium',   'Motorola Edge 50 Pro',       'Motorola', 'XT2403-2', 1900, 2499, 2),
    ( 5, 'cat_demo_media',     'iPhone 13 128 GB',           'Apple',    'A2633',   2200, 2799, 3),
    ( 6, 'cat_demo_media',     'Galaxy A55 256 GB',          'Samsung',  'SM-A556E', 1350, 1799, 3),
    ( 7, 'cat_demo_media',     'Redmi Note 13 Pro 5G',       'Xiaomi',   '2312DRA50G', 1050, 1449, 3),
    ( 8, 'cat_demo_media',     'Moto G85 5G',                'Motorola', 'XT2427-2', 950, 1299, 3),
    ( 9, 'cat_demo_entrada',   'Galaxy A16 128 GB',          'Samsung',  'SM-A166M', 590, 799, 4),
    (10, 'cat_demo_entrada',   'Redmi 14C 256 GB',           'Xiaomi',   '2409BRN2CL', 470, 649, 4),
    (11, 'cat_demo_entrada',   'Moto G05 128 GB',            'Motorola', 'XT2523-1', 430, 599, 4),
    (12, 'cat_demo_entrada',   'OPPO A60 256 GB',            'OPPO',     'CPH2631', 620, 849, 4),
    (13, 'cat_demo_tablets',   'iPad 10ª generación Wi‑Fi',  'Apple',    'MPQ33',   1450, 1899, 2),
    (14, 'cat_demo_tablets',   'Galaxy Tab S9 FE',           'Samsung',  'SM-X510',  980, 1299, 2),
    (15, 'cat_demo_tablets',   'Xiaomi Pad 6',               'Xiaomi',   '23043RP34G', 900, 1199, 2),
    (16, 'cat_demo_tablets',   'Lenovo Tab M11',             'Lenovo',   'TB330FU',  520, 729, 2),
    (17, 'cat_demo_wearables', 'Apple Watch SE GPS',         'Apple',    'A2723',    760, 999, 2),
    (18, 'cat_demo_wearables', 'Galaxy Watch6 44 mm',        'Samsung',  'SM-R940',  720, 949, 2),
    (19, 'cat_demo_wearables', 'Xiaomi Watch S3',            'Xiaomi',   'M2315W1',  420, 599, 2),
    (20, 'cat_demo_wearables', 'Huawei Watch Fit 3',         'Huawei',   'SLO-B19',  480, 649, 2)
)
INSERT OR IGNORE INTO products
  (id, barcode, name, brand, model, category_id, unit, cost_price, sale_price, min_stock, notes)
SELECT
  printf('prod_demo_%02d', posicion),
  printf('DEMOCELL%03d', posicion),
  nombre, marca, modelo, categoria_id, 'pza', costo, venta, minimo,
  'Equipo de demostración con IMEI y estado de lista blanca.'
FROM modelos;

WITH modelos(posicion) AS (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20)),
combinaciones(posicion, lista_blanca, condicion) AS (
  VALUES (1, 'registered', 'new'), (2, 'registered', 'used'),
         (3, 'not_registered', 'new'), (4, 'not_registered', 'used')
)
INSERT OR IGNORE INTO devices (id, product_id, whitelist_status, condition, location_id, notes)
SELECT
  printf('equ_demo_%02d_%d', modelos.posicion, combinaciones.posicion),
  printf('prod_demo_%02d', modelos.posicion),
  combinaciones.lista_blanca, combinaciones.condicion,
  (SELECT id FROM locations WHERE type = 'warehouse' AND is_active = 1 ORDER BY sort_order LIMIT 1),
  'Unidad de demostración para probar filtros y operaciones.'
FROM modelos CROSS JOIN combinaciones;

WITH modelos(posicion) AS (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20)),
combinaciones(posicion) AS (VALUES (1),(2),(3),(4))
INSERT OR IGNORE INTO device_imeis (device_id, position, imei)
SELECT
  printf('equ_demo_%02d_%d', modelos.posicion, combinaciones.posicion),
  1,
  printf('351%012d', (modelos.posicion - 1) * 4 + combinaciones.posicion)
FROM modelos CROSS JOIN combinaciones;

-- IMEI 2 es opcional; se deja en dos de las cuatro unidades de cada modelo.
-- Se recompone para corregir cualquier ejecución anterior del catálogo.
DELETE FROM device_imeis WHERE device_id LIKE 'equ_demo_%' AND position = 2;
WITH modelos(posicion) AS (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19),(20)),
combinaciones(posicion) AS (VALUES (1),(3))
INSERT OR IGNORE INTO device_imeis (device_id, position, imei)
SELECT
  printf('equ_demo_%02d_%d', modelos.posicion, combinaciones.posicion),
  2,
  printf('352%012d', (modelos.posicion - 1) * 4 + combinaciones.posicion)
FROM modelos CROSS JOIN combinaciones;

WITH modelos(posicion, costo) AS (
  VALUES (1,3650),(2,3200),(3,2500),(4,1900),(5,2200),(6,1350),(7,1050),(8,950),(9,590),(10,470),
         (11,430),(12,620),(13,1450),(14,980),(15,900),(16,520),(17,760),(18,720),(19,420),(20,480)
),
combinaciones(posicion) AS (VALUES (1),(2),(3),(4))
INSERT OR IGNORE INTO movements
  (id, type, product_id, device_id, qty, from_location_id, to_location_id, unit_cost, note, created_by)
SELECT
  printf('mov_demo_%02d_%d', modelos.posicion, combinaciones.posicion),
  'purchase_in', printf('prod_demo_%02d', modelos.posicion),
  printf('equ_demo_%02d_%d', modelos.posicion, combinaciones.posicion), 1, NULL,
  (SELECT id FROM locations WHERE type = 'warehouse' AND is_active = 1 ORDER BY sort_order LIMIT 1),
  modelos.costo, 'Alta inicial del catálogo demostrativo.',
  (SELECT id FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1)
FROM modelos CROSS JOIN combinaciones;

-- El stock sigue siempre al historial, incluso si se ejecuta nuevamente.
DELETE FROM stock WHERE product_id LIKE 'prod_demo_%';
INSERT INTO stock (product_id, location_id, qty)
SELECT product_id, location_id, SUM(delta)
FROM (
  SELECT product_id, to_location_id AS location_id, qty AS delta
  FROM movements WHERE product_id LIKE 'prod_demo_%' AND reverted_at IS NULL AND to_location_id IS NOT NULL
  UNION ALL
  SELECT product_id, from_location_id AS location_id, -qty AS delta
  FROM movements WHERE product_id LIKE 'prod_demo_%' AND reverted_at IS NULL AND from_location_id IS NOT NULL
)
GROUP BY product_id, location_id
HAVING SUM(delta) > 0;
