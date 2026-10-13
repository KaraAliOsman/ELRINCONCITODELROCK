import {
  normal,
  IMPORT_BATCH_SIZE,
  type Product,
  type StoreSettings,
} from "../src/types";
import { timingSafeEqual } from "node:crypto";

type AppEnv = Env & { ADMIN_PASSWORD: string; SESSION_SECRET: string };
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
const enc = new TextEncoder();
function likePattern(value: string) {
  let prefix = "",
    bytes = 0;
  for (const character of value.replace(/[%_]/g, "")) {
    const size = enc.encode(character).length;
    if (bytes + size > 48) break;
    prefix += character;
    bytes += size;
  }
  return "%" + prefix + "%";
}
const publicColumns =
  "id,slug,artist,title,format,content,language,category,price,stock,image,description,featured,active,version";
function text(v: unknown, max = 250) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function int(v: unknown, min: number, max: number) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    throw new HttpError(400, "Revisa los valores numéricos.");
  return v;
}
async function body(req: Request) {
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    throw new HttpError(415, "Usa el formato JSON.");
  if (Number(req.headers.get("Content-Length") || 0) > 65536)
    throw new HttpError(413, "La solicitud es demasiado grande.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Faltan los datos.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) {
      await reader.cancel();
      throw new HttpError(413, "La solicitud es demasiado grande.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }
  try {
    const b = JSON.parse(new TextDecoder().decode(combined));
    if (!b || typeof b !== "object" || Array.isArray(b)) throw 0;
    return b as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Los datos no son válidos.");
  }
}
async function settings(env: AppEnv) {
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='store'",
  ).first<{ value: string }>();
  if (!row) throw new Error("Missing store settings");
  return JSON.parse(row.value) as StoreSettings;
}
function sameOrigin(req: Request) {
  if (req.headers.get("Origin") !== new URL(req.url).origin)
    throw new HttpError(403, "La solicitud debe venir de esta tienda.");
}
const b64 = (data: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(data)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
function un64(s: string) {
  return Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
async function digest(s: string) {
  return b64(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
async function sessionToken(env: AppEnv) {
  const payload = b64(
    enc.encode(
      JSON.stringify({
        exp: Date.now() + 8 * 3600000,
        nonce: crypto.randomUUID(),
      }),
    ).buffer,
  );
  return (
    payload +
    "." +
    b64(
      await crypto.subtle.sign(
        "HMAC",
        await hmacKey(env.SESSION_SECRET),
        enc.encode(payload),
      ),
    )
  );
}
async function authenticated(req: Request, env: AppEnv) {
  const token = req.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)rdr_session=([^;]+)/)?.[1];
  if (!token) return false;
  try {
    const [payload, sig] = token.split(".");
    return (
      (await crypto.subtle.verify(
        "HMAC",
        await hmacKey(env.SESSION_SECRET),
        un64(sig),
        enc.encode(payload),
      )) && JSON.parse(new TextDecoder().decode(un64(payload))).exp > Date.now()
    );
  } catch {
    return false;
  }
}
async function requireAdmin(req: Request, env: AppEnv) {
  if (!(await authenticated(req, env)))
    throw new HttpError(401, "Inicia sesión para continuar.");
}
async function rateLimit(
  req: Request,
  env: AppEnv,
  group: string,
  limit: number,
  seconds = 3600,
) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const key = group + ":" + (await digest(ip + env.SESSION_SECRET));
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,hits,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END RETURNING hits,reset_at",
  )
    .bind(key, now + seconds, now, now, now + seconds)
    .first<{ hits: number; reset_at: number }>();
  if (row && row.hits > limit)
    throw new HttpError(
      429,
      "Demasiados intentos. Inténtalo de nuevo más tarde.",
    );
}
async function expireReservations(env: AppEnv) {
  await env.DB.prepare(
    "UPDATE orders SET status='expired',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='pending' AND payment_status='unpaid' AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  ).run();
}
async function listProducts(url: URL, env: AppEnv, admin = false) {
  const clauses = admin ? ["1=1"] : ["active=1"];
  const bindings: (string | number)[] = [];
  const q = normal(url.searchParams.get("q") || "").slice(0, 150);
  for (const word of q.split(" ").filter(Boolean).slice(0, 8)) {
    clauses.push("search_text LIKE ?");
    bindings.push(likePattern(word));
  }
  const fmt = url.searchParams.get("format");
  if (fmt === "vinilo" || fmt === "cd") {
    clauses.push("format=?");
    bindings.push(fmt);
  }
  const lang = url.searchParams.get("language");
  if (lang === "es" || lang === "en") {
    clauses.push("language=?");
    bindings.push(lang);
  }
  const category = url.searchParams.get("category");
  if (category && category.length < 60) {
    clauses.push("category=?");
    bindings.push(category);
  }
  if (url.searchParams.get("available") !== "0" && !admin)
    clauses.push("stock>0");
  if (url.searchParams.get("featured") === "1") clauses.push("featured=1");
  const max = Number(url.searchParams.get("maxPrice"));
  if (Number.isFinite(max) && max > 0) {
    clauses.push("price<=?");
    bindings.push(max);
  }
  const limit = Math.min(
    Math.max(Math.floor(Number(url.searchParams.get("limit")) || 24), 1),
    admin ? 100 : 48,
  );
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  if (!Number.isInteger(page) || page > 10000)
    throw new HttpError(400, "Página inválida.");
  const sorts: Record<string, string> = {
    price_asc: "price ASC",
    price_desc: "price DESC",
    artist: "artist ASC,title ASC",
    featured: "featured DESC,(image != '') DESC,artist ASC,title ASC",
  };
  const order =
    sorts[url.searchParams.get("sort") || "featured"] || sorts.featured;
  const where = clauses.join(" AND ");
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ${publicColumns}${admin ? ",source,updated_at" : ""} FROM products WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).bind(...bindings, limit, (page - 1) * limit),
    env.DB.prepare(
      `SELECT COUNT(*) AS total FROM products WHERE ${where}`,
    ).bind(...bindings),
  ]);
  return json({
    products: rows.results,
    total: (count.results[0] as { total: number }).total,
    page,
    limit,
  });
}
async function createOrder(
  req: Request,
  env: AppEnv,
  b: Record<string, unknown>,
  pos = false,
) {
  await expireReservations(env);
  const cfg = await settings(env);
  const raw = b.items;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40)
    throw new HttpError(400, "Tu bolsa debe tener entre 1 y 40 productos.");
  const items = new Map<string, number>();
  for (const r of raw) {
    const id = text(r?.id, 80);
    if (!id) throw new HttpError(400, "Producto inválido.");
    items.set(id, (items.get(id) || 0) + int(r?.quantity, 1, 20));
  }
  for (const qty of items.values()) int(qty, 1, 20);
  const name = text(b.name, 120),
    email = text(b.email, 200).toLowerCase(),
    phone = text(b.phone, 40),
    delivery = pos ? "pickup" : b.delivery;
  if (
    name.length < 2 ||
    (!pos && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (!pos && phone.replace(/\D/g, "").length < 8)
  )
    throw new HttpError(400, "Revisa tu nombre, correo y teléfono.");
  if (!["pickup", "shipping"].includes(String(delivery)))
    throw new HttpError(400, "Elige una forma de entrega.");
  if (
    !pos &&
    ((delivery === "shipping" && !cfg.shippingEnabled) ||
      (delivery === "pickup" && !cfg.pickupEnabled))
  )
    throw new HttpError(400, "Esta forma de entrega no está disponible.");
  const address = text(b.address, 250),
    city = text(b.city, 120),
    region = text(b.region, 120);
  if (
    delivery === "shipping" &&
    (address.length < 5 || city.length < 2 || region.length < 2)
  )
    throw new HttpError(400, "Completa la dirección de envío.");
  if (!pos && b.consent !== true)
    throw new HttpError(400, "Acepta las condiciones para crear el pedido.");
  const idempotency = text(req.headers.get("Idempotency-Key"), 80);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(idempotency))
    throw new HttpError(400, "Falta el identificador del pedido.");
  const hash = await digest(
    JSON.stringify({
      items: [...items].sort(),
      name,
      email,
      phone,
      delivery,
      address,
      city,
      region,
      notes: text(b.notes, 1000),
      pos,
    }),
  );
  const existing = await env.DB.prepare(
    "SELECT id,code,token,request_hash FROM orders WHERE idempotency_key=?",
  )
    .bind(idempotency)
    .first<{ id: string; code: string; token: string; request_hash: string }>();
  if (existing) {
    if (existing.request_hash !== hash)
      throw new HttpError(409, "Este intento ya pertenece a otro pedido.");
    return json(
      { id: existing.id, code: existing.code, token: existing.token },
      200,
    );
  }
  const ids = [...items.keys()];
  const rows = await env.DB.prepare(
    `SELECT ${publicColumns} FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<Product>();
  const products = rows.results;
  if (products.length !== ids.length)
    throw new HttpError(400, "Un producto ya no está disponible.");
  let subtotal = 0;
  for (const p of products) {
    if (!p.active || p.stock < items.get(p.id)!)
      throw new HttpError(409, `No queda suficiente stock de ${p.title}.`);
    subtotal += p.price * items.get(p.id)!;
  }
  const id = crypto.randomUUID(),
    token = b64(crypto.getRandomValues(new Uint8Array(32)).buffer),
    code = "RDR-" + id.replaceAll("-", "").slice(0, 10).toUpperCase();
  const expires = new Date(
    Date.now() + cfg.reservationHours * 3600000,
  ).toISOString();
  const shipping = delivery === "pickup" ? 0 : cfg.shippingCost;
  const statements = [
    env.DB.prepare(
      "INSERT INTO orders(id,code,token,idempotency_key,request_hash,customer_name,email,phone,delivery,address,city,region,notes,subtotal,shipping_cost,status,payment_status,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      id,
      code,
      token,
      idempotency,
      hash,
      name,
      email,
      phone,
      delivery,
      address,
      city,
      region,
      text(b.notes, 1000),
      subtotal,
      shipping,
      pos ? "completed" : "pending",
      pos ? "paid" : "unpaid",
      expires,
    ),
  ];
  for (const p of products)
    statements.push(
      env.DB.prepare(
        "INSERT INTO order_items(order_id,product_id,artist,title,format,quantity,unit_price) VALUES(?,?,?,?,?,?,?)",
      ).bind(id, p.id, p.artist, p.title, p.format, items.get(p.id)!, p.price),
    );
  try {
    await env.DB.batch(statements);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("INSUFFICIENT_STOCK") || msg.includes("PRICE_CHANGED"))
      throw new HttpError(
        409,
        "El stock o precio cambió. Actualiza la bolsa y vuelve a intentar.",
      );
    if (msg.includes("idempotency_key")) {
      const repeat = await env.DB.prepare(
        "SELECT id,code,token,request_hash FROM orders WHERE idempotency_key=?",
      )
        .bind(idempotency)
        .first<{
          id: string;
          code: string;
          token: string;
          request_hash: string;
        }>();
      if (repeat && repeat.request_hash === hash)
        return json({ id: repeat.id, code: repeat.code, token: repeat.token });
    }
    throw e;
  }
  console.log(
    JSON.stringify({
      event: pos ? "store_sale_created" : "order_created",
      order_id: id,
      items: items.size,
    }),
  );
  return json({ id, code, token }, 201);
}
async function orderDetails(id: string, env: AppEnv, admin = false) {
  const order = await env.DB.prepare(
    `SELECT ${admin ? "*" : "id,code,customer_name,delivery,subtotal,shipping_cost,status,payment_status,tracking,created_at,expires_at"} FROM orders WHERE id=?`,
  )
    .bind(id)
    .first();
  if (!order) throw new HttpError(404, "No encontramos ese pedido.");
  const lines = await env.DB.prepare(
    "SELECT product_id,artist,title,format,quantity,unit_price FROM order_items WHERE order_id=?",
  )
    .bind(id)
    .all();
  return { ...order, items: lines.results };
}
async function updateOrder(
  id: string,
  b: Record<string, unknown>,
  env: AppEnv,
) {
  await expireReservations(env);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<{
      status: string;
      payment_status: string;
      delivery: string;
      shipping_cost: number | null;
      tracking: string;
      admin_notes: string;
    }>();
  if (!order) throw new HttpError(404, "Pedido no encontrado.");
  const target = text(b.status, 30) || order.status;
  const payment = text(b.payment_status, 20) || order.payment_status;
  const transitions: Record<string, string[]> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["ready", "shipped", "cancelled"],
    ready: ["completed", "cancelled"],
    shipped: ["completed"],
    completed: [],
    cancelled: [],
    expired: [],
  };
  if (target !== order.status && !transitions[order.status]?.includes(target))
    throw new HttpError(409, "Ese cambio de estado no está permitido.");
  if (!["unpaid", "paid", "refunded"].includes(payment))
    throw new HttpError(400, "Estado de pago inválido.");
  if (
    ["cancelled", "expired"].includes(order.status) &&
    payment !== order.payment_status
  )
    throw new HttpError(409, "Este pedido ya está cerrado.");
  if (payment === "unpaid" && order.payment_status === "paid")
    throw new HttpError(
      409,
      "Un pago registrado solo puede marcarse como reembolsado.",
    );
  if (
    (target === "shipped" && order.delivery !== "shipping") ||
    (target === "ready" && order.delivery !== "pickup")
  )
    throw new HttpError(400, "El estado no corresponde a esta entrega.");
  if (
    ["confirmed", "ready", "shipped", "completed"].includes(target) &&
    payment !== "paid"
  )
    throw new HttpError(400, "Registra el pago recibido antes de confirmar.");
  if (
    target === "cancelled" &&
    order.payment_status === "paid" &&
    payment !== "refunded"
  )
    throw new HttpError(
      400,
      "Confirma el reembolso antes de cancelar un pedido pagado.",
    );
  const shipping =
    b.shipping_cost === undefined
      ? order.shipping_cost
      : b.shipping_cost === null
        ? null
        : int(b.shipping_cost, 0, 500000);
  if (
    ["confirmed", "shipped", "completed"].includes(target) &&
    order.delivery === "shipping" &&
    shipping === null
  )
    throw new HttpError(400, "Confirma el costo de envío antes de continuar.");
  const res = await env.DB.prepare(
    "UPDATE orders SET status=?,payment_status=?,tracking=?,shipping_cost=?,admin_notes=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status=? AND payment_status=? RETURNING id",
  )
    .bind(
      target,
      payment,
      b.tracking === undefined ? order.tracking : text(b.tracking, 200),
      shipping,
      b.admin_notes === undefined
        ? order.admin_notes
        : text(b.admin_notes, 2000),
      id,
      order.status,
      order.payment_status,
    )
    .first();
  if (!res) throw new HttpError(409, "El pedido cambió. Vuelve a cargarlo.");
  await env.DB.prepare(
    "INSERT INTO audit_log(action,entity_id,detail) VALUES(?,?,?)",
  )
    .bind("order_updated", id, JSON.stringify({ status: target, payment }))
    .run();
  return json({ ok: true });
}
async function updateProduct(
  id: string,
  b: Record<string, unknown>,
  env: AppEnv,
) {
  const current = await env.DB.prepare("SELECT * FROM products WHERE id=?")
    .bind(id)
    .first<Product>();
  if (!current) throw new HttpError(404, "Producto no encontrado.");
  const version = int(b.version, 1, 100000000);
  const price = int(b.price, 1, 20000000),
    stock = int(b.stock, 0, 100000);
  const artist = text(b.artist, 200),
    title = text(b.title, 300);
  if (!artist || !title) throw new HttpError(400, "Completa artista y álbum.");
  const image = text(b.image, 1000);
  if (
    image &&
    !image.startsWith("/assets/") &&
    !image.startsWith("/api/images/") &&
    !/^https:\/\//.test(image)
  )
    throw new HttpError(
      400,
      "La imagen debe ser una URL HTTPS o una imagen de la tienda.",
    );
  const res = await env.DB.prepare(
    "UPDATE products SET artist=?,title=?,price=?,stock=?,image=?,description=?,featured=?,active=?,category=?,search_text=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=?",
  )
    .bind(
      artist,
      title,
      price,
      stock,
      image,
      text(b.description, 2000),
      b.featured ? 1 : 0,
      b.active ? 1 : 0,
      text(b.category, 60) || current.category,
      normal(artist + " " + title + " " + current.content),
      id,
      version,
    )
    .run();
  if (res.meta.changes !== 1)
    throw new HttpError(
      409,
      "El stock cambió desde que abriste el producto. Actualízalo antes de guardar.",
    );
  if (stock !== current.stock)
    await env.DB.prepare(
      "INSERT INTO stock_movements(product_id,delta,reason) VALUES(?,?,?)",
    )
      .bind(id, stock - current.stock, "Ajuste manual")
      .run();
  await env.DB.prepare(
    "INSERT INTO audit_log(action,entity_id,detail) VALUES(?,?,?)",
  )
    .bind("product_updated", id, JSON.stringify({ stock, price }))
    .run();
  return json({ ok: true });
}
async function api(req: Request, env: AppEnv, ctx: ExecutionContext) {
  const url = new URL(req.url),
    path = url.pathname,
    method = req.method;
  if (!["GET", "POST", "PATCH", "PUT"].includes(method))
    throw new HttpError(405, "Método no permitido.");
  if (method !== "GET") sameOrigin(req);
  if (path === "/api/health")
    return json({
      ok: true,
      database: !!(await env.DB.prepare("SELECT 1").first()),
    });
  if (path === "/api/store" && method === "GET") {
    const [cfg, stats] = await Promise.all([
      settings(env),
      env.DB.prepare(
        "SELECT COUNT(*) AS total,SUM(stock>0) AS available,SUM(stock) AS units,SUM(format='vinilo' AND stock>0) AS vinyl,SUM(format='cd' AND stock>0) AS cds FROM products WHERE active=1",
      ).first(),
    ]);
    return json({ settings: cfg, stats });
  }
  if (path === "/api/products" && method === "GET")
    return listProducts(url, env);
  if (path.startsWith("/api/products/") && method === "GET") {
    const p = await env.DB.prepare(
      `SELECT ${publicColumns} FROM products WHERE (id=? OR slug=?) AND active=1`,
    )
      .bind(path.slice(14), path.slice(14))
      .first();
    if (!p) throw new HttpError(404, "Disco no encontrado.");
    return json(p);
  }
  if (path === "/api/orders" && method === "POST") {
    await rateLimit(req, env, "orders", 10);
    return createOrder(req, env, await body(req));
  }
  if (path.startsWith("/api/orders/") && method === "GET") {
    const id = path.slice(12),
      token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token || token.length > 60)
      throw new HttpError(404, "Pedido no encontrado.");
    const valid = await env.DB.prepare(
      "SELECT id FROM orders WHERE id=? AND token=?",
    )
      .bind(id, token)
      .first();
    if (!valid) throw new HttpError(404, "Pedido no encontrado.");
    await expireReservations(env);
    return json(await orderDetails(id, env));
  }
  if (path === "/api/requests" && method === "POST") {
    await rateLimit(req, env, "requests", 5);
    const b = await body(req);
    const name = text(b.name, 120),
      email = text(b.email, 200),
      artist = text(b.artist, 200),
      title = text(b.title, 250);
    if (
      name.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      artist.length < 2 ||
      title.length < 1 ||
      b.consent !== true
    )
      throw new HttpError(400, "Completa los datos y acepta las condiciones.");
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO requests(id,name,email,artist,title,format,notes) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        name,
        email,
        artist,
        title,
        text(b.format, 30) || "Cualquiera",
        text(b.notes, 1000),
      )
      .run();
    return json({ ok: true, id }, 201);
  }
  if (path.startsWith("/api/images/") && method === "GET") {
    const img = await env.DB.prepare("SELECT mime,bytes FROM images WHERE id=?")
      .bind(path.slice(12))
      .first<{ mime: string; bytes: ArrayBuffer | number[] }>();
    if (!img) throw new HttpError(404, "Imagen no encontrada.");
    return new Response(
      Array.isArray(img.bytes) ? Uint8Array.from(img.bytes) : img.bytes,
      {
        headers: {
          "Content-Type": img.mime,
          "Cache-Control": "public,max-age=31536000,immutable",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  if (path === "/api/admin/login" && method === "POST") {
    await rateLimit(req, env, "login", 8, 900);
    const b = await body(req);
    const [provided, expected] = await Promise.all([
      crypto.subtle.digest("SHA-256", enc.encode(text(b.password, 500))),
      crypto.subtle.digest(
        "SHA-256",
        enc.encode(env.ADMIN_PASSWORD || crypto.randomUUID()),
      ),
    ]);
    if (
      !env.ADMIN_PASSWORD ||
      !env.SESSION_SECRET ||
      !timingSafeEqual(new Uint8Array(provided), new Uint8Array(expected))
    )
      throw new HttpError(401, "La contraseña no es correcta.");
    return json({ ok: true }, 200, {
      "Set-Cookie": `rdr_session=${await sessionToken(env)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${url.protocol === "https:" ? "; Secure" : ""}`,
    });
  }
  if (path === "/api/admin/logout" && method === "POST")
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "rdr_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0",
    });
  if (path.startsWith("/api/admin/")) {
    await requireAdmin(req, env);
    if (path === "/api/admin/session") return json({ ok: true });
    if (path === "/api/admin/dashboard") {
      await expireReservations(env);
      const results = await env.DB.batch([
        env.DB.prepare(
          "SELECT COUNT(*) AS total,SUM(status='pending') AS pending,SUM(payment_status='paid' AND status NOT IN ('cancelled','expired')) AS paid_orders,SUM(CASE WHEN payment_status='paid' AND status NOT IN ('cancelled','expired') THEN subtotal ELSE 0 END) AS revenue FROM orders",
        ),
        env.DB.prepare(
          "SELECT COUNT(*) AS products,SUM(stock>0) AS available,SUM(stock) AS units,SUM(stock<=1 AND active=1) AS low_stock FROM products",
        ),
        env.DB.prepare(
          "SELECT COUNT(*) AS count FROM requests WHERE status='new'",
        ),
        env.DB.prepare(
          "SELECT substr(created_at,1,10) AS date,SUM(subtotal) AS revenue FROM orders WHERE payment_status='paid' AND status NOT IN ('cancelled','expired') AND created_at>=datetime('now','-30 day') GROUP BY date ORDER BY date",
        ),
      ]);
      return json({
        orders: results[0].results[0],
        inventory: results[1].results[0],
        requests: results[2].results[0],
        sales: results[3].results,
      });
    }
    if (path === "/api/admin/products" && method === "GET")
      return listProducts(url, env, true);
    if (path === "/api/admin/products" && method === "POST") {
      const b = await body(req),
        artist = text(b.artist, 200),
        title = text(b.title, 300),
        format = text(b.format, 20),
        language = text(b.language, 5);
      if (
        !artist ||
        !title ||
        !["vinilo", "cd"].includes(format) ||
        !["es", "en"].includes(language)
      )
        throw new HttpError(400, "Completa los datos del nuevo disco.");
      const id = "nuevo-" + crypto.randomUUID().slice(0, 8),
        slug =
          normal(artist + " " + title).replaceAll(" ", "-") +
          "-" +
          format +
          "-" +
          id;
      const price = int(b.price, 1, 20000000),
        stock = int(b.stock, 0, 100000),
        image = text(b.image, 1000);
      if (
        image &&
        !image.startsWith("/api/images/") &&
        !image.startsWith("/assets/") &&
        !/^https:\/\//.test(image)
      )
        throw new HttpError(
          400,
          "Usa una imagen de la tienda o una URL HTTPS.",
        );
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO products(id,slug,artist,title,format,content,language,category,price,stock,image,description,featured,active,search_text,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          slug,
          artist,
          title,
          format,
          text(b.content, 40) || "1 " + format.toUpperCase(),
          language,
          text(b.category, 60) || "Internacional",
          price,
          stock,
          image,
          text(b.description, 2000),
          b.featured ? 1 : 0,
          b.active === false ? 0 : 1,
          normal(artist + " " + title),
          "Añadido desde administración",
        ),
        env.DB.prepare(
          "INSERT INTO stock_movements(product_id,delta,reason) VALUES(?,?,?)",
        ).bind(id, stock, "Ingreso de producto"),
      ]);
      return json({ id, slug }, 201);
    }
    if (path.startsWith("/api/admin/products/") && method === "PATCH")
      return updateProduct(path.slice(20), await body(req), env);
    if (path === "/api/admin/orders" && method === "GET") {
      const filter = text(url.searchParams.get("status"), 30);
      const q = text(url.searchParams.get("q"), 100);
      const clauses = ["1=1"];
      const args: string[] = [];
      if (filter) {
        clauses.push("status=?");
        args.push(filter);
      }
      if (q) {
        clauses.push("(code LIKE ? OR customer_name LIKE ?)");
        args.push(likePattern(q), likePattern(q));
      }
      const rows = await env.DB.prepare(
        "SELECT id,code,customer_name,delivery,subtotal,shipping_cost,status,payment_status,created_at,expires_at FROM orders WHERE " +
          clauses.join(" AND ") +
          " ORDER BY created_at DESC LIMIT 100",
      )
        .bind(...args)
        .all();
      return json({ orders: rows.results });
    }
    if (path.startsWith("/api/admin/orders/")) {
      const id = path.slice(18);
      if (method === "GET") return json(await orderDetails(id, env, true));
      if (method === "PATCH") return updateOrder(id, await body(req), env);
    }
    if (path === "/api/admin/sales" && method === "POST")
      return createOrder(req, env, await body(req), true);
    if (path === "/api/admin/settings" && method === "GET")
      return json(await settings(env));
    if (path === "/api/admin/settings" && method === "PUT") {
      const b = await body(req),
        cfg = await settings(env);
      const s = { ...cfg };
      for (const k of [
        "address",
        "city",
        "hours",
        "whatsapp",
        "email",
        "shippingInfo",
        "returnInfo",
      ] as const)
        s[k] = text(b[k], k.endsWith("Info") ? 2000 : 250);
      if (s.whatsapp && !/^\d{9,15}$/.test(s.whatsapp))
        throw new HttpError(
          400,
          "WhatsApp debe incluir código de país y solo números.",
        );
      if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))
        throw new HttpError(400, "El correo no es válido.");
      s.shippingEnabled = b.shippingEnabled === true;
      s.pickupEnabled = b.pickupEnabled === true;
      if (!s.shippingEnabled && !s.pickupEnabled)
        throw new HttpError(400, "Activa al menos una forma de entrega.");
      s.shippingCost =
        b.shippingCost === null ? null : int(b.shippingCost, 0, 500000);
      s.reservationHours = int(b.reservationHours, 1, 168);
      await env.DB.prepare("UPDATE settings SET value=? WHERE key='store'")
        .bind(JSON.stringify(s))
        .run();
      return json({ ok: true });
    }
    if (path === "/api/admin/requests" && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM requests ORDER BY created_at DESC LIMIT 200",
      ).all();
      return json({ requests: rows.results });
    }
    if (path.startsWith("/api/admin/requests/") && method === "PATCH") {
      const b = await body(req);
      if (!["new", "contacted", "closed"].includes(String(b.status)))
        throw new HttpError(400, "Estado inválido.");
      await env.DB.prepare("UPDATE requests SET status=? WHERE id=?")
        .bind(b.status, path.slice(20))
        .run();
      return json({ ok: true });
    }
    if (path === "/api/admin/images" && method === "POST") {
      const mime = req.headers.get("Content-Type") || "";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
        throw new HttpError(415, "Sube una imagen JPG, PNG o WebP.");
      const data = await req.arrayBuffer();
      if (data.byteLength > 524288 || data.byteLength < 12)
        throw new HttpError(413, "La foto debe pesar menos de 512 KB.");
      const bytes = new Uint8Array(data);
      const valid =
        mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : mime === "image/png"
            ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78
            : bytes[0] === 82 &&
              bytes[1] === 73 &&
              bytes[2] === 70 &&
              bytes[8] === 87 &&
              bytes[9] === 69 &&
              bytes[10] === 66;
      if (!valid)
        throw new HttpError(
          400,
          "El archivo no corresponde al tipo de imagen.",
        );
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO images(id,mime,bytes) VALUES(?,?,?)")
        .bind(id, mime, data)
        .run();
      return json({ url: "/api/images/" + id }, 201);
    }
    if (path === "/api/admin/export" && method === "GET") {
      const kind =
        url.searchParams.get("type") === "orders" ? "orders" : "products";
      const cols =
        kind === "products"
          ? [
              "id",
              "artist",
              "title",
              "format",
              "content",
              "price",
              "stock",
              "featured",
              "active",
              "version",
            ]
          : [
              "code",
              "customer_name",
              "email",
              "phone",
              "delivery",
              "address",
              "city",
              "subtotal",
              "shipping_cost",
              "status",
              "payment_status",
              "created_at",
            ];
      const rows = await env.DB.prepare(
        "SELECT " +
          cols.join(",") +
          " FROM " +
          kind +
          " ORDER BY " +
          (kind === "products" ? "artist,title" : "created_at DESC"),
      ).all<Record<string, unknown>>();
      const safe = (v: unknown) => {
        const s = String(v ?? "");
        return (
          '"' +
          (/^[=+\-@\t\r]/.test(s) ? "'" : "") +
          s.replaceAll('"', '""') +
          '"'
        );
      };
      return new Response(
        "\uFEFF" +
          cols.join(",") +
          "\r\n" +
          rows.results
            .map((r) => cols.map((c) => safe(r[c])).join(","))
            .join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": `attachment; filename="rinconcito-${kind}.csv"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (path === "/api/admin/import" && method === "POST") {
      const b = await body(req);
      if (
        !Array.isArray(b.rows) ||
        b.rows.length > IMPORT_BATCH_SIZE ||
        b.rows.length < 1
      )
        throw new HttpError(
          400,
          `Importa entre 1 y ${IMPORT_BATCH_SIZE} filas por lote.`,
        );
      const statements: D1PreparedStatement[] = [];
      const unique = new Set<string>();
      for (const row of b.rows) {
        const id = text(row?.id, 80);
        if (!id || unique.has(id))
          throw new HttpError(400, "Hay identificadores vacíos o repetidos.");
        unique.add(id);
        const price = int(row.price, 1, 20000000),
          stock = int(row.stock, 0, 100000),
          version = int(row.version, 1, 100000000);
        statements.push(
          env.DB.prepare(
            "INSERT INTO stock_movements(product_id,delta,reason) SELECT id,?-stock,'Importación CSV' FROM products WHERE id=? AND version=?",
          ).bind(stock, id, version),
        );
        statements.push(
          env.DB.prepare(
            "UPDATE products SET stock=?,price=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=?",
          ).bind(stock, price, id, version),
        );
      }
      const results = await env.DB.batch(statements);
      return json({
        updated: results
          .filter((_, i) => i % 2 === 1)
          .reduce((n, r) => n + r.meta.changes, 0),
        total: b.rows.length,
      });
    }
    throw new HttpError(404, "Operación no encontrada.");
  }
  throw new HttpError(404, "Recurso no encontrado.");
}
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
async function page(req: Request, env: AppEnv) {
  const url = new URL(req.url),
    path = url.pathname;
  if (path === "/robots.txt")
    return new Response(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /pedido/\nSitemap: ${url.origin}/sitemap.xml`,
      { headers: { "Content-Type": "text/plain" } },
    );
  if (path === "/sitemap.xml") {
    const { results } = await env.DB.prepare(
      "SELECT slug,updated_at FROM products WHERE active=1 AND stock>0",
    ).all<{ slug: string; updated_at: string }>();
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        ["/", "/tienda", "/nosotros", "/ayuda"]
          .map((p) => `<url><loc>${escapeHtml(url.origin + p)}</loc></url>`)
          .join("") +
        results
          .map(
            (p) =>
              `<url><loc>${escapeHtml(url.origin + "/disco/" + p.slug)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`,
          )
          .join("") +
        "</urlset>",
      {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "public,max-age=3600",
        },
      },
    );
  }
  if (/\.[a-z0-9]{2,6}$/i.test(path)) return env.ASSETS.fetch(req);
  if (
    !/^\/$|^\/(tienda|favoritos|nosotros|ayuda|privacidad|condiciones|admin)\/?$|^\/(disco|pedido)\/[a-z0-9-]+$/.test(
      path,
    )
  )
    return new Response("Página no encontrada", { status: 404 });
  const index = await env.ASSETS.fetch(new Request(new URL("/", url), req));
  let html = await index.text();
  let title = "El Rinconcito del Rock · Vinilos y CDs en Concepción";
  let description =
    "Encuentra tu próximo disco. Vinilos y CDs, rock chileno e internacional. Visítanos en Freire 1119, Concepción. Envíos a todo Chile.";
  let schema: unknown = {
    "@context": "https://schema.org",
    "@type": "MusicStore",
    name: env.STORE_NAME,
    url: url.origin,
    image: url.origin + "/assets/logo.jpg",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Freire 1119",
      addressLocality: "Concepción",
      addressRegion: "Biobío",
      addressCountry: "CL",
    },
    sameAs: [env.INSTAGRAM_URL],
  };
  let image = url.origin + "/social-cover.png";
  if (path.startsWith("/disco/")) {
    const p = await env.DB.prepare(
      `SELECT ${publicColumns} FROM products WHERE slug=? AND active=1`,
    )
      .bind(path.slice(7))
      .first<Product>();
    if (!p) return new Response("Disco no encontrado", { status: 404 });
    title = p.artist + " — " + p.title + " · El Rinconcito del Rock";
    description = `${p.title} de ${p.artist}, ${p.content}. $${p.price.toLocaleString("es-CL")} CLP. ${p.stock > 0 ? "Disponible" : "Agotado"}. Retiro en Concepción y envíos a Chile.`;
    if (p.image) image = new URL(p.image, url.origin).href;
    schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.title,
      brand: { "@type": "Brand", name: p.artist },
      sku: p.id,
      image: p.image ? [image] : undefined,
      description,
      offers: {
        "@type": "Offer",
        priceCurrency: "CLP",
        price: p.price,
        availability:
          "https://schema.org/" + (p.stock > 0 ? "InStock" : "OutOfStock"),
        url: url.origin + path,
      },
    };
    html = html.replace(
      "<!--ssr-content-->",
      `<article class="ssr-product"><h1>${escapeHtml(p.artist)} — ${escapeHtml(p.title)}</h1><p>${escapeHtml(description)}</p></article>`,
    );
  }
  if (path === "/tienda")
    title = "Catálogo de vinilos y CDs · El Rinconcito del Rock";
  if (path === "/nosotros") title = "La tienda · El Rinconcito del Rock";
  if (
    path.startsWith("/admin") ||
    path.startsWith("/pedido/") ||
    path === "/favoritos"
  )
    html = html.replace(
      "<!--robots-->",
      '<meta name="robots" content="noindex,nofollow">',
    );
  return new Response(
    html
      .replace(
        "<title>El Rinconcito del Rock</title>",
        `<title>${escapeHtml(title)}</title>`,
      )
      .replace(
        "<!--seo-->",
        `<meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url.origin + path)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:url" content="${escapeHtml(url.origin + path)}"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>`,
      ),
    {
      status: index.status,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "no-cache",
      },
    },
  );
}
export default {
  async fetch(req, env, ctx) {
    let response: Response;
    try {
      response = new URL(req.url).pathname.startsWith("/api/")
        ? await api(req, env, ctx)
        : await page(req, env);
    } catch (e) {
      const expected = e instanceof HttpError;
      response = json(
        {
          error: expected
            ? e.message
            : "Ocurrió un problema. Inténtalo de nuevo.",
        },
        expected ? e.status : 500,
      );
      if (!expected)
        console.error(
          JSON.stringify({
            event: "request_error",
            path: new URL(req.url).pathname,
            error: e instanceof Error ? e.message : "unknown",
          }),
        );
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Permissions-Policy", "camera=(),microphone=(),geolocation=()");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-src https://www.openstreetmap.org; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    if (new URL(req.url).protocol === "https:")
      headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await expireReservations(env);
        await env.DB.prepare("DELETE FROM rate_limits WHERE reset_at < ?")
          .bind(Math.floor(Date.now() / 1000) - 86400)
          .run();
      })(),
    );
  },
} satisfies ExportedHandler<AppEnv>;
