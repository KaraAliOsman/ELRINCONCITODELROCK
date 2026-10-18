-- Each catalogue entry has one stable internal Code 128 value. Retail codes
-- are optional aliases; the shared primary key prevents ambiguous scans.
CREATE TABLE product_barcodes (
 code TEXT PRIMARY KEY COLLATE NOCASE,
 product_id TEXT NOT NULL REFERENCES products(id),
 kind TEXT NOT NULL CHECK(kind IN ('internal','retail')),
 UNIQUE(product_id,kind)
);
INSERT INTO product_barcodes(code,product_id,kind)
 SELECT 'RDR-' || UPPER(id),id,'internal' FROM products;
CREATE TRIGGER product_internal_barcode AFTER INSERT ON products BEGIN
 INSERT INTO product_barcodes(code,product_id,kind)
 VALUES('RDR-' || UPPER(NEW.id),NEW.id,'internal');
END;
ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'web'
 CHECK(channel IN ('web','store'));
DROP TRIGGER restore_inventory;
CREATE TRIGGER restore_inventory AFTER UPDATE OF status ON orders
WHEN NEW.status IN ('cancelled','expired') AND OLD.status NOT IN ('cancelled','expired') BEGIN
 UPDATE products SET stock=stock+(SELECT quantity FROM order_items WHERE order_id=NEW.id AND product_id=products.id),
 version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
 INSERT INTO stock_movements(product_id,delta,reason,order_id)
 SELECT product_id,quantity,CASE WHEN NEW.channel='store' THEN 'Anulación de venta' ELSE 'Liberación de reserva' END,NEW.id
 FROM order_items WHERE order_id=NEW.id;
END;
-- Historical store sales were identified by this exact server-created note.
UPDATE orders SET channel='store'
 WHERE status='completed' AND notes LIKE 'Venta presencial · Medio: %' AND email='';
DROP TRIGGER reserve_inventory;
CREATE TRIGGER reserve_inventory AFTER INSERT ON order_items BEGIN
 UPDATE products SET stock=stock-NEW.quantity,version=version+1,
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.product_id;
 INSERT INTO stock_movements(product_id,delta,reason,order_id)
 VALUES(NEW.product_id,-NEW.quantity,
 CASE WHEN (SELECT channel FROM orders WHERE id=NEW.order_id)='store'
 THEN 'Venta en tienda' ELSE 'Reserva web' END,NEW.order_id);
END;
