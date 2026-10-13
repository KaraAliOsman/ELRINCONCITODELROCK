// End-to-end checks against the local Worker. Never runs against a public store.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import { getPlatformProxy } from "wrangler";
const base = process.env.TEST_URL || "http://127.0.0.1:8787";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Tests only run locally.",
);
const password =
  process.env.ADMIN_PASSWORD ||
  (await readFile(".dev.vars", "utf8"))
    .match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]
    ?.trim()
    .replace(/^"|"$/g, "");
assert.ok(password, "Local ADMIN_PASSWORD is required.");
const exec = promisify(execFile);
let cookie = "",
  passed = 0;
const fixtures = [];
const session = crypto.randomUUID().slice(0, 8);
async function call(
  path,
  { method = "GET", data, headers = {}, admin = false, raw } = {},
) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(admin ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: raw ?? (data ? JSON.stringify(data) : undefined),
  });
  const content = await res.text();
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    value = content;
  }
  return { status: res.status, value, headers: res.headers };
}
function ok(label) {
  passed++;
  console.log("PASS " + label);
}
async function sql(query) {
  return exec(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "rinconcito-db",
      "--local",
      "--command",
      query,
    ],
    { maxBuffer: 5e6, windowsHide: true },
  );
}
const input = (id, quantity = 1, extra = {}) => ({
  items: [{ id, quantity }],
  name: "Prueba local " + session,
  email: "prueba@example.invalid",
  phone: "+56911111111",
  delivery: "pickup",
  consent: true,
  ...extra,
});
async function reserve(payload, key = crypto.randomUUID()) {
  return call("/api/orders", {
    method: "POST",
    data: payload,
    headers: { "Idempotency-Key": key },
  });
}
async function product(title, stock = 2) {
  const r = await call("/api/admin/products", {
    method: "POST",
    admin: true,
    data: {
      artist: "QA " + session,
      title,
      format: "vinilo",
      language: "es",
      price: 15990,
      stock,
    },
  });
  assert.equal(r.status, 201);
  fixtures.push(r.value.id);
  return (await call("/api/products/" + r.value.id)).value;
}
async function get(id) {
  return (await call("/api/products/" + id)).value;
}
async function change(id, data) {
  return call("/api/admin/orders/" + id, {
    method: "PATCH",
    admin: true,
    data,
  });
}
try {
  await sql("DELETE FROM rate_limits");
  assert.equal((await call("/api/health")).status, 200);
  ok("Worker and D1 respond");
  assert.equal((await call("/")).status, 200);
  assert.equal((await call("/tienda")).status, 200);
  ok("Static routing has no redirect loop");
  assert.equal((await call("/api/admin/dashboard")).status, 401);
  ok("Administration requires authentication");
  assert.equal(
    (
      await call("/api/admin/login", {
        method: "POST",
        data: { password: "incorrect-password" },
      })
    ).status,
    401,
  );
  ok("Wrong password is rejected");
  const login = await call("/api/admin/login", {
    method: "POST",
    data: { password },
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  ok("Admin session is private");
  assert.equal(
    (
      await call("/api/admin/settings", {
        method: "PUT",
        admin: true,
        data: {},
        headers: { Origin: "https://another.invalid" },
      })
    ).status,
    403,
  );
  ok("Cross-origin mutation is rejected");
  const search = (await call("/api/products?q=prisioneros")).value;
  assert.ok(search.products.some((p) => p.artist.includes("PRISIONEROS")));
  assert.equal((await call("/api/products?page=1.5")).status, 400);
  assert.equal((await call("/api/products?q=" + "x".repeat(150))).status, 200);
  assert.equal(
    (
      await call("/api/admin/orders?q=" + encodeURIComponent("á".repeat(100)), {
        admin: true,
      })
    ).status,
    200,
  );
  ok("Search and pagination validation");
  const a = await product("PRECIO Y RESERVA", 3),
    b = await product("ULTIMA UNIDAD", 1);
  const key = crypto.randomUUID(),
    payload = input(a.id, 1, {
      items: [{ id: a.id, quantity: 1, price: 1, unit_price: 1 }],
      subtotal: 1,
    });
  const created = await reserve(payload, key);
  assert.equal(created.status, 201);
  const order = created.value;
  const privateOrder = await call("/api/orders/" + order.id, {
    headers: { Authorization: "Bearer " + order.token },
  });
  assert.equal(privateOrder.value.subtotal, 15990);
  assert.equal((await get(a.id)).stock, 2);
  ok("Server computes price and reserves stock");
  assert.equal((await call("/api/orders/" + order.id)).status, 404);
  assert.equal(
    (
      await call("/api/orders/" + order.id, {
        headers: { Authorization: "Bearer wrong" },
      })
    ).status,
    404,
  );
  ok("Orders require their private token");
  const duplicate = await reserve(payload, key);
  assert.equal(duplicate.value.id, order.id);
  assert.equal((await get(a.id)).stock, 2);
  assert.equal(
    (await reserve({ ...payload, name: "Cambio" }, key)).status,
    409,
  );
  ok("Idempotency prevents duplicate reservations");
  assert.equal(
    (
      await call("/api/admin/products/" + a.id, {
        method: "PATCH",
        admin: true,
        data: { ...a, stock: 7 },
      })
    ).status,
    409,
  );
  ok("Stale stock edits cannot overwrite a reservation");
  assert.equal((await change(order.id, { status: "confirmed" })).status, 400);
  ok("Confirmation requires a verified payment");
  assert.equal((await change(order.id, { status: "cancelled" })).status, 200);
  assert.equal((await get(a.id)).stock, 3);
  assert.equal(
    (
      await change(order.id, {
        status: "cancelled",
        admin_notes: "Cancelación repetida",
      })
    ).status,
    200,
  );
  assert.equal((await get(a.id)).stock, 3);
  ok("Cancellation restores inventory exactly once");
  const competing = await Promise.all([
    reserve(input(b.id)),
    reserve(input(b.id)),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await get(b.id)).stock, 0);
  ok("Concurrent buyers cannot oversell the last copy");
  const winner = competing.find((r) => r.status === 201).value;
  assert.equal(
    (await change(winner.id, { status: "confirmed", payment_status: "paid" }))
      .status,
    200,
  );
  assert.equal((await change(winner.id, { status: "cancelled" })).status, 400);
  assert.equal(
    (
      await change(winner.id, {
        status: "cancelled",
        payment_status: "refunded",
      })
    ).status,
    200,
  );
  assert.equal((await get(b.id)).stock, 1);
  ok("Paid cancellation requires a refund");
  const expiring = await reserve(input(a.id));
  assert.equal(expiring.status, 201);
  await sql(
    "UPDATE orders SET expires_at='2000-01-01T00:00:00.000Z' WHERE id='" +
      expiring.value.id +
      "'",
  );
  const expired = await call("/api/orders/" + expiring.value.id, {
    headers: { Authorization: "Bearer " + expiring.value.token },
  });
  assert.equal(expired.value.status, "expired");
  assert.equal((await get(a.id)).stock, 3);
  await call("/api/admin/dashboard", { admin: true });
  assert.equal((await get(a.id)).stock, 3);
  ok("Expired reservations release stock once");
  // Force a trigger failure after a valid line inside one D1 batch/transaction.
  const transactionId = "qa-rollback-" + session;
  const proxy = await getPlatformProxy({ configPath: "wrangler.jsonc" });
  try {
    const db = proxy.env.DB;
    await assert.rejects(
      db.batch([
        db
          .prepare(
            "INSERT INTO orders(id,code,token,idempotency_key,request_hash,customer_name,email,phone,delivery,subtotal,expires_at) VALUES(?,?,?,?,?,'QA','','','pickup',15990,'2099-01-01')",
          )
          .bind(
            transactionId,
            transactionId,
            transactionId,
            transactionId,
            "hash",
          ),
        db
          .prepare(
            "INSERT INTO order_items VALUES(?,?,'QA','QA','vinilo',1,15990)",
          )
          .bind(transactionId, a.id),
        db
          .prepare(
            "INSERT INTO order_items VALUES(?,?,'QA','QA','vinilo',20,15990)",
          )
          .bind(transactionId, b.id),
      ]),
      /INSUFFICIENT_STOCK/,
    );
    assert.equal(
      await db
        .prepare("SELECT id FROM orders WHERE id=?")
        .bind(transactionId)
        .first(),
      null,
    );
  } finally {
    await proxy.dispose();
  }
  assert.equal((await get(a.id)).stock, 3);
  ok("Failed D1 batch rolls back order and earlier stock changes");
  const ship = await reserve(
    input(a.id, 1, {
      delivery: "shipping",
      address: "Dirección de prueba 111",
      city: "Concepción",
      region: "Biobío",
    }),
  );
  assert.equal(ship.status, 201);
  assert.equal(
    (
      await change(ship.value.id, {
        status: "confirmed",
        payment_status: "paid",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await change(ship.value.id, {
        status: "confirmed",
        payment_status: "paid",
        shipping_cost: 5000,
        tracking: "QA-123",
      })
    ).status,
    200,
  );
  assert.equal(
    (await change(ship.value.id, { status: "shipped" })).status,
    200,
  );
  assert.equal(
    (await change(ship.value.id, { status: "completed" })).status,
    200,
  );
  assert.equal(
    (await change(ship.value.id, { admin_notes: "Notas actualizadas" })).status,
    200,
  );
  const shipped = (
    await call("/api/admin/orders/" + ship.value.id, { admin: true })
  ).value;
  assert.equal(shipped.tracking, "QA-123");
  assert.equal(shipped.shipping_cost, 5000);
  ok("Shipping cost, delivery states and closed-order notes");
  const fresh = await get(a.id);
  const imported = await call("/api/admin/import", {
    method: "POST",
    admin: true,
    data: {
      rows: [
        { id: a.id, price: 17000, stock: 5, version: fresh.version },
        { id: b.id, price: 17000, stock: 5, version: 1 },
      ],
    },
  });
  assert.equal(imported.value.updated, 1);
  assert.equal((await get(a.id)).price, 17000);
  assert.equal((await get(b.id)).stock, 1);
  assert.equal(
    (
      await call("/api/admin/import", {
        method: "POST",
        admin: true,
        data: {
          rows: Array.from({ length: 21 }, (_, i) => ({
            id: "qa-limit-" + i,
            price: 1000,
            stock: 0,
            version: 1,
          })),
        },
      })
    ).status,
    400,
  );
  ok("CSV import preserves concurrent inventory changes");
  const formula = await product('=HYPERLINK("bad")', 0);
  const exported = await call("/api/admin/export", { admin: true });
  assert.ok(exported.value.includes("\"'=HYPERLINK"));
  ok("CSV export neutralizes spreadsheet formulas");
  const photo = await readFile("public/assets/logo.jpg");
  const uploaded = await call("/api/admin/images", {
    method: "POST",
    admin: true,
    raw: photo,
    headers: { "Content-Type": "image/jpeg" },
  });
  assert.equal(uploaded.status, 201);
  const image = await fetch(base + uploaded.value.url);
  assert.equal(image.status, 200);
  const returned = Buffer.from(await image.arrayBuffer());
  assert.equal(returned.length, photo.length);
  assert.ok(returned.equals(photo));
  ok("Product photos upload and return intact");
  const request = await call("/api/requests", {
    method: "POST",
    data: {
      name: "QA " + session,
      email: "prueba@example.invalid",
      artist: "QA artist",
      title: "QA title",
      consent: true,
    },
  });
  assert.equal(request.status, 201);
  const requests = (await call("/api/admin/requests", { admin: true })).value
    .requests;
  assert.ok(requests.some((r) => r.id === request.value.id));
  assert.equal(
    (
      await call("/api/admin/requests/" + request.value.id, {
        method: "PATCH",
        admin: true,
        data: { status: "closed" },
      })
    ).status,
    200,
  );
  ok("Special disc requests reach the private panel");
  const pos = await call("/api/admin/sales", {
    method: "POST",
    admin: true,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      items: [{ id: a.id, quantity: 1 }],
      name: "QA mostrador",
      notes: "Prueba de pago recibido",
    },
  });
  assert.equal(pos.status, 201);
  assert.equal(
    (await call("/api/admin/orders/" + pos.value.id, { admin: true })).value
      .status,
    "completed",
  );
  ok("In-store sales update the same inventory");
  await call("/api/admin/logout", { method: "POST", data: {}, admin: true });
  cookie = "";
  assert.equal((await call("/api/admin/session", { admin: true })).status, 401);
  ok("Logout removes the session");
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/runtime.json",
    JSON.stringify(
      {
        passed,
        at: new Date().toISOString(),
        environment: "local Worker + D1",
      },
      null,
      2,
    ),
  );
  console.log(passed + " integration checks passed.");
} finally {
  // Local fixtures only. Keep their records for examining the test, hide products.
  if (fixtures.length)
    await sql(
      "UPDATE products SET active=0,stock=0 WHERE id IN (" +
        fixtures.map((id) => "'" + id + "'").join(",") +
        ")",
    );
}
