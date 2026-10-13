PRAGMA foreign_keys = ON;
CREATE TABLE products (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, artist TEXT NOT NULL, title TEXT NOT NULL,
 format TEXT NOT NULL CHECK(format IN ('vinilo','cd')), content TEXT NOT NULL,
 language TEXT NOT NULL CHECK(language IN ('es','en')), category TEXT NOT NULL DEFAULT 'Otros',
 price INTEGER NOT NULL CHECK(price > 0), stock INTEGER NOT NULL CHECK(stock >= 0),
 image TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 search_text TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX products_catalog ON products(active,format,language,stock);
CREATE INDEX products_featured ON products(featured,stock);
CREATE TABLE orders (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE,
 idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 customer_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
 delivery TEXT NOT NULL CHECK(delivery IN ('pickup','shipping')), address TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 subtotal INTEGER NOT NULL CHECK(subtotal > 0), shipping_cost INTEGER CHECK(shipping_cost >= 0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','ready','shipped','completed','cancelled','expired')),
 payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid','refunded')),
 tracking TEXT NOT NULL DEFAULT '', admin_notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at TEXT NOT NULL
);
CREATE INDEX orders_status ON orders(status,expires_at);
CREATE TABLE order_items (
 order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
 artist TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20), unit_price INTEGER NOT NULL CHECK(unit_price > 0),
 PRIMARY KEY(order_id,product_id)
);
CREATE TABLE stock_movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL REFERENCES products(id),
 delta INTEGER NOT NULL, reason TEXT NOT NULL, order_id TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER reserve_guard BEFORE INSERT ON order_items BEGIN
 SELECT RAISE(ABORT,'INSUFFICIENT_STOCK') WHERE NOT EXISTS (SELECT 1 FROM products WHERE id=NEW.product_id AND active=1 AND stock>=NEW.quantity);
 SELECT RAISE(ABORT,'PRICE_CHANGED') WHERE NOT EXISTS (SELECT 1 FROM products WHERE id=NEW.product_id AND price=NEW.unit_price);
END;
CREATE TRIGGER reserve_inventory AFTER INSERT ON order_items BEGIN
 UPDATE products SET stock=stock-NEW.quantity,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.product_id;
 INSERT INTO stock_movements(product_id,delta,reason,order_id) VALUES(NEW.product_id,-NEW.quantity,'Reserva',NEW.order_id);
END;
CREATE TRIGGER restore_inventory AFTER UPDATE OF status ON orders
WHEN NEW.status IN ('cancelled','expired') AND OLD.status NOT IN ('cancelled','expired') BEGIN
 UPDATE products SET stock=stock+(SELECT quantity FROM order_items WHERE order_id=NEW.id AND product_id=products.id),
 version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
 INSERT INTO stock_movements(product_id,delta,reason,order_id)
 SELECT product_id,quantity,'Liberación de reserva',NEW.id FROM order_items WHERE order_id=NEW.id;
END;
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE requests (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, artist TEXT NOT NULL, title TEXT NOT NULL,
 format TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
INSERT INTO settings VALUES ('store','{"address":"Freire 1119","city":"Concepción","hours":"Lunes a sábado · 11:00–13:00 y 13:40–18:30","instagram":"https://www.instagram.com/elrinconcitodelrock/","maps":"https://maps.app.goo.gl/GPBfSjqsU2NeSdVV8","whatsapp":"","email":"","shippingEnabled":true,"shippingCost":null,"pickupEnabled":true,"reservationHours":24,"shippingInfo":"Envíos a todo Chile y entregas en Concepción y alrededores. El costo y plazo se confirman antes de pagar.","returnInfo":"Para cambios, devoluciones o problemas con un disco, contáctanos por Instagram con el número de pedido. Se respetan los derechos del consumidor aplicables.","paymentMode":"reservation"}');
