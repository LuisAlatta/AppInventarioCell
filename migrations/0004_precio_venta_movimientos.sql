-- El catálogo puede cambiar de precio, pero una operación ya realizada debe
-- conservar el importe que tenía cuando ocurrió.
ALTER TABLE movements ADD COLUMN unit_sale_price REAL;
