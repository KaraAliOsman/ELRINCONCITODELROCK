import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Barcode,
  Check,
  Search,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  ScanLine,
} from "lucide-react";
import { api, ApiError } from "./api";
import { Cover } from "./components";
import { displayTitle, formatLabel, money, type Product } from "./types";

type Line = { p: Product; qty: number };
type Attempt = { key: string; body: string };
type Draft = {
  items: Line[];
  name: string;
  method: string;
  attempt: Attempt | null;
};
const draftKey = "rdr-register-v1";
function readDraft(): Draft {
  try {
    const d = JSON.parse(sessionStorage.getItem(draftKey) || "null");
    if (
      d &&
      Array.isArray(d.items) &&
      d.items.length <= 40 &&
      d.items.every(
        (i: Line) =>
          i.p?.id && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 20,
      )
    )
      return d;
  } catch {
    /* Storage is optional. */
  }
  return { items: [], name: "", method: "Efectivo", attempt: null };
}

export default function PointOfSale({
  changed,
}: {
  changed: (s: string) => void;
}) {
  const [initial] = useState(readDraft);
  const [items, setItems] = useState<Line[]>(initial.items);
  const lines = useRef(items);
  const [name, setName] = useState(initial.name);
  const [method, setMethod] = useState(initial.method);
  const [attempt, setAttempt] = useState<Attempt | null>(initial.attempt);
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{
    code: string;
    total: number;
    units: number;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const scanner = useRef<HTMLInputElement>(null);
  const scanQueue = useRef<string[]>([]);
  const processing = useRef(false);
  const saleLock = useRef(false);
  const locked = busy || !!attempt || !!receipt;
  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ items, name, method, attempt }),
      );
    } catch {
      /* Storage is optional. */
    }
  }, [items, name, method, attempt]);
  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      api<{ products: Product[] }>(
        "/api/products?limit=8&sort=artist&q=" + encodeURIComponent(q),
        { signal: ac.signal },
      )
        .then((r) => {
          setProducts(r.products);
          setSearchError("");
        })
        .catch((e) => {
          if (e.name !== "AbortError") setSearchError(e.message);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q, revision]);
  useEffect(() => {
    if (!initial.attempt) scanner.current?.focus();
  }, [initial.attempt]);
  function commit(next: Line[]) {
    lines.current = next;
    setItems(next);
  }
  function add(p: Product) {
    const current = lines.current;
    const line = current.find((i) => i.p.id === p.id);
    if (!p.active)
      throw new Error(
        "Este disco está oculto. Publícalo desde Inventario antes de venderlo.",
      );
    if (p.stock < 1) throw new Error(`${displayTitle(p.title)} está agotado.`);
    if ((line?.qty || 0) >= Math.min(p.stock, 20))
      throw new Error(
        `No puedes añadir más unidades de ${displayTitle(p.title)}. Disponibles: ${p.stock}; máximo por venta: 20.`,
      );
    if (!line && current.length >= 40)
      throw new Error("Puedes incluir hasta 40 títulos por venta.");
    commit(
      line
        ? current.map((i) => (i.p.id === p.id ? { p, qty: i.qty + 1 } : i))
        : [...current, { p, qty: 1 }],
    );
    setReady(false);
    setError("");
    setScanMessage(
      `${displayTitle(p.artist)} · ${displayTitle(p.title)} añadido`,
    );
  }
  function addManual(p: Product) {
    try {
      add(p);
    } catch (e) {
      setScanErrors((v) => [...v.slice(-4), (e as Error).message]);
    }
    scanner.current?.focus();
  }
  async function scan(e: FormEvent) {
    e.preventDefault();
    if (locked || saleLock.current) return;
    const code = scanner.current?.value.trim() || "";
    if (!code) return;
    scanner.current!.value = "";
    if (scanQueue.current.length >= 40) {
      setScanErrors((v) => [
        ...v.slice(-4),
        "Espera a que se procesen los códigos pendientes.",
      ]);
      return;
    }
    scanQueue.current.push(code);
    if (processing.current) return;
    processing.current = true;
    setScanning(true);
    try {
      while (scanQueue.current.length) {
        const next = scanQueue.current.shift()!;
        try {
          const p = await api<Product>(
            "/api/admin/barcodes?code=" + encodeURIComponent(next),
          );
          add(p);
        } catch (e) {
          setScanErrors((v) => [
            ...v.slice(-4),
            next + ": " + (e as Error).message,
          ]);
          setScanMessage("");
        }
      }
    } finally {
      processing.current = false;
      setScanning(false);
    }
  }
  function quantity(id: string, delta: number) {
    commit(
      lines.current
        .map((i) => (i.p.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );
    setReady(false);
    setError("");
    scanner.current?.focus();
  }
  const total = items.reduce((n, i) => n + i.p.price * i.qty, 0);
  const units = items.reduce((n, i) => n + i.qty, 0);
  async function sale(e: FormEvent) {
    e.preventDefault();
    if (
      saleLock.current ||
      processing.current ||
      !items.length ||
      scanErrors.length
    )
      return;
    if (!attempt && !ready) {
      setError("Confirma que recibiste el pago antes de registrar la venta.");
      return;
    }
    saleLock.current = true;
    setBusy(true);
    setError("");
    const next = attempt || {
      key: crypto.randomUUID(),
      body: JSON.stringify({
        items: items.map((i) => ({
          id: i.p.id,
          quantity: i.qty,
          expected_price: i.p.price,
        })),
        name: name.trim() || "Venta en tienda",
        notes: "Venta presencial · Medio: " + method,
        email: "",
        phone: "",
      }),
    };
    // Persist the exact request before sending. A network interruption can be
    // retried after reload without recording or discounting the sale twice.
    setAttempt(next);
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ items, name, method, attempt: next }),
      );
    } catch {
      /* Optional storage. */
    }
    try {
      const r = await api<{ code: string }>("/api/admin/sales", {
        method: "POST",
        headers: { "Idempotency-Key": next.key },
        body: next.body,
      });
      setReceipt({ ...r, total, units });
      commit([]);
      setAttempt(null);
      setReady(false);
      setName("");
      setRevision((n) => n + 1);
      setScanMessage("");
      changed("Venta " + r.code + " registrada. Inventario actualizado.");
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        setAttempt(null);
        setError(e.message);
      } else
        setError(
          "No pudimos confirmar la respuesta. Reintenta esta misma venta para comprobarla sin duplicar el cobro ni el descuento de stock.",
        );
    } finally {
      saleLock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Venta presencial</p>
          <h1>Caja</h1>
        </div>
        <span className="register-sync">
          <i />
          Inventario compartido con la web
        </span>
      </div>
      <div className="pos-grid">
        <section className="register-catalogue">
          <form
            className={`scanner-box ${locked ? "inactive" : ""}`}
            onSubmit={scan}
          >
            <label htmlFor="sale-barcode">
              <Barcode size={21} />
              Lector de códigos
            </label>
            <div>
              <input
                ref={scanner}
                id="sale-barcode"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={80}
                disabled={locked}
                placeholder="Escanea un disco o escribe su código"
                onFocus={() => setScanMessage("")}
              />
              <button
                className="button small"
                disabled={locked}
                aria-label="Añadir código"
              >
                <ArrowRight size={19} />
              </button>
            </div>
            <p>
              {scanning
                ? "Procesando códigos…"
                : "Lector USB o Bluetooth en modo teclado · Enter para añadir"}
            </p>
          </form>
          <div className="scan-feedback" role="status" aria-live="polite">
            {scanMessage && (
              <>
                <Check size={15} />
                {scanMessage}
              </>
            )}
          </div>
          {!!scanErrors.length && (
            <div className="scan-errors" role="alert">
              <strong>Revisa estos códigos</strong>
              {scanErrors.map((message, i) => (
                <p key={i}>{message}</p>
              ))}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setScanErrors([]);
                  scanner.current?.focus();
                }}
              >
                Entendido
              </button>
            </div>
          )}
          <div className="admin-search">
            <Search size={18} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por artista o álbum"
              type="search"
              aria-label="Buscar disco para venta"
              disabled={locked}
            />
          </div>
          {searchError && (
            <p className="error" role="alert">
              {searchError}
            </p>
          )}
          <div className="pos-products" aria-busy={loading}>
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => addManual(p)}
                disabled={locked || scanning}
                aria-label={`Añadir ${displayTitle(p.title)}`}
              >
                <div className="pos-art">
                  <Cover p={p} />
                </div>
                <div>
                  <span>{displayTitle(p.artist)}</span>
                  <strong>{displayTitle(p.title)}</strong>
                  <small>
                    {formatLabel(p)} · {p.stock} disponibles
                  </small>
                </div>
                <b>{money(p.price)}</b>
                <Plus size={18} />
              </button>
            ))}
            {!loading && !products.length && (
              <p className="pos-empty">
                No hay discos disponibles con esa búsqueda.
              </p>
            )}
          </div>
        </section>
        <form className="pos-checkout admin-box" onSubmit={sale}>
          {receipt ? (
            <div className="register-receipt" role="status">
              <div className="receipt-check">
                <Check size={28} />
              </div>
              <h2>Venta registrada</h2>
              <code>{receipt.code}</code>
              <strong>{money(receipt.total)}</strong>
              <p>
                {receipt.units}{" "}
                {receipt.units === 1
                  ? "unidad descontada"
                  : "unidades descontadas"}{" "}
                del inventario.
              </p>
              <button
                type="button"
                className="button full"
                onClick={() => {
                  setReceipt(null);
                  setError("");
                  requestAnimationFrame(() => scanner.current?.focus());
                }}
              >
                Nueva venta
                <Plus size={18} />
              </button>
            </div>
          ) : (
            <>
              <div className="register-heading">
                <h2>Venta actual</h2>
                <span>
                  {units} {units === 1 ? "disco" : "discos"}
                </span>
              </div>
              {items.length ? (
                <div className="pos-items">
                  {items.map(({ p, qty }) => (
                    <div key={p.id}>
                      <div>
                        <strong>{displayTitle(p.artist)}</strong>
                        <span>{displayTitle(p.title)}</span>
                        <small>
                          {formatLabel(p)} · {money(p.price)}
                        </small>
                      </div>
                      <div className="register-line-end">
                        <strong>{money(p.price * qty)}</strong>
                        <div className="quantity">
                          <button
                            type="button"
                            aria-label={`Quitar una unidad de ${displayTitle(p.title)}`}
                            onClick={() => quantity(p.id, -1)}
                            disabled={locked || scanning}
                          >
                            <Minus size={14} />
                          </button>
                          <span>{qty}</span>
                          <button
                            type="button"
                            aria-label={`Sumar una unidad de ${displayTitle(p.title)}`}
                            onClick={() => quantity(p.id, 1)}
                            disabled={
                              locked || scanning || qty >= Math.min(p.stock, 20)
                            }
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="register-empty">
                  <ScanLine size={35} strokeWidth={1.2} />
                  <p>Escanea el primer disco</p>
                  <span>También puedes añadirlo desde el buscador.</span>
                </div>
              )}
              {items.length > 0 && (
                <>
                  <fieldset disabled={locked}>
                    <details className="pos-customer">
                      <summary>Añadir cliente (opcional)</summary>
                      <label>
                        Cliente <span className="muted">(opcional)</span>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={120}
                          placeholder="Venta en tienda"
                        />
                      </label>
                    </details>
                    <label>
                      Medio de pago
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                      >
                        <option>Efectivo</option>
                        <option>Transferencia recibida</option>
                        <option>Tarjeta en terminal de tienda</option>
                      </select>
                    </label>
                  </fieldset>
                  <div className="pos-total">
                    <span>Total</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <label className="checkbox-label register-payment">
                    <input
                      type="checkbox"
                      checked={ready || !!attempt}
                      onChange={(e) => setReady(e.target.checked)}
                      disabled={locked || !items.length}
                    />
                    Pago recibido y verificado
                  </label>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    className="button full"
                    disabled={
                      !items.length ||
                      busy ||
                      scanning ||
                      !!scanErrors.length ||
                      (!attempt && !ready)
                    }
                  >
                    {busy
                      ? "Registrando…"
                      : attempt
                        ? "Comprobar y registrar venta"
                        : "Registrar venta"}
                    <Check size={18} />
                  </button>
                  <p className="register-stock-note">
                    El stock se descuenta al registrar la venta.
                  </p>
                  {items.length > 0 && !locked && (
                    <button
                      type="button"
                      className="text-link clear-sale"
                      onClick={() => {
                        commit([]);
                        setReady(false);
                        setError("");
                        setScanErrors([]);
                        scanner.current?.focus();
                      }}
                    >
                      <Trash2 size={14} />
                      Vaciar venta
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </form>
      </div>
    </>
  );
}
