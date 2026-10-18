import { useEffect, useState, type FormEvent } from "react";
import {
  LayoutDashboard,
  Disc3,
  ShoppingBag,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  LogOut,
  Package,
  RefreshCw,
  Download,
  Upload,
  Check,
  X,
  Store,
  MessageSquare,
  LockKeyhole,
  ArrowRight,
  FileSpreadsheet,
  Camera,
  ChevronLeft,
  ChevronRight,
  Mail,
  Printer,
} from "lucide-react";
import { api } from "./api";
import { Cover, Empty, Loading, Logo, Modal } from "./components";
import {
  IMPORT_BATCH_SIZE,
  displayTitle,
  money,
  statusName,
  type Product,
  type Order,
  type StoreSettings,
} from "./types";
import "./admin.css";
import PointOfSale from "./PointOfSale";
import { Barcode, BarcodeLabels } from "./Barcodes";
type AdminProps = { onExit: () => void; onStoreChange: () => void };
type Tab =
  "dashboard" | "orders" | "products" | "sales" | "requests" | "settings";
type DashboardData = {
  orders: {
    total: number;
    pending: number;
    paid_orders: number;
    revenue: number;
  };
  inventory: {
    products: number;
    available: number;
    units: number;
    low_stock: number;
  };
  requests: { count: number };
  sales: { date: string; revenue: number }[];
};
function useData<T>(url: string, revision = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    api<T>(url, { signal: ac.signal })
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [url, revision]);
  return { data, error, loading };
}
export default function Admin({ onExit, onStoreChange }: AdminProps) {
  const [logged, setLogged] = useState<boolean | null>(null),
    [password, setPassword] = useState(""),
    [loginError, setLoginError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("dashboard"),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<DashboardData | null>(null);
  useEffect(() => {
    document.title = "Administración · El Rinconcito del Rock";
    api("/api/admin/session")
      .then(() => setLogged(true))
      .catch(() => setLogged(false));
  }, []);
  useEffect(() => {
    if (!logged) return;
    const refresh = () => {
      api<DashboardData>("/api/admin/dashboard")
        .then(setSummary)
        .catch(() => {
          /* Next action shows an expired session. */
        });
    };
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [logged, revision]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setLogged(true);
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    setLogged(false);
    setSummary(null);
  }
  function changed(message: string) {
    setNotice(message);
    setRevision((r) => r + 1);
    onStoreChange();
  }
  const tabs: { id: Tab; label: string; icon: typeof Disc3 }[] = [
    { id: "dashboard", label: "Vista general", icon: LayoutDashboard },
    { id: "orders", label: "Pedidos", icon: ShoppingBag },
    { id: "products", label: "Inventario", icon: Disc3 },
    { id: "sales", label: "Caja", icon: Store },
    { id: "requests", label: "Solicitudes", icon: MessageSquare },
    { id: "settings", label: "Configuración", icon: Settings },
  ];
  if (logged === null) return <Loading />;
  if (!logged)
    return (
      <div className="admin-login">
        <div className="login-brand">
          <Logo />
          <button className="text-link" onClick={onExit}>
            Ver tienda <ArrowUpRight size={15} />
          </button>
        </div>
        <form onSubmit={login}>
          <LockKeyhole size={31} strokeWidth={1.3} />
          <p className="eyebrow">Acceso privado</p>
          <h1>Administración</h1>
          <label>
            Contraseña de administración
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={500}
            />
          </label>
          {loginError && (
            <div className="error" role="alert">
              {loginError}
            </div>
          )}
          <button className="button red full" disabled={busy}>
            {busy ? "Comprobando acceso…" : "Ingresar"}
            <ArrowRight size={18} />
          </button>
          <small>
            Sesión privada de 8 horas. Cierra la sesión en equipos compartidos.
          </small>
        </form>
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Logo />
        <span className="admin-label">ADMINISTRACIÓN</span>
        <nav aria-label="Panel de administración">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => {
                setTab(t.id);
                setNotice("");
              }}
            >
              <t.icon size={18} />
              {t.label}
              {t.id === "orders" && !!summary?.orders.pending && (
                <b>{summary.orders.pending}</b>
              )}
              {t.id === "requests" && !!summary?.requests.count && (
                <b>{summary.requests.count}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <button className="text-link" onClick={onExit}>
            Ver tienda <ArrowUpRight size={15} />
          </button>
          <button className="text-link" onClick={() => void logout()}>
            <LogOut size={15} /> Cerrar sesión
          </button>
          <span>EL RINCONCITO DEL ROCK</span>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <span className="eyebrow">El Rinconcito del Rock</span>
          <div>
            <span className="admin-online">
              <i /> SESIÓN PRIVADA
            </span>
            <button
              className="icon-button"
              aria-label="Actualizar datos"
              onClick={() => setRevision((r) => r + 1)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        {notice && (
          <div className="admin-notice" role="status">
            <Check size={16} />
            {notice}
            <button
              className="icon-button"
              onClick={() => setNotice("")}
              aria-label="Cerrar notificación"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="admin-page">
          {tab === "dashboard" ? (
            <Dashboard data={summary} onTab={setTab} />
          ) : tab === "products" ? (
            <Inventory revision={revision} changed={changed} />
          ) : tab === "orders" ? (
            <Orders revision={revision} changed={changed} />
          ) : tab === "sales" ? (
            <PointOfSale changed={changed} />
          ) : tab === "requests" ? (
            <Requests revision={revision} changed={changed} />
          ) : (
            <Configuration revision={revision} changed={changed} />
          )}
        </div>
      </div>
    </div>
  );
}
function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="admin-header-buttons">{children}</div>
    </div>
  );
}
function Dashboard({
  data,
  onTab,
}: {
  data: DashboardData | null;
  onTab: (t: Tab) => void;
}) {
  if (!data) return <Loading />;
  const max = Math.max(1, ...data.sales.map((s) => s.revenue));
  return (
    <>
      <PageHeader eyebrow="Administración" title="Resumen" />
      <div className="dashboard-stats">
        <div className="stat-card highlight">
          <ShoppingBag size={19} />
          <span>Pedidos por confirmar</span>
          <strong>{data.orders.pending || 0}</strong>
          <button onClick={() => onTab("orders")}>
            Revisar pedidos <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="stat-card">
          <Store size={19} />
          <span>Ventas registradas</span>
          <strong>{money(data.orders.revenue || 0)}</strong>
          <small>
            {data.orders.paid_orders || 0} pedidos pagados · histórico
          </small>
        </div>
        <div className="stat-card">
          <Disc3 size={19} />
          <span>Discos disponibles</span>
          <strong>{(data.inventory.units || 0).toLocaleString("es-CL")}</strong>
          <small>{data.inventory.available} títulos con stock</small>
        </div>
        <div className="stat-card">
          <MessageSquare size={19} />
          <span>Discos por buscar</span>
          <strong>{data.requests.count || 0}</strong>
          <button onClick={() => onTab("requests")}>
            Ver búsquedas <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
      <div className="dashboard-columns">
        <section className="admin-box">
          <div className="admin-box-head">
            <h2>Ventas</h2>
            <span>ÚLTIMOS 30 DÍAS</span>
          </div>
          {data.sales.length ? (
            <div
              className="sales-chart"
              role="img"
              aria-label="Ventas registradas por día en los últimos 30 días"
            >
              {data.sales.map((s) => (
                <div key={s.date} title={`${s.date}: ${money(s.revenue)}`}>
                  <strong>{money(s.revenue)}</strong>
                  <i
                    style={{
                      height: Math.max(8, (s.revenue / max) * 140) + "px",
                    }}
                  />
                  <span>{s.date.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="chart-empty">
              <Disc3 size={42} strokeWidth={1} />
              <p>Aún no hay ventas registradas.</p>
              <small>
                Los pedidos pagados y las ventas en tienda aparecen aquí.
              </small>
            </div>
          )}
        </section>
        <section className="admin-box">
          <div className="admin-box-head">
            <h2>Gestión de la tienda</h2>
          </div>
          <div className="admin-task">
            <Package size={20} />
            <div>
              <strong>
                {data.inventory.low_stock} títulos con una unidad o menos
              </strong>
              <p>Revisa reposiciones y discos agotados.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Abrir inventario"
              onClick={() => onTab("products")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="admin-task">
            <Store size={20} />
            <div>
              <strong>Registrar una venta presencial</strong>
              <p>Descuenta el stock y deja el registro.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Abrir venta en tienda"
              onClick={() => onTab("sales")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="admin-task">
            <Settings size={20} />
            <div>
              <strong>Datos de la tienda</strong>
              <p>Contacto, horarios y entregas.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Abrir configuración"
              onClick={() => onTab("settings")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
        </section>
      </div>
      <div className="admin-explanation">
        <Check size={18} />
        <p>
          Las reservas descuentan el stock disponible y se liberan al vencer.
          Los ingresos incluyen solo pagos registrados; los pedidos pendientes
          no cuentan como ventas.
        </p>
      </div>
    </>
  );
}
function Inventory({
  revision,
  changed,
}: {
  revision: number;
  changed: (s: string) => void;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Product | null>(null),
    [create, setCreate] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [selected, setSelected] = useState<Record<string, Product>>({}),
    [labelsOpen, setLabelsOpen] = useState(false);
  const { data, error, loading } = useData<{
    products: Product[];
    total: number;
  }>(
    "/api/admin/products?limit=25&sort=artist&q=" +
      encodeURIComponent(q) +
      "&page=" +
      page,
    revision,
  );
  return (
    <>
      <PageHeader eyebrow="Catálogo, precios y stock" title="Inventario">
        <button
          className="button outline small"
          disabled={!Object.keys(selected).length}
          onClick={() => setLabelsOpen(true)}
        >
          <Printer size={16} />
          Etiquetas
          {Object.keys(selected).length
            ? ` (${Object.keys(selected).length})`
            : ""}
        </button>
        <a
          className="button outline small"
          href="/api/admin/export?type=products"
        >
          <Download size={16} /> Exportar CSV
        </a>
        <button
          className="button outline small"
          onClick={() => setImportOpen(true)}
        >
          <Upload size={16} /> Actualizar CSV
        </button>
        <button className="button red small" onClick={() => setCreate(true)}>
          <Plus size={16} /> Nuevo disco
        </button>
      </PageHeader>
      <div className="admin-search">
        <Search size={18} />
        <input
          type="search"
          aria-label="Buscar en inventario"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Artista, álbum o código de barras"
        />
        <span>{data?.total.toLocaleString("es-CL")} PRODUCTOS</span>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar página para etiquetas"
                    checked={
                      !!data?.products.length &&
                      data.products.every((p) => !!selected[p.id])
                    }
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelected((s) => {
                        const next = { ...s };
                        data?.products.forEach((p) => {
                          if (checked) next[p.id] = p;
                          else delete next[p.id];
                        });
                        return next;
                      });
                    }}
                  />
                </th>
                <th>Disco</th>
                <th>Formato</th>
                <th>Precio</th>
                <th>Disponible</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.products.map((p) => (
                <tr key={p.id}>
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${displayTitle(p.title)} para etiquetas`}
                      checked={!!selected[p.id]}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((s) => {
                          const next = { ...s };
                          if (checked) next[p.id] = p;
                          else delete next[p.id];
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td>
                    <div className="inventory-disc">
                      <div className="table-art">
                        <Cover p={p} />
                      </div>
                      <div>
                        <strong>{displayTitle(p.artist)}</strong>
                        <span>{displayTitle(p.title)}</span>
                        <small>
                          {p.barcode || p.id} {p.featured ? "· DESTACADO" : ""}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{p.content}</td>
                  <td>{money(p.price)}</td>
                  <td>
                    <span className={`stock-badge ${p.stock < 2 ? "low" : ""}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td>
                    <span
                      className={"state-badge " + (p.active ? "" : "muted")}
                    >
                      {p.active ? "Publicado" : "Oculto"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() => setEdit(p)}
                      aria-label={`Editar ${p.title}`}
                    >
                      Editar <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.products.length && (
            <Empty title="No encontramos productos con ese nombre." />
          )}
        </div>
      )}
      <div className="table-pagination">
        <span>
          El stock mostrado es el disponible, sin las unidades reservadas.
        </span>
        <div>
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil((data?.total || 0) / 25))}
          </span>
          <button
            disabled={page >= Math.ceil((data?.total || 0) / 25)}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Página siguiente"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {!!Object.keys(selected).length && (
        <div className="inventory-selection">
          <span>{Object.keys(selected).length} títulos seleccionados</span>
          <button className="text-link" onClick={() => setSelected({})}>
            Quitar selección
          </button>
        </div>
      )}
      {labelsOpen && (
        <Modal
          title="Imprimir códigos de barras"
          onClose={() => setLabelsOpen(false)}
          wide
        >
          <BarcodeLabels products={Object.values(selected)} />
        </Modal>
      )}
      {(edit || create) && (
        <Modal
          title={
            edit ? "EDITAR DISCO / INVENTARIO" : "NUEVO DISCO / INVENTARIO"
          }
          onClose={() => {
            setEdit(null);
            setCreate(false);
          }}
          wide
        >
          <ProductEditor
            p={edit}
            onSave={() => {
              setEdit(null);
              setCreate(false);
              setSelected({});
              changed("Disco guardado. Inventario actualizado.");
            }}
          />
        </Modal>
      )}
      {importOpen && (
        <Modal
          title="ACTUALIZAR INVENTARIO / CSV"
          onClose={() => setImportOpen(false)}
          wide
        >
          <InventoryImport
            onDone={(message) => {
              setImportOpen(false);
              changed(message);
            }}
          />
        </Modal>
      )}
    </>
  );
}
function ProductEditor({
  p,
  onSave,
}: {
  p: Product | null;
  onSave: () => void;
}) {
  const [image, setImage] = useState(p?.image || ""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Usa una foto JPG, PNG o WebP.");
      if (file.size > 20000000)
        throw new Error("La foto es demasiado grande (máximo 20 MB).");
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("No pudimos procesar la imagen.")),
          "image/webp",
          0.82,
        ),
      );
      if (blob.size > 524288)
        throw new Error(
          "La foto procesada supera 512 KB. Prueba con una imagen menor.",
        );
      const result = await api<{ url: string }>("/api/admin/images", {
        method: "POST",
        body: blob,
        headers: { "Content-Type": "image/webp" },
      });
      setImage(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const b = {
      artist: f.get("artist"),
      title: f.get("title"),
      price: Number(f.get("price")),
      stock: Number(f.get("stock")),
      description: f.get("description"),
      category: f.get("category"),
      featured: f.get("featured") === "on",
      active: f.get("active") === "on",
      image,
      version: p?.version,
      format: f.get("format"),
      content: f.get("content"),
      language: f.get("language"),
      retail_barcode: f.get("retail_barcode"),
    };
    try {
      await api(p ? "/api/admin/products/" + p.id : "/api/admin/products", {
        method: p ? "PATCH" : "POST",
        body: JSON.stringify(b),
      });
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="product-editor" onSubmit={save}>
      <div className="editor-columns">
        <div className="editor-image">
          <div className="editor-preview">
            {image ? (
              <img src={image} alt="Imagen del producto" />
            ) : (
              <Disc3 size={72} strokeWidth={1} />
            )}
          </div>
          <label className="button outline full photo-upload">
            <Camera size={17} />
            {uploading ? "Guardando foto…" : "Subir foto del ejemplar"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void upload(e.target.files?.[0])}
              disabled={uploading}
            />
          </label>
          <label>
            O pega una URL de imagen
            <input
              type="url"
              value={image.startsWith("https:") ? image : ""}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://…"
            />
          </label>
          {image && (
            <button
              type="button"
              className="text-link"
              onClick={() => setImage("")}
            >
              Quitar imagen <X size={13} />
            </button>
          )}
          <small>
            JPG, PNG o WebP. La foto se optimiza y guarda en la tienda. Usa
            fotos del ejemplar o carátulas que tengas autorización de usar.
          </small>
          {p?.barcode && (
            <div className="editor-barcode">
              <Barcode code={p.barcode} />
              <code>{p.barcode}</code>
              <span>Código interno · Code 128</span>
            </div>
          )}
        </div>
        <div className="editor-fields">
          <label>
            Artista
            <input
              name="artist"
              defaultValue={p?.artist}
              required
              maxLength={200}
            />
          </label>
          <label>
            Álbum
            <input
              name="title"
              defaultValue={p?.title}
              required
              maxLength={300}
            />
          </label>
          {!p && (
            <div className="form-row">
              <label>
                Formato
                <select name="format">
                  <option value="vinilo">Vinilo</option>
                  <option value="cd">CD</option>
                </select>
              </label>
              <label>
                Contenido
                <input
                  name="content"
                  placeholder="1 VIN / 2 CD…"
                  maxLength={40}
                />
              </label>
            </div>
          )}
          {!p && (
            <label>
              Idioma
              <select name="language">
                <option value="es">En español</option>
                <option value="en">Internacional</option>
              </select>
            </label>
          )}
          <div className="form-row">
            <label>
              Precio (CLP)
              <input
                type="number"
                name="price"
                defaultValue={p?.price}
                required
                min={1}
                max={20000000}
              />
            </label>
            <label>
              Unidades disponibles
              <input
                type="number"
                name="stock"
                defaultValue={p?.stock || 0}
                required
                min={0}
                max={100000}
              />
            </label>
          </div>
          <label>
            EAN / UPC de fábrica <span className="muted">(opcional)</span>
            <input
              name="retail_barcode"
              defaultValue={p?.retail_barcode || ""}
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              pattern="[0-9]{8}|[0-9]{12,14}"
              placeholder="Escanea el código original del disco"
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
            <small className="field-hint">
              Para ediciones con el mismo EAN, utiliza sus códigos internos.
            </small>
          </label>
          <label>
            Selección
            <select
              name="category"
              defaultValue={p?.category || "Rock & metal"}
            >
              {[
                "Rock & metal",
                "Rock chileno",
                "En español",
                "Internacional",
                "Otros",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Detalles del ejemplar / edición
            <textarea
              name="description"
              defaultValue={p?.description || ""}
              rows={3}
              maxLength={2000}
              placeholder="Solo detalles que hayas confirmado: edición, condición, presentación…"
            />
          </label>
          <div className="editor-flags">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={!!p?.featured}
              />{" "}
              Destacar en la portada
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="active"
                defaultChecked={p ? !!p.active : true}
              />{" "}
              Publicado en la tienda
            </label>
          </div>
          {p && (
            <p className="editor-source">
              Origen: {p.source}
              <br />
              SKU: {p.id} · Los cambios de stock se registran.
            </p>
          )}
          {p && <StockHistory id={p.id} />}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button red full" disabled={busy || uploading}>
        {busy ? "Guardando…" : "Guardar disco"}
        <Check size={18} />
      </button>
    </form>
  );
}
function StockHistory({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { data, error } = useData<{
    movements: {
      id: number;
      delta: number;
      reason: string;
      created_at: string;
      order_code: string | null;
    }[];
  }>("/api/admin/products/" + id + "/movements");
  return (
    <details
      className="stock-history"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Movimientos de inventario</summary>
      {error ? (
        <p className="error">{error}</p>
      ) : data?.movements.length ? (
        <div>
          {data.movements.map((m) => (
            <div key={m.id}>
              <strong className={m.delta > 0 ? "positive" : ""}>
                {m.delta > 0 ? "+" : ""}
                {m.delta}
              </strong>
              <span>
                {m.reason}
                {m.order_code && <code>{m.order_code}</code>}
                <small>
                  {new Date(m.created_at).toLocaleString("es-CL", {
                    timeZone: "America/Santiago",
                  })}
                </small>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="field-hint">Sin movimientos desde la carga inicial.</p>
      )}
    </details>
  );
}
function parseCsv(s: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (quoted) throw new Error("Hay una comilla sin cerrar en el CSV.");
  return rows;
}
function InventoryImport({ onDone }: { onDone: (s: string) => void }) {
  const [rows, setRows] = useState<
      { id: string; price: number; stock: number; version: number }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  async function file(f?: File) {
    if (!f) return;
    setError("");
    try {
      if (f.size > 10000000) throw new Error("El CSV supera 10 MB.");
      const parsed = parseCsv((await f.text()).replace(/^\uFEFF/, ""));
      const headers = parsed.shift()!.map((h) => h.trim().toLowerCase());
      const indices = ["id", "price", "stock", "version"].map((k) =>
        headers.indexOf(k),
      );
      if (indices.some((i) => i < 0))
        throw new Error(
          "Usa el archivo exportado desde este panel. Debe incluir id, price, stock y version.",
        );
      const data = parsed.map((r) => ({
        id: r[indices[0]],
        price: Number(r[indices[1]]),
        stock: Number(r[indices[2]]),
        version: Number(r[indices[3]]),
      }));
      const ids = new Set<string>();
      for (const r of data) {
        if (
          !r.id ||
          ids.has(r.id) ||
          !Number.isSafeInteger(r.stock) ||
          r.stock < 0 ||
          !Number.isSafeInteger(r.price) ||
          r.price < 1 ||
          !Number.isSafeInteger(r.version) ||
          r.version < 1
        )
          throw new Error("Hay IDs repetidos, precios o cantidades inválidos.");
        ids.add(r.id);
      }
      if (data.length > 10000)
        throw new Error("Importa hasta 10.000 filas por archivo.");
      setRows(data);
    } catch (e) {
      setRows([]);
      setError((e as Error).message);
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    let updated = 0,
      processed = 0;
    try {
      for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
        const r = await api<{ updated: number }>("/api/admin/import", {
          method: "POST",
          body: JSON.stringify({ rows: rows.slice(i, i + IMPORT_BATCH_SIZE) }),
        });
        updated += r.updated;
        processed += Math.min(IMPORT_BATCH_SIZE, rows.length - i);
        setProgress(processed);
      }
      onDone(
        `${updated} productos actualizados. ${rows.length - updated} filas sin actualizar porque el stock cambió o el SKU no existe.`,
      );
    } catch (e) {
      setError(
        `Se procesaron ${processed} filas y se actualizaron ${updated}. ${(e as Error).message} Exporta un CSV nuevo antes de volver a importar.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inventory-import">
      <h2>Tu stock, desde Excel.</h2>
      <p>
        Exporta el CSV, ábrelo en Excel y modifica <strong>price</strong> y{" "}
        <strong>stock</strong>. Conserva <strong>id</strong> y{" "}
        <strong>version</strong>. Si entra una reserva mientras editas, esa fila
        no se sobrescribe.
      </p>
      <label className="csv-upload">
        <FileSpreadsheet size={30} />
        <span>Seleccionar CSV de inventario</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void file(e.target.files?.[0])}
          disabled={busy}
        />
      </label>
      {rows.length > 0 && (
        <>
          <p>
            <strong>{rows.length} filas listas para actualizar.</strong> Se
            actualizan precios y unidades disponibles.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Precio</th>
                  <th>Disponible</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 7).map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{money(r.price)}</td>
                    <td>{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button
        className="button red full"
        disabled={!rows.length || busy}
        onClick={() => void apply()}
      >
        {busy
          ? `Actualizando ${progress} de ${rows.length}…`
          : "Aplicar actualización de stock y precios"}
        <Check size={18} />
      </button>
    </div>
  );
}
function Orders({
  revision,
  changed,
}: {
  revision: number;
  changed: (s: string) => void;
}) {
  const [status, setStatus] = useState(""),
    [q, setQ] = useState(""),
    [id, setId] = useState<string | null>(null);
  const { data, error, loading } = useData<{ orders: Order[] }>(
    "/api/admin/orders?status=" + status + "&q=" + encodeURIComponent(q),
    revision,
  );
  return (
    <>
      <PageHeader eyebrow="Ventas y reservas" title="Pedidos">
        <a
          className="button outline small"
          href="/api/admin/export?type=orders"
        >
          <Download size={16} /> Exportar pedidos
        </a>
      </PageHeader>
      <div className="orders-controls">
        <div className="admin-search">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código de pedido o cliente"
            aria-label="Buscar pedidos"
            type="search"
          />
        </div>
        <select
          aria-label="Filtrar estado de pedidos"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(statusName).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Entrega</th>
                <th>Discos</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.code}</strong>
                    <small>
                      {new Date(o.created_at).toLocaleDateString("es-CL", {
                        timeZone: "America/Santiago",
                      })}
                    </small>
                  </td>
                  <td>{o.customer_name}</td>
                  <td>
                    {o.channel === "store"
                      ? "Venta en local"
                      : o.delivery === "pickup"
                        ? "Retiro"
                        : "Despacho"}
                  </td>
                  <td>
                    {money(o.subtotal)}
                    <small>
                      {o.payment_status === "paid"
                        ? "PAGO REGISTRADO"
                        : o.payment_status === "refunded"
                          ? "REEMBOLSADO"
                          : "SIN PAGO REGISTRADO"}
                    </small>
                  </td>
                  <td>
                    <span className={"state-badge status-" + o.status}>
                      {statusName[o.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() => setId(o.id)}
                      aria-label={`Ver pedido ${o.code}`}
                    >
                      Abrir <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.orders.length && (
            <Empty title="No hay pedidos.">
              <p>Los pedidos de la tienda aparecerán aquí.</p>
            </Empty>
          )}
        </div>
      )}
      {id && (
        <Modal title="GESTIONAR PEDIDO" onClose={() => setId(null)} wide>
          <OrderEditor
            id={id}
            onSave={() => {
              setId(null);
              changed(
                "Pedido actualizado. El cliente puede ver el nuevo estado.",
              );
            }}
          />
        </Modal>
      )}
    </>
  );
}
function OrderEditor({ id, onSave }: { id: string; onSave: () => void }) {
  const { data: o, error } = useData<Order>("/api/admin/orders/" + id);
  const [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState(""),
    [target, setTarget] = useState(""),
    [paid, setPaid] = useState(false),
    [refund, setRefund] = useState(false);
  useEffect(() => {
    if (o) {
      setTarget(o.status);
      setPaid(o.payment_status === "paid");
    }
  }, [o]);
  const transitions: Record<string, string[]> = {
    pending: ["pending", "confirmed", "cancelled"],
    confirmed: ["confirmed", "ready", "shipped", "cancelled"],
    ready: ["ready", "completed", "cancelled"],
    shipped: ["shipped", "completed"],
    completed:
      o?.channel === "store" ? ["completed", "cancelled"] : ["completed"],
    cancelled: ["cancelled"],
    expired: ["expired"],
  };
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!o) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setSaveError("");
    try {
      await api("/api/admin/orders/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          status: target,
          payment_status: refund
            ? "refunded"
            : paid
              ? "paid"
              : o.payment_status,
          shipping_cost:
            o.delivery === "pickup"
              ? 0
              : f.has("shipping_cost")
                ? String(f.get("shipping_cost")).trim() === ""
                  ? null
                  : Number(f.get("shipping_cost"))
                : o.shipping_cost,
          tracking: f.has("tracking") ? f.get("tracking") : o.tracking,
          admin_notes: f.get("admin_notes") || "",
        }),
      });
      onSave();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <p className="error">{error}</p>;
  if (!o) return <Loading />;
  const closed =
    ["cancelled", "expired"].includes(o.status) ||
    (o.status === "completed" && o.channel !== "store");
  return (
    <form className="order-editor" onSubmit={save}>
      <div className="order-editor-heading">
        <h2>{o.code}</h2>
        <span className="state-badge">{statusName[o.status]}</span>
      </div>
      <div className="order-editor-columns">
        <div>
          <h3>Cliente y entrega</h3>
          <div className="customer-data">
            <strong>{o.customer_name}</strong>
            <a href={"mailto:" + o.email}>
              {o.email || "Sin correo (venta presencial)"}
            </a>
            <a href={"tel:" + o.phone}>{o.phone || "Sin teléfono"}</a>
            <p>
              {o.delivery === "pickup"
                ? "Retiro en tienda"
                : `${o.address}\n${o.city}, ${o.region}`}
            </p>
            {o.notes && (
              <p className="order-customer-note">Nota del cliente: {o.notes}</p>
            )}
          </div>
          <h3>Selección</h3>
          <div className="order-items">
            {o.items.map((i) => (
              <div key={i.product_id}>
                <div>
                  <span>{displayTitle(i.artist)}</span>
                  <strong>{displayTitle(i.title)}</strong>
                  <small>
                    {i.quantity} × {money(i.unit_price)} ·{" "}
                    {i.format.toUpperCase()}
                  </small>
                </div>
                <strong>{money(i.unit_price * i.quantity)}</strong>
              </div>
            ))}
          </div>
          <p className="admin-order-total">
            Discos <strong>{money(o.subtotal)}</strong>
          </p>
          <p className="editor-source">
            Creado{" "}
            {new Date(o.created_at).toLocaleString("es-CL", {
              timeZone: "America/Santiago",
            })}
            {o.status === "pending" && (
              <>
                <br />
                Reserva hasta{" "}
                {new Date(o.expires_at).toLocaleString("es-CL", {
                  timeZone: "America/Santiago",
                })}
              </>
            )}
          </p>
        </div>
        <div>
          <h3>Gestionar pedido</h3>
          <label>
            Estado
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={closed}
            >
              {(transitions[o.status] || [o.status])
                .filter(
                  (s) =>
                    !(s === "ready" && o.delivery === "shipping") &&
                    !(s === "shipped" && o.delivery === "pickup"),
                )
                .map((s) => (
                  <option value={s} key={s}>
                    {s === "cancelled" && o.channel === "store"
                      ? "Anular venta y devolver stock"
                      : statusName[s]}
                  </option>
                ))}
            </select>
          </label>
          <label className="checkbox-label payment-check">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              disabled={closed || o.payment_status === "paid"}
            />{" "}
            Pago recibido y verificado
          </label>
          {target === "cancelled" && o.payment_status === "paid" && (
            <label className="checkbox-label payment-check">
              <input
                type="checkbox"
                checked={refund}
                onChange={(e) => setRefund(e.target.checked)}
              />{" "}
              Reembolso realizado al cliente
            </label>
          )}
          {o.delivery === "shipping" && (
            <label>
              Costo de despacho acordado (CLP)
              <input
                type="number"
                name="shipping_cost"
                min={0}
                max={500000}
                defaultValue={o.shipping_cost ?? ""}
                placeholder="Pendiente de cotización"
                disabled={closed}
              />
            </label>
          )}
          {o.delivery === "shipping" && (
            <label>
              Courier / número de seguimiento
              <input
                name="tracking"
                defaultValue={o.tracking || ""}
                maxLength={200}
                placeholder="Ej.: Chilexpress · 123456"
                disabled={closed}
              />
            </label>
          )}
          <label>
            Notas internas
            <textarea
              name="admin_notes"
              defaultValue={o.admin_notes || ""}
              maxLength={2000}
              rows={4}
              placeholder="Solo visible para la tienda"
            />
          </label>
          <p className="editor-source">
            {o.channel === "store"
              ? "Anula una venta solo después del reembolso y la devolución de todos sus discos al local."
              : "Al cancelar se libera el stock. Si el pedido está pagado, confirma primero el reembolso."}
          </p>
          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}
          <button className="button red full" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
            <Check size={17} />
          </button>
        </div>
      </div>
    </form>
  );
}
interface DiscRequest {
  id: string;
  name: string;
  email: string;
  artist: string;
  title: string;
  format: string;
  notes: string;
  status: string;
  created_at: string;
}
function Requests({
  revision,
  changed,
}: {
  revision: number;
  changed: (s: string) => void;
}) {
  const { data, error, loading } = useData<{ requests: DiscRequest[] }>(
    "/api/admin/requests",
    revision,
  );
  const [busy, setBusy] = useState("");
  async function update(id: string, status: string) {
    setBusy(id);
    try {
      await api("/api/admin/requests/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      changed("Estado de búsqueda actualizado.");
    } catch (e) {
      changed((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="LA LISTA DE DESEOS / PEDIDOS ESPECIALES"
        title="Solicitudes de discos"
      />
      {error && <p className="error">{error}</p>}
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="request-list">
          {data?.requests.map((r) => (
            <article className="admin-box" key={r.id}>
              <div>
                <span className="eyebrow">
                  {r.format.toUpperCase()} ·{" "}
                  {new Date(r.created_at).toLocaleDateString("es-CL")}
                </span>
                <h2>
                  {displayTitle(r.artist)} — {displayTitle(r.title)}
                </h2>
                {r.notes && <p>{r.notes}</p>}
                <p>
                  {r.name} · <a href={"mailto:" + r.email}>{r.email}</a>
                </p>
              </div>
              <div>
                <select
                  aria-label={`Estado de búsqueda ${r.title}`}
                  value={r.status}
                  onChange={(e) => void update(r.id, e.target.value)}
                  disabled={busy === r.id}
                >
                  <option value="new">Por buscar</option>
                  <option value="contacted">Cliente contactado</option>
                  <option value="closed">Cerrada</option>
                </select>
                <a
                  className="button outline small"
                  href={
                    "mailto:" +
                    r.email +
                    "?subject=" +
                    encodeURIComponent(
                      "Tu búsqueda en El Rinconcito del Rock: " + r.title,
                    )
                  }
                >
                  <Mail size={16} /> Responder por correo
                </a>
              </div>
            </article>
          ))}
          {data && !data.requests.length && (
            <Empty title="Todavía no hay búsquedas especiales.">
              <p>Las solicitudes de “Busco un disco” aparecerán aquí.</p>
            </Empty>
          )}
        </div>
      )}
    </>
  );
}
function Configuration({
  revision,
  changed,
}: {
  revision: number;
  changed: (s: string) => void;
}) {
  const { data, error } = useData<StoreSettings>(
    "/api/admin/settings",
    revision,
  );
  const [busy, setBusy] = useState(false),
    [saveError, setSaveError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setSaveError("");
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...data,
          address: f.get("address"),
          city: f.get("city"),
          hours: f.get("hours"),
          whatsapp: f.get("whatsapp"),
          email: f.get("email"),
          shippingEnabled: f.get("shippingEnabled") === "on",
          pickupEnabled: f.get("pickupEnabled") === "on",
          shippingCost:
            String(f.get("shippingCost")).trim() === ""
              ? null
              : Number(f.get("shippingCost")),
          reservationHours: Number(f.get("reservationHours")),
          shippingInfo: f.get("shippingInfo"),
          returnInfo: f.get("returnInfo"),
        }),
      });
      changed("Configuración guardada. Los datos ya aparecen en la tienda.");
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CONFIGURACIÓN / LO ESENCIAL"
        title="Configuración de la tienda"
      />
      {error && <p className="error">{error}</p>}
      {!data ? (
        <Loading />
      ) : (
        <form className="settings-form" key={revision} onSubmit={save}>
          <div className="settings-columns">
            <section className="admin-box">
              <h2>La tienda y el contacto</h2>
              <div className="form-row">
                <label>
                  Dirección
                  <input
                    name="address"
                    required
                    defaultValue={data.address}
                    maxLength={250}
                  />
                </label>
                <label>
                  Ciudad
                  <input
                    name="city"
                    required
                    defaultValue={data.city}
                    maxLength={250}
                  />
                </label>
              </div>
              <label>
                Horario de atención
                <input name="hours" defaultValue={data.hours} maxLength={250} />
              </label>
              <label>
                WhatsApp comercial <span className="muted">(opcional)</span>
                <input
                  name="whatsapp"
                  defaultValue={data.whatsapp}
                  maxLength={15}
                  placeholder="56912345678 · sin + ni espacios"
                  inputMode="tel"
                  pattern="[0-9]{9,15}"
                />
              </label>
              <label>
                Correo comercial <span className="muted">(opcional)</span>
                <input
                  name="email"
                  defaultValue={data.email}
                  type="email"
                  maxLength={200}
                />
              </label>
              <p className="editor-source">
                Instagram es el canal oficial disponible. Al guardar un
                WhatsApp, el seguimiento de pedidos lo ofrecerá para coordinar
                la entrega.
              </p>
            </section>
            <section className="admin-box">
              <h2>Entregas y reservas</h2>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="pickupEnabled"
                  defaultChecked={data.pickupEnabled}
                />{" "}
                Permitir retiro en tienda
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="shippingEnabled"
                  defaultChecked={data.shippingEnabled}
                />{" "}
                Permitir despacho
              </label>
              <div className="form-row">
                <label>
                  Costo fijo de envío (CLP)
                  <input
                    type="number"
                    name="shippingCost"
                    defaultValue={data.shippingCost ?? ""}
                    min={0}
                    max={500000}
                    placeholder="Vacío = cotizar"
                  />
                </label>
                <label>
                  Duración de reservas (horas)
                  <input
                    type="number"
                    name="reservationHours"
                    defaultValue={data.reservationHours}
                    required
                    min={1}
                    max={168}
                  />
                </label>
              </div>
              <label>
                Información de despacho
                <textarea
                  name="shippingInfo"
                  defaultValue={data.shippingInfo}
                  maxLength={2000}
                  rows={3}
                />
              </label>
              <label>
                Cambios y devoluciones
                <textarea
                  name="returnInfo"
                  defaultValue={data.returnInfo}
                  maxLength={2000}
                  rows={3}
                />
              </label>
            </section>
          </div>
          <section className="payment-setup admin-box">
            <LockKeyhole size={24} />
            <div>
              <h2>Pedidos y reservas activos.</h2>
              <p>
                La tienda registra pedidos y gestiona pagos recibidos de forma
                manual. La integración para cobrar online se conecta en el
                servidor, con credenciales privadas y verificación de los pagos.
                No se solicitan tarjetas mientras no haya un proveedor de pago
                configurado.
              </p>
            </div>
            <span className="state-badge">PAGO ONLINE POR INTEGRAR</span>
          </section>
          {saveError && <p className="error">{saveError}</p>}
          <button className="button red" disabled={busy}>
            {busy ? "Guardando…" : "Guardar configuración"}
            <Check size={17} />
          </button>
        </form>
      )}
    </>
  );
}
