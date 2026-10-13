import {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import {
  Search,
  ShoppingBag,
  Heart,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Disc3,
  Truck,
  Menu,
  X,
  Minus,
  Plus,
  Check,
  Instagram,
  SlidersHorizontal,
  ChevronDown,
  ShieldCheck,
  Copy,
  Package,
  Printer,
  Clock,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, readLocal, storeLocal } from "./api";
import {
  Cover,
  Empty,
  External,
  Loading,
  Logo,
  Modal,
  ProductCard,
  Record,
} from "./components";
import {
  displayTitle,
  formatLabel,
  money,
  statusName,
  type Product,
  type StoreSettings,
  type Order,
} from "./types";
const Admin = lazy(() => import("./Admin"));
type BagItem = { p: Product; qty: number };
type Stats = {
  total: number;
  available: number;
  units: number;
  vinyl: number;
  cds: number;
};
type CardsProps = {
  onOpen: (p: Product) => void;
  onAdd: (p: Product) => void;
  onFavorite: (p: Product) => void;
  favorites: string[];
};
const initialSettings: StoreSettings = {
  address: "Freire 1119",
  city: "Concepción",
  hours: "Lunes a sábado · 11:00–13:00 y 13:40–18:30",
  instagram: "https://www.instagram.com/elrinconcitodelrock/",
  maps: "https://maps.app.goo.gl/GPBfSjqsU2NeSdVV8",
  whatsapp: "",
  email: "",
  shippingEnabled: true,
  shippingCost: null,
  pickupEnabled: true,
  reservationHours: 24,
  shippingInfo: "Envíos a todo Chile. Costo y plazo por coordinar.",
  returnInfo: "Escríbenos por Instagram con el número de pedido.",
  paymentMode: "reservation",
};
export function App() {
  const [route, setRoute] = useState(
    location.pathname + location.search + location.hash,
  );
  const [cfg, setCfg] = useState(initialSettings),
    [stats, setStats] = useState<Stats | null>(null),
    [storeError, setStoreError] = useState("");
  const [bag, setBag] = useState<BagItem[]>(() =>
    readLocal<BagItem[]>("rdr_bag", [])
      .filter((i) => i?.p?.id && Number.isInteger(i.qty) && i.qty > 0)
      .slice(0, 40),
  );
  const [favorites, setFavorites] = useState<string[]>(() =>
    readLocal<string[]>("rdr_favorites", [])
      .filter((i) => typeof i === "string")
      .slice(0, 100),
  );
  const [bagOpen, setBagOpen] = useState(false),
    [checkout, setCheckout] = useState(false),
    [quick, setQuick] = useState<Product | null>(null),
    [requestOpen, setRequestOpen] = useState(false),
    [toast, setToast] = useState(""),
    [mobileMenu, setMobileMenu] = useState(false);
  const path = route.split(/[?#]/)[0];
  function navigate(href: string) {
    history.pushState({}, "", href);
    setRoute(href);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const pop = () => {
      setRoute(location.pathname + location.search + location.hash);
      setMobileMenu(false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    if (!mobileMenu) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenu(false);
        document.querySelector<HTMLButtonElement>(".mobile-toggle")?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest(".header"))
        setMobileMenu(false);
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", outside);
    };
  }, [mobileMenu]);
  async function loadStore() {
    try {
      const r = await api<{ settings: StoreSettings; stats: Stats }>(
        "/api/store",
      );
      setCfg(r.settings);
      setStats(r.stats);
      setStoreError("");
    } catch (e) {
      setStoreError((e as Error).message);
    }
  }
  useEffect(() => {
    void loadStore();
  }, []);
  useEffect(() => storeLocal("rdr_bag", bag), [bag]);
  useEffect(() => storeLocal("rdr_favorites", favorites), [favorites]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (path.startsWith("/admin") || path.startsWith("/pedido/")) return;
    const names: Record<string, string> = {
      "/": "El Rinconcito del Rock · Vinilos y CDs en Concepción",
      "/tienda": "Catálogo · El Rinconcito del Rock",
      "/nosotros": "La tienda · El Rinconcito del Rock",
      "/favoritos": "Tus favoritos · El Rinconcito del Rock",
      "/ayuda": "Preguntas y entregas · El Rinconcito del Rock",
    };
    if (names[path]) document.title = names[path];
  }, [path]);
  function add(p: Product) {
    if (!p.stock) return;
    setBag((prev) => {
      const current = prev.find((i) => i.p.id === p.id);
      if ((current?.qty || 0) >= Math.min(p.stock, 20)) {
        setToast("Ya agregaste todas las unidades disponibles.");
        return prev;
      }
      if (!current && prev.length >= 40) {
        setToast("Tu bolsa admite hasta 40 discos diferentes.");
        return prev;
      }
      setToast(displayTitle(p.title) + " agregado a la bolsa.");
      return current
        ? prev.map((i) => (i.p.id === p.id ? { p, qty: i.qty + 1 } : i))
        : [...prev, { p, qty: 1 }];
    });
  }
  function favorite(p: Product) {
    setFavorites((prev) =>
      prev.includes(p.id)
        ? prev.filter((id) => id !== p.id)
        : [...prev, p.id].slice(-100),
    );
  }
  function link(href: string, label: string) {
    return (
      <a
        href={href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigate(href);
        }}
      >
        {label}
      </a>
    );
  }
  const cards: CardsProps = {
    onOpen: setQuick,
    onAdd: add,
    onFavorite: favorite,
    favorites,
  };
  const count = bag.reduce((n, i) => n + i.qty, 0);
  return (
    <div className={path.startsWith("/admin") ? "admin-mode" : "storefront"}>
      {path.startsWith("/admin") ? (
        <Suspense fallback={<Loading />}>
          <Admin onExit={() => navigate("/")} onStoreChange={loadStore} />
        </Suspense>
      ) : (
        <>
          <a className="skip-link" href="#contenido">
            Saltar al contenido
          </a>
          <div className="top-strip">
            <a href={cfg.maps} target="_blank" rel="noopener noreferrer">
              <MapPin size={12} />
              {cfg.address}, {cfg.city}
            </a>
            {cfg.shippingEnabled && (
              <span>
                <Truck size={13} />
                Envíos a todo Chile
              </span>
            )}
          </div>
          <header className="header">
            <nav className="desktop-nav" aria-label="Navegación principal">
              {link("/tienda?format=vinilo", "Vinilos")}
              {link("/tienda?format=cd", "CDs")}
              {link("/tienda", "Catálogo")}
              {link("/nosotros", "La tienda")}
            </nav>
            <a
              className="logo-link"
              href="/"
              aria-label="El Rinconcito del Rock, inicio"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate("/");
              }}
            >
              <Logo />
            </a>
            <div className="header-actions">
              <button
                className="icon-button header-search"
                aria-label="Buscar discos"
                onClick={() => navigate("/tienda?focus=1")}
              >
                <Search size={21} />
              </button>
              <button
                className="icon-button favorites-nav"
                aria-label="Mis favoritos"
                onClick={() => navigate("/favoritos")}
              >
                <Heart size={21} />
                {favorites.length > 0 && <i />}
              </button>
              <button
                className="bag-button"
                onClick={() => {
                  setCheckout(false);
                  setBagOpen(true);
                }}
                aria-label={"Abrir bolsa, " + count + " discos"}
              >
                <ShoppingBag size={21} />
                <span>Bolsa</span>
                <b aria-live="polite">{count}</b>
              </button>
            </div>
            <button
              className="icon-button mobile-toggle"
              aria-label={mobileMenu ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenu}
              aria-controls="mobile-menu"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              {mobileMenu ? <X size={23} /> : <Menu size={23} />}
            </button>
            {mobileMenu && (
              <nav
                id="mobile-menu"
                className="mobile-nav"
                aria-label="Menú móvil"
              >
                {link("/tienda", "Todos los discos")}
                {link("/tienda?format=vinilo", "Vinilos")}
                {link("/tienda?format=cd", "CDs")}
                {link("/tienda?category=Rock%20chileno", "Rock chileno")}
                {link("/favoritos", "Favoritos")}
                {link("/nosotros", "La tienda")}
                {link("/ayuda", "Entregas y ayuda")}
              </nav>
            )}
          </header>
          {storeError && (
            <div className="connection-notice" role="alert">
              No pudimos actualizar la tienda.{" "}
              <button onClick={() => void loadStore()}>Reintentar</button>
            </div>
          )}
          <main id="contenido">
            {path === "/" ? (
              <Home
                cfg={cfg}
                stats={stats}
                cards={cards}
                navigate={navigate}
                onRequest={() => setRequestOpen(true)}
              />
            ) : path === "/tienda" ? (
              <Catalogue
                key={route}
                route={route}
                cards={cards}
                onRequest={() => setRequestOpen(true)}
                navigate={navigate}
              />
            ) : path === "/favoritos" ? (
              <Favorites cards={cards} navigate={navigate} />
            ) : path.startsWith("/disco/") ? (
              <ProductPage
                slug={path.slice(7)}
                cfg={cfg}
                onAdd={add}
                onFavorite={favorite}
                favorites={favorites}
                navigate={navigate}
              />
            ) : path.startsWith("/pedido/") ? (
              <OrderPage id={path.slice(8)} cfg={cfg} route={route} />
            ) : path === "/nosotros" ? (
              <About cfg={cfg} navigate={navigate} />
            ) : ["/ayuda", "/privacidad", "/condiciones"].includes(path) ? (
              <InfoPage page={path} cfg={cfg} />
            ) : (
              <Empty title="Página no encontrada.">
                <button className="button" onClick={() => navigate("/")}>
                  Volver al inicio
                </button>
              </Empty>
            )}
          </main>
          <footer>
            <div className="footer-top">
              <div className="footer-brand">
                <Logo />
                <p>
                  Vinilos y CDs
                  <br />
                  Concepción, Chile
                </p>
              </div>
              <div>
                <span className="eyebrow">Discos</span>
                {link("/tienda", "Catálogo completo")}
                {link("/tienda?format=vinilo", "Vinilos")}
                {link("/tienda?format=cd", "CDs")}
                {link("/tienda?category=Rock%20chileno", "Rock chileno")}
              </div>
              <div>
                <span className="eyebrow">La tienda</span>
                {link("/nosotros", "Visítanos")}
                <a href={cfg.maps} target="_blank" rel="noopener noreferrer">
                  {cfg.address}, {cfg.city}
                  <ArrowUpRight size={14} />
                </a>
                <External href={cfg.instagram}>Instagram</External>
                <button
                  className="text-link"
                  onClick={() => setRequestOpen(true)}
                >
                  Solicitar un disco
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <div>
                <span className="eyebrow">Ayuda</span>
                {link("/ayuda", "Pedidos y entregas")}
                {link("/condiciones", "Condiciones de compra")}
                {link("/privacidad", "Privacidad")}
              </div>
            </div>
            <div className="footer-bottom">
              <span>© {new Date().getFullYear()} El Rinconcito del Rock</span>
              <span>Precios en pesos chilenos</span>
              <a
                href="/admin"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  navigate("/admin");
                }}
              >
                Administración
                <ArrowUpRight size={13} />
              </a>
            </div>
          </footer>
        </>
      )}
      {quick && (
        <Modal title="Detalle del disco" onClose={() => setQuick(null)} wide>
          <ProductDetail
            p={quick}
            cfg={cfg}
            onAdd={(p) => {
              add(p);
              setQuick(null);
              setCheckout(false);
              setBagOpen(true);
            }}
            onFavorite={favorite}
            favorite={favorites.includes(quick.id)}
            onFull={() => {
              setQuick(null);
              navigate("/disco/" + quick.slug);
            }}
          />
        </Modal>
      )}
      {bagOpen && (
        <Modal
          title={checkout ? "Tu pedido" : "Tu bolsa"}
          onClose={() => setBagOpen(false)}
          drawer
        >
          {checkout ? (
            <Checkout
              bag={bag}
              cfg={cfg}
              onBack={() => setCheckout(false)}
              onRefresh={(items) => setBag(items)}
              onSuccess={(r) => {
                setBag([]);
                setBagOpen(false);
                storeLocal("rdr_last_order", r);
                navigate("/pedido/" + r.id + "#" + r.token);
              }}
            />
          ) : (
            <Bag
              bag={bag}
              cfg={cfg}
              onQuantity={(id, n) =>
                setBag((prev) =>
                  prev
                    .map((i) => (i.p.id === id ? { ...i, qty: n } : i))
                    .filter((i) => i.qty > 0),
                )
              }
              onCheckout={() => setCheckout(true)}
              onShop={() => {
                setBagOpen(false);
                navigate("/tienda");
              }}
            />
          )}
        </Modal>
      )}
      {requestOpen && (
        <Modal title="Solicitar un disco" onClose={() => setRequestOpen(false)}>
          <RequestForm />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            onClick={() => {
              setToast("");
              setCheckout(false);
              setBagOpen(true);
            }}
          >
            Ver bolsa <ArrowRight size={14} />
          </button>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Cerrar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Home({
  cfg,
  stats,
  cards,
  navigate,
  onRequest,
}: {
  cfg: StoreSettings;
  stats: Stats | null;
  cards: CardsProps;
  navigate: (s: string) => void;
  onRequest: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [spotlights, setSpotlights] = useState<Product[]>([]);
  const [selected, setSelected] = useState(0);
  const [format, setFormat] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ products: Product[] }>(
      "/api/products?sort=featured&available=1&limit=8&format=" + format,
      { signal: controller.signal },
    )
      .then((r) => {
        setProducts(r.products);
        if (!format) {
          const selectedIds = ["ven-0509", "ves-0324", "ven-0573"];
          const picks = selectedIds
            .map((id) => r.products.find((p) => p.id === id))
            .filter((p): p is Product => !!p);
          setSpotlights(
            picks.length
              ? picks
              : r.products.filter((p) => p.image).slice(0, 3),
          );
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [format, revision]);
  const spotlight = spotlights[selected % (spotlights.length || 1)];
  function shopLink(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  }
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Tienda de discos · Concepción</p>
          <h1>
            VINILOS
            <br />
            <span>Y CDs.</span>
          </h1>
          <p className="hero-description">Rock, metal y música chilena.</p>
          <a
            className="button"
            href="/tienda"
            onClick={(e) => shopLink(e, "/tienda")}
          >
            Explorar catálogo
            <ArrowRight size={19} />
          </a>
          <p className="hero-count">
            {stats
              ? stats.available.toLocaleString("es-CL") + " títulos disponibles"
              : ""}
          </p>
        </div>
        <div className="spotlight" aria-label="Discos destacados">
          <div className="spotlight-top">
            <span className="eyebrow">En la batea</span>
            <span className="spotlight-number">
              {String((selected % (spotlights.length || 1)) + 1).padStart(
                2,
                "0",
              )}
              <span> / {String(spotlights.length || 3).padStart(2, "0")}</span>
            </span>
          </div>
          {spotlight ? (
            <a
              href={"/disco/" + spotlight.slug}
              className="spotlight-stage"
              aria-label={
                "Ver " +
                displayTitle(spotlight.title) +
                " de " +
                displayTitle(spotlight.artist)
              }
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                cards.onOpen(spotlight);
              }}
            >
              {spotlight.format === "vinilo" && (
                <Record className="spotlight-record" />
              )}
              <div className="spotlight-cover">
                <Cover p={spotlight} eager />
              </div>
            </a>
          ) : (
            <div className="spotlight-stage spotlight-loading">
              <Loading />
            </div>
          )}
          <div className="spotlight-bottom">
            <div className="spotlight-description" aria-live="polite">
              {spotlight && (
                <>
                  <strong>{displayTitle(spotlight.artist)}</strong>
                  <span>
                    {displayTitle(spotlight.title)}
                    <i>·</i>
                    {formatLabel(spotlight)}
                    <i>·</i>
                    {money(spotlight.price)}
                  </span>
                </>
              )}
            </div>
            <div className="spotlight-controls">
              <button
                className="icon-button"
                disabled={spotlights.length < 2}
                aria-label="Disco destacado anterior"
                onClick={() =>
                  setSelected(
                    (n) => (n - 1 + spotlights.length) % spotlights.length,
                  )
                }
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                disabled={spotlights.length < 2}
                aria-label="Siguiente disco destacado"
                onClick={() => setSelected((n) => (n + 1) % spotlights.length)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>
      <section className="section featured-section">
        <div className="section-head">
          <h2>Una selección de la batea</h2>
          <a
            href="/tienda"
            className="text-link"
            onClick={(e) => shopLink(e, "/tienda")}
          >
            Ver todo
            <ArrowUpRight size={17} />
          </a>
        </div>
        <div
          className="home-tabs"
          role="group"
          aria-label="Filtrar selección por formato"
        >
          {[
            ["", "Todos"],
            ["vinilo", "Vinilos"],
            ["cd", "CDs"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={v === format ? "selected" : ""}
              aria-pressed={v === format}
              onClick={() => setFormat(v)}
            >
              {l}
            </button>
          ))}
        </div>
        {error ? (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setRevision((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <Loading cards />
        ) : products.length ? (
          <div className="product-grid">
            {products.map((p, i) => (
              <ProductCard
                key={p.id}
                p={p}
                {...cards}
                favorite={cards.favorites.includes(p.id)}
                eager={i < 4}
              />
            ))}
          </div>
        ) : (
          <Empty title="No hay discos disponibles en esta selección." />
        )}
      </section>
      <section className="browse-section">
        <a
          href="/tienda?category=Rock%20%26%20metal"
          onClick={(e) => shopLink(e, "/tienda?category=Rock%20%26%20metal")}
          className="browse-tile"
        >
          <div>
            <span className="eyebrow">Internacional</span>
            <h2>Rock & metal</h2>
            <span className="text-link">
              Explorar
              <ArrowUpRight size={17} />
            </span>
          </div>
          <img
            src="/assets/covers/nirvana-in-utero.webp"
            alt=""
            width="600"
            height="600"
            loading="lazy"
          />
        </a>
        <a
          href="/tienda?category=Rock%20chileno"
          onClick={(e) => shopLink(e, "/tienda?category=Rock%20chileno")}
          className="browse-tile"
        >
          <div>
            <span className="eyebrow">Música de acá</span>
            <h2>Rock chileno</h2>
            <span className="text-link">
              Explorar
              <ArrowUpRight size={17} />
            </span>
          </div>
          <img
            src="/assets/covers/los-tres-la-espada-y-la-pared.webp"
            alt=""
            width="600"
            height="600"
            loading="lazy"
          />
        </a>
      </section>
      <StoreVisit cfg={cfg} />
      <div className="request-line">
        <span>¿Buscas un disco que no aparece?</span>
        <button className="text-link" onClick={onRequest}>
          Déjanos tu búsqueda
          <ArrowUpRight size={16} />
        </button>
      </div>
    </>
  );
}
function Catalogue({
  route,
  cards,
  onRequest,
  navigate,
}: {
  route: string;
  cards: CardsProps;
  onRequest: () => void;
  navigate: (s: string) => void;
}) {
  const params = new URLSearchParams(route.split("?")[1]?.split("#")[0]);
  const [q, setQ] = useState(params.get("q") || ""),
    [format, setFormat] = useState(params.get("format") || ""),
    [language, setLanguage] = useState(params.get("language") || ""),
    [category, setCategory] = useState(params.get("category") || ""),
    [sort, setSort] = useState(params.get("sort") || "featured"),
    [available, setAvailable] = useState(params.get("available") !== "0"),
    [maxPrice, setMaxPrice] = useState(params.get("maxPrice") || ""),
    [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1)),
    [products, setProducts] = useState<Product[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filters, setFilters] = useState(false),
    [revision, setRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (params.has("focus")) inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      const query = new URLSearchParams({
        q,
        format,
        language,
        category,
        sort,
        available: available ? "1" : "0",
        page: String(page),
        maxPrice,
      });
      api<{ products: Product[]; total: number }>("/api/products?" + query, {
        signal: controller.signal,
      })
        .then((r) => {
          setProducts(r.products);
          setTotal(r.total);
          setError("");
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      const url = "/tienda?" + query.toString();
      history.replaceState({}, "", url);
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [
    q,
    format,
    language,
    category,
    sort,
    available,
    page,
    maxPrice,
    revision,
  ]);
  function reset() {
    setQ("");
    setFormat("");
    setLanguage("");
    setCategory("");
    setMaxPrice("");
    setAvailable(true);
    setPage(1);
  }
  return (
    <section className="section catalogue">
      <div className="catalogue-heading">
        <div>
          <p className="eyebrow">Vinilos y CDs</p>
          <h1>Catálogo</h1>
        </div>
        <button className="text-link" onClick={onRequest}>
          Solicitar un disco
          <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="search-box">
        <Search size={23} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Busca un artista o un disco…"
          aria-label="Buscar artista o álbum"
          type="search"
          autoComplete="off"
        />
        {q && (
          <button
            className="icon-button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setQ("");
              setPage(1);
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="catalogue-controls">
        <div className="chips" role="group" aria-label="Formato">
          {[
            ["", "Todos"],
            ["vinilo", "Vinilos"],
            ["cd", "CDs"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={format === v ? "selected" : ""}
              aria-pressed={format === v}
              onClick={() => {
                setFormat(v);
                setPage(1);
              }}
            >
              {v ? <Disc3 size={15} /> : null}
              {l}
            </button>
          ))}
        </div>
        <button
          className={`filter-toggle ${filters ? "selected" : ""}`}
          onClick={() => setFilters(!filters)}
          aria-expanded={filters}
        >
          <SlidersHorizontal size={17} /> Filtros{" "}
          {language || category || maxPrice ? <b>●</b> : null}
        </button>
        <label className="sort-control">
          <span>Ordenar:</span>
          <select
            aria-label="Ordenar discos"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="featured">Selección de la tienda</option>
            <option value="artist">Artista, A–Z</option>
            <option value="price_asc">Menor precio</option>
            <option value="price_desc">Mayor precio</option>
          </select>
        </label>
      </div>
      {filters && (
        <div className="filter-panel">
          <label>
            Idioma
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="es">En español</option>
              <option value="en">Internacional</option>
            </select>
          </label>
          <label>
            Selección
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Toda la música</option>
              {[
                "Rock chileno",
                "Rock & metal",
                "En español",
                "Internacional",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Precio máximo
            <input
              inputMode="numeric"
              type="number"
              min="1"
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
              placeholder="Sin límite"
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => {
                setAvailable(e.target.checked);
                setPage(1);
              }}
            />{" "}
            Solo con stock
          </label>
          <button className="text-link" onClick={reset}>
            Limpiar filtros <X size={15} />
          </button>
        </div>
      )}
      <div className="result-counter">
        <span>
          {loading
            ? "Buscando…"
            : `${total.toLocaleString("es-CL")} discos${q ? " para “" + q + "”" : ""}`}
        </span>
        <span>Precios en CLP</span>
      </div>
      {error ? (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setRevision((r) => r + 1)}>Reintentar</button>
        </div>
      ) : loading ? (
        <Loading cards />
      ) : products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              {...cards}
              favorite={cards.favorites.includes(p.id)}
            />
          ))}
        </div>
      ) : (
        <Empty title="Todavía no encontramos ese disco.">
          <p>Prueba con otro nombre o déjanos tu búsqueda.</p>
          <div className="button-row">
            <button className="button outline" onClick={reset}>
              Limpiar búsqueda
            </button>
            <button className="button" onClick={onRequest}>
              Busco un disco <ArrowUpRight size={17} />
            </button>
          </div>
        </Empty>
      )}
      {total > 24 && (
        <div className="pagination">
          <button
            disabled={page === 1 || loading}
            onClick={() => {
              setPage(page - 1);
              window.scrollTo({ top: 220, behavior: "instant" });
            }}
          >
            ← Anterior
          </button>
          <span>
            Página {page} de {Math.ceil(total / 24)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 24) || loading}
            onClick={() => {
              setPage(page + 1);
              window.scrollTo({ top: 220, behavior: "instant" });
            }}
          >
            Siguiente →
          </button>
        </div>
      )}
      <p className="catalogue-note">
        Visítanos en tienda:{" "}
        <a
          href="/nosotros"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            navigate("/nosotros");
          }}
        >
          Te esperamos en Freire 1119.
        </a>
      </p>
    </section>
  );
}
function Favorites({
  cards,
  navigate,
}: {
  cards: CardsProps;
  navigate: (s: string) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setLoading(true);
    Promise.allSettled(
      cards.favorites.map((id) => api<Product>("/api/products/" + id)),
    ).then((r) => {
      setProducts(
        r
          .filter(
            (v): v is PromiseFulfilledResult<Product> =>
              v.status === "fulfilled",
          )
          .map((v) => v.value),
      );
      if (r.some((v) => v.status === "rejected"))
        setError("Algunos discos no pudieron actualizarse.");
      setLoading(false);
    });
  }, [cards.favorites]);
  return (
    <section className="section">
      <p className="eyebrow">Tu selección</p>
      <h1 className="page-title">Favoritos</h1>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <Loading cards />
      ) : products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} {...cards} favorite />
          ))}
        </div>
      ) : (
        <Empty title="Aún no tienes favoritos.">
          <p>
            Guarda los discos que te gustan tocando el corazón.
            <br />
            Los favoritos quedan en este dispositivo.
          </p>
          <button className="button" onClick={() => navigate("/tienda")}>
            Explorar catálogo <ArrowRight size={17} />
          </button>
        </Empty>
      )}
    </section>
  );
}
function ProductDetail({
  p,
  cfg,
  onAdd,
  onFavorite,
  favorite,
  onFull,
}: {
  p: Product;
  cfg: StoreSettings;
  onAdd: (p: Product) => void;
  onFavorite: (p: Product) => void;
  favorite: boolean;
  onFull?: () => void;
}) {
  const Heading = onFull ? "h2" : "h1";
  return (
    <div className="product-detail">
      <div className="detail-image">
        <Cover p={p} eager />
        <p>
          Carátula de referencia. Consulta la edición y fotos del ejemplar antes
          de pagar.
        </p>
      </div>
      <div className="detail-copy">
        <p className="eyebrow">{formatLabel(p)}</p>
        <p className="detail-artist">{displayTitle(p.artist)}</p>
        <Heading>{displayTitle(p.title)}</Heading>
        <p className="detail-price">
          {money(p.price)} <span>CLP</span>
        </p>
        <p className={`availability ${p.stock ? "" : "unavailable"}`}>
          <span className="signal-dot" />
          {p.stock === 0
            ? "Agotado"
            : p.stock === 1
              ? "Última unidad disponible"
              : `${p.stock} unidades disponibles`}
        </p>
        {p.description && <p className="detail-description">{p.description}</p>}
        <div className="detail-buttons">
          <button
            className="button red"
            disabled={!p.stock}
            onClick={() => onAdd(p)}
          >
            <ShoppingBag size={19} />
            {p.stock ? "Agregar a la bolsa" : "Disco agotado"}
            <Plus size={18} />
          </button>
          <button
            className={`button outline square-button ${favorite ? "saved" : ""}`}
            aria-label={
              favorite ? "Quitar de favoritos" : "Guardar en favoritos"
            }
            aria-pressed={favorite}
            onClick={() => onFavorite(p)}
          >
            <Heart fill={favorite ? "currentColor" : "none"} size={20} />
          </button>
        </div>
        <dl className="specs">
          <div>
            <dt>Formato</dt>
            <dd>{formatLabel(p)}</dd>
          </div>
          <div>
            <dt>Selección</dt>
            <dd>{p.category}</dd>
          </div>
          <div>
            <dt>Código</dt>
            <dd>{p.id.toUpperCase()}</dd>
          </div>
        </dl>
        <div className="delivery-info">
          <p>
            <MapPin size={18} />
            <span>
              <strong>Retiro en {cfg.city}</strong>
              <br />
              {cfg.address} · Sin costo
            </span>
          </p>
          {cfg.shippingEnabled && (
            <p>
              <Truck size={18} />
              <span>
                <strong>Envíos a todo Chile</strong>
                <br />
                {cfg.shippingCost === null
                  ? "Costo y plazo por coordinar"
                  : money(cfg.shippingCost) + " de despacho"}
              </span>
            </p>
          )}
          <p>
            <ShieldCheck size={18} />
            <span>
              El stock se confirma al reservar.
              <br />
              Sin cobros automáticos.
            </span>
          </p>
        </div>
        <div className="detail-links">
          {onFull && (
            <button className="text-link" onClick={onFull}>
              Ver ficha completa <ArrowUpRight size={16} />
            </button>
          )}
          <External href={cfg.instagram}>Consultar por Instagram</External>
        </div>
      </div>
    </div>
  );
}
function ProductPage({
  slug,
  cfg,
  onAdd,
  onFavorite,
  favorites,
  navigate,
}: {
  slug: string;
  cfg: StoreSettings;
  onAdd: (p: Product) => void;
  onFavorite: (p: Product) => void;
  favorites: string[];
  navigate: (s: string) => void;
}) {
  const [p, setP] = useState<Product | null>(null),
    [error, setError] = useState(""),
    [related, setRelated] = useState<Product[]>([]);
  useEffect(() => {
    setP(null);
    setError("");
    setRelated([]);
    api<Product>("/api/products/" + slug)
      .then((p) => {
        setP(p);
        document.title =
          displayTitle(p.artist) +
          " — " +
          displayTitle(p.title) +
          " · El Rinconcito del Rock";
        return api<{ products: Product[] }>(
          "/api/products?q=" + encodeURIComponent(p.artist) + "&limit=5",
        );
      })
      .then((r) => setRelated(r.products))
      .catch((e) => setError(e.message));
  }, [slug]);
  return (
    <section className="section">
      <button className="back-link" onClick={() => navigate("/tienda")}>
        ← Volver al catálogo
      </button>
      {error ? (
        <Empty title={error}>
          <button className="button" onClick={() => navigate("/tienda")}>
            Ver catálogo
          </button>
        </Empty>
      ) : p ? (
        <>
          <ProductDetail
            p={p}
            cfg={cfg}
            onAdd={onAdd}
            onFavorite={onFavorite}
            favorite={favorites.includes(p.id)}
          />
          {related.filter((r) => r.id !== p.id).length > 0 && (
            <div className="related">
              <div className="section-head">
                <h2>
                  Para seguir escuchando<span>.</span>
                </h2>
              </div>
              <div className="product-grid">
                {related
                  .filter((r) => r.id !== p.id)
                  .slice(0, 4)
                  .map((r) => (
                    <ProductCard
                      key={r.id}
                      p={r}
                      onOpen={() => navigate("/disco/" + r.slug)}
                      onAdd={onAdd}
                      onFavorite={onFavorite}
                      favorite={favorites.includes(r.id)}
                    />
                  ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <Loading />
      )}
    </section>
  );
}
function Bag({
  bag,
  cfg,
  onQuantity,
  onCheckout,
  onShop,
}: {
  bag: BagItem[];
  cfg: StoreSettings;
  onQuantity: (id: string, n: number) => void;
  onCheckout: () => void;
  onShop: () => void;
}) {
  const subtotal = bag.reduce((n, i) => n + i.p.price * i.qty, 0);
  return bag.length ? (
    <div className="bag-content">
      <h2>Tu selección</h2>
      <div className="bag-items">
        {bag.map(({ p, qty }) => (
          <div className="bag-item" key={p.id}>
            <div className="bag-art">
              <Cover p={p} />
            </div>
            <div className="bag-item-info">
              <span className="eyebrow">{formatLabel(p)}</span>
              <strong>{displayTitle(p.artist)}</strong>
              <p>{displayTitle(p.title)}</p>
              <div className="quantity">
                <button
                  onClick={() => onQuantity(p.id, qty - 1)}
                  aria-label={`Quitar una unidad de ${p.title}`}
                >
                  <Minus size={14} />
                </button>
                <span>{qty}</span>
                <button
                  onClick={() => onQuantity(p.id, qty + 1)}
                  disabled={qty >= Math.min(p.stock, 20)}
                  aria-label={`Sumar una unidad de ${p.title}`}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="bag-line-end">
              <button
                aria-label={`Eliminar ${p.title} de la bolsa`}
                className="icon-button"
                onClick={() => onQuantity(p.id, 0)}
              >
                <X size={17} />
              </button>
              <strong>{money(p.price * qty)}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="bag-summary">
        <div>
          <span>Subtotal de discos</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <p>
          <MapPin size={16} /> Retiro gratis en {cfg.city}.
        </p>
        <p>
          <Truck size={16} /> Envío{" "}
          {cfg.shippingCost === null
            ? "por coordinar."
            : money(cfg.shippingCost) + "."}
        </p>
        <button className="button red" onClick={onCheckout}>
          Continuar con el pedido <ArrowRight size={19} />
        </button>
        <small>El stock queda reservado al confirmar el pedido.</small>
        <button className="text-link" onClick={onShop}>
          Seguir comprando <ArrowUpRight size={15} />
        </button>
      </div>
    </div>
  ) : (
    <Empty title="Tu bolsa está vacía.">
      <p>Explora el catálogo para agregar discos.</p>
      <button className="button red" onClick={onShop}>
        Explorar catálogo <ArrowRight size={17} />
      </button>
    </Empty>
  );
}
function Checkout({
  bag,
  cfg,
  onBack,
  onRefresh,
  onSuccess,
}: {
  bag: BagItem[];
  cfg: StoreSettings;
  onBack: () => void;
  onRefresh: (b: BagItem[]) => void;
  onSuccess: (r: { id: string; code: string; token: string }) => void;
}) {
  const [delivery, setDelivery] = useState<"pickup" | "shipping">(
      cfg.pickupEnabled ? "pickup" : "shipping",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(true);
  useEffect(() => {
    Promise.all(
      bag.map(async (i) => ({
        ...i,
        p: await api<Product>("/api/products/" + i.p.id),
      })),
    )
      .then((r) => {
        onRefresh(r);
        if (r.some((i) => i.qty > i.p.stock))
          setError(
            "Uno de los discos cambió de stock. Vuelve a la bolsa para ajustar las cantidades.",
          );
      })
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const payload = {
      items: bag.map((i) => ({ id: i.p.id, quantity: i.qty })),
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      delivery,
      address: data.get("address") || "",
      city: data.get("city") || "",
      region: data.get("region") || "",
      notes: data.get("notes") || "",
      consent: data.get("consent") === "on",
    };
    const serialized = JSON.stringify(payload);
    let attempt = readLocal<{ payload: string; key: string } | null>(
      "rdr_checkout_attempt",
      null,
    );
    if (!attempt || attempt.payload !== serialized) {
      attempt = { payload: serialized, key: crypto.randomUUID() };
      storeLocal("rdr_checkout_attempt", attempt);
    }
    try {
      const r = await api<{ id: string; code: string; token: string }>(
        "/api/orders",
        {
          method: "POST",
          headers: { "Idempotency-Key": attempt.key },
          body: serialized,
        },
      );
      storeLocal("rdr_checkout_attempt", null);
      onSuccess(r);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const subtotal = bag.reduce((n, i) => n + i.p.price * i.qty, 0);
  const stockError = bag.some((i) => i.qty > i.p.stock);
  return (
    <form className="checkout-form" onSubmit={submit}>
      <button type="button" className="back-link" onClick={onBack}>
        ← Volver a la bolsa
      </button>
      <h2>Completa tu pedido</h2>
      <p className="muted">
        Reservamos tu selección por {cfg.reservationHours} horas. Coordinamos la
        entrega y el pago contigo.
      </p>
      <fieldset>
        <legend>1. Tus datos</legend>
        <label>
          Nombre y apellido
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            placeholder="Tu nombre"
          />
        </label>
        <div className="form-row">
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              placeholder="tu@correo.cl"
            />
          </label>
          <label>
            Teléfono
            <input
              name="phone"
              type="tel"
              required
              minLength={8}
              maxLength={40}
              autoComplete="tel"
              placeholder="+56 9…"
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>2. Entrega</legend>
        <div className="delivery-options">
          {cfg.pickupEnabled && (
            <label className={delivery === "pickup" ? "checked" : ""}>
              <input
                type="radio"
                name="delivery"
                value="pickup"
                checked={delivery === "pickup"}
                onChange={() => setDelivery("pickup")}
              />
              <MapPin size={21} />
              <span>
                <strong>Retiro en tienda</strong>
                <small>
                  {cfg.address}, {cfg.city}
                </small>
              </span>
              <b>Gratis</b>
            </label>
          )}
          {cfg.shippingEnabled && (
            <label className={delivery === "shipping" ? "checked" : ""}>
              <input
                type="radio"
                name="delivery"
                value="shipping"
                checked={delivery === "shipping"}
                onChange={() => setDelivery("shipping")}
              />
              <Truck size={21} />
              <span>
                <strong>Envío a Chile</strong>
                <small>Coordinamos el despacho</small>
              </span>
              <b>
                {cfg.shippingCost === null
                  ? "A coordinar"
                  : money(cfg.shippingCost)}
              </b>
            </label>
          )}
        </div>
        {delivery === "shipping" && (
          <div className="shipping-fields">
            <label>
              Dirección, número y departamento
              <input
                name="address"
                required
                minLength={5}
                maxLength={250}
                autoComplete="street-address"
              />
            </label>
            <div className="form-row">
              <label>
                Comuna / ciudad
                <input
                  name="city"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="address-level2"
                />
              </label>
              <label>
                Región
                <select name="region" required defaultValue="">
                  <option value="" disabled>
                    Selecciona una región
                  </option>
                  {[
                    "Arica y Parinacota",
                    "Tarapacá",
                    "Antofagasta",
                    "Atacama",
                    "Coquimbo",
                    "Valparaíso",
                    "Metropolitana",
                    "O’Higgins",
                    "Maule",
                    "Ñuble",
                    "Biobío",
                    "La Araucanía",
                    "Los Ríos",
                    "Los Lagos",
                    "Aysén",
                    "Magallanes",
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </fieldset>
      <label>
        ¿Algo que debamos saber? <span className="muted">(opcional)</span>
        <textarea
          name="notes"
          maxLength={1000}
          rows={2}
          placeholder="Indicaciones para tu pedido…"
        />
      </label>
      <div className="checkout-total">
        <div>
          <span>Discos ({bag.reduce((n, i) => n + i.qty, 0)})</span>
          <strong>{money(subtotal)}</strong>
        </div>
        <div>
          <span>{delivery === "pickup" ? "Retiro" : "Despacho"}</span>
          <span>
            {delivery === "pickup"
              ? "Sin costo"
              : cfg.shippingCost === null
                ? "Se confirma antes de pagar"
                : money(cfg.shippingCost)}
          </span>
        </div>
        {(delivery === "pickup" || cfg.shippingCost !== null) && (
          <div className="grand-total">
            <strong>Total</strong>
            <strong>
              {money(
                subtotal +
                  (delivery === "shipping" ? cfg.shippingCost || 0 : 0),
              )}
            </strong>
          </div>
        )}
      </div>
      <label className="checkbox-label consent">
        <input type="checkbox" name="consent" required />
        <span>
          Acepto las{" "}
          <a href="/condiciones" target="_blank" rel="noopener">
            condiciones del pedido
          </a>{" "}
          y la{" "}
          <a href="/privacidad" target="_blank" rel="noopener">
            política de privacidad
          </a>
          . Entiendo que esta reserva no realiza un cobro.
        </span>
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button
        className="button red full"
        disabled={busy || refreshing || stockError || !bag.length}
      >
        {busy
          ? "Reservando tus discos…"
          : refreshing
            ? "Confirmando stock…"
            : "Confirmar mi reserva"}
        {busy ? <Disc3 className="spin" size={19} /> : <ArrowRight size={19} />}
      </button>
      <p className="checkout-note">
        <ShieldCheck size={15} /> Tus datos se usan solo para gestionar este
        pedido.
      </p>
    </form>
  );
}
function OrderPage({
  id,
  cfg,
  route,
}: {
  id: string;
  cfg: StoreSettings;
  route: string;
}) {
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [refresh, setRefresh] = useState(0);
  const last = readLocal<{ id: string; token: string } | null>(
    "rdr_last_order",
    null,
  );
  const token = route.split("#")[1] || (last?.id === id ? last.token : "");
  useEffect(() => {
    if (!token) {
      setError("Abre el enlace privado que recibiste al reservar tu pedido.");
      return;
    }
    api<Order>("/api/orders/" + id, {
      headers: { Authorization: "Bearer " + token },
    })
      .then(setOrder)
      .catch((e) => setError(e.message));
  }, [id, token, refresh]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        location.origin + "/pedido/" + id + "#" + token,
      );
      setCopied(true);
    } catch {
      setError(
        "Copia el enlace de la barra de direcciones para guardar tu pedido.",
      );
    }
  }
  return (
    <section className="section order-page">
      <p className="eyebrow">Seguimiento del pedido</p>
      {error && !order ? (
        <Empty title="Tu pedido tiene un enlace privado.">
          <p>{error}</p>
        </Empty>
      ) : !order ? (
        <Loading />
      ) : (
        <>
          <div className="order-heading">
            <div className="order-check">
              <Check size={36} />
            </div>
            <div>
              <h1>
                {["expired", "cancelled"].includes(order.status)
                  ? "Estado del pedido"
                  : "Pedido registrado"}
              </h1>
              <p>
                Pedido <strong>{order.code}</strong> ·{" "}
                {statusName[order.status]}
              </p>
            </div>
          </div>
          <div className="order-columns">
            <div>
              <div className="order-status">
                <span className="status-tag">{statusName[order.status]}</span>
                <p>
                  {order.status === "pending"
                    ? `Tu selección está reservada hasta el ${new Date(order.expires_at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }).replace(/\.$/, "")}. Escribe a la tienda con tu número de pedido para coordinar el pago y la entrega.`
                    : order.status === "expired"
                      ? "La reserva venció y los discos volvieron a estar disponibles. Puedes crear un nuevo pedido."
                      : order.status === "cancelled"
                        ? "El pedido fue cancelado. Contacta a la tienda si necesitas ayuda."
                        : order.status === "shipped"
                          ? "Tu pedido va en camino. Revisa el número de seguimiento."
                          : order.status === "ready"
                            ? "Tus discos están listos. Coordina tu retiro en Freire 1119."
                            : order.status === "completed"
                              ? "Pedido entregado. Que tus discos suenen mucho."
                              : "Tu pedido está confirmado. La tienda prepara tus discos."}
                </p>
                {order.tracking && (
                  <p>
                    <strong>Seguimiento:</strong> {order.tracking}
                  </p>
                )}
              </div>
              <div className="order-items">
                {order.items.map((i) => (
                  <div key={i.product_id}>
                    <div>
                      <span>{displayTitle(i.artist)}</span>
                      <strong>{displayTitle(i.title)}</strong>
                      <small>
                        {i.format.toUpperCase()} · {i.quantity}{" "}
                        {i.quantity === 1 ? "unidad" : "unidades"}
                      </small>
                    </div>
                    <strong>{money(i.unit_price * i.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="checkout-total">
                <div>
                  <span>Discos</span>
                  <strong>{money(order.subtotal)}</strong>
                </div>
                <div>
                  <span>
                    {order.delivery === "pickup"
                      ? "Retiro en tienda"
                      : "Despacho"}
                  </span>
                  <strong>
                    {order.shipping_cost === null
                      ? "Por coordinar"
                      : money(order.shipping_cost)}
                  </strong>
                </div>
                {order.shipping_cost !== null && (
                  <div className="grand-total">
                    <strong>Total</strong>
                    <strong>
                      {money(order.subtotal + order.shipping_cost)}
                    </strong>
                  </div>
                )}
                <p>
                  Pago:{" "}
                  {order.payment_status === "paid"
                    ? "Recibido"
                    : order.payment_status === "refunded"
                      ? "Reembolsado"
                      : "Por coordinar con la tienda"}
                </p>
              </div>
            </div>
            <aside className="order-help">
              <h2>Coordina tu pedido</h2>
              <p>
                Menciona <strong>{order.code}</strong> al escribirnos.
              </p>
              <External
                className="button red"
                href={
                  cfg.whatsapp
                    ? "https://wa.me/" +
                      cfg.whatsapp +
                      "?text=" +
                      encodeURIComponent(
                        "Hola, quiero coordinar el pedido " + order.code,
                      )
                    : cfg.instagram
                }
              >
                {cfg.whatsapp
                  ? "Coordinar por WhatsApp"
                  : "Coordinar por Instagram"}
              </External>
              <button className="button outline" onClick={() => void copy()}>
                <Copy size={17} />
                {copied ? "Enlace copiado" : "Copiar enlace del pedido"}
              </button>
              <button className="text-link" onClick={() => window.print()}>
                <Printer size={16} /> Imprimir resumen
              </button>
              <button
                className="text-link"
                onClick={() => setRefresh((n) => n + 1)}
              >
                Actualizar estado <ArrowRight size={15} />
              </button>
              <p className="private-note">
                <ShieldCheck size={16} /> Tu enlace es privado. Guárdalo para
                consultar el estado.
              </p>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
function StoreVisit({ cfg }: { cfg: StoreSettings }) {
  return (
    <section className="store-visit" aria-label="Visita la tienda">
      <div className="visit-copy">
        <p className="eyebrow">La tienda</p>
        <h2>
          {cfg.address}
          <span>{cfg.city}</span>
        </h2>
        <External href={cfg.maps} className="underlined-link">
          Cómo llegar
        </External>
      </div>
      <div className="visit-hours">
        <Clock size={20} />
        <div>
          <h3>Horario de atención</h3>
          <p>{cfg.hours}</p>
          <small>Domingo cerrado</small>
        </div>
      </div>
      <div className="visit-contact">
        <Instagram size={20} />
        <div>
          <h3>Hablemos de discos</h3>
          <External href={cfg.instagram}>@elrinconcitodelrock</External>
          {cfg.shippingEnabled && (
            <p>
              Entregas en Concepción.
              <br />
              Envíos a todo Chile.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
function About({
  cfg,
  navigate,
}: {
  cfg: StoreSettings;
  navigate: (s: string) => void;
}) {
  return (
    <>
      <section className="section about-hero">
        <div>
          <p className="eyebrow">Concepción, Chile</p>
          <h1>La tienda.</h1>
          <p className="intro">
            Somos El Rinconcito del Rock. Vinilos, CDs y música que se lleva a
            casa.
          </p>
          <p className="muted">
            Visítanos en {cfg.address} o encuentra tu próximo disco en nuestro
            catálogo. Hacemos entregas en Concepción y alrededores, y envíos a
            todo Chile.
          </p>
          <a
            className="button"
            href="/tienda"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              navigate("/tienda");
            }}
          >
            Explorar catálogo
            <ArrowRight size={18} />
          </a>
        </div>
        <div className="about-badge">
          <Logo />
        </div>
      </section>
      <StoreVisit cfg={cfg} />
      <section className="instagram-banner">
        <Instagram size={26} />
        <div>
          <h2>Lo nuevo está en Instagram.</h2>
          <p>Discos, novedades y fotos de la tienda.</p>
        </div>
        <External href={cfg.instagram} className="button outline">
          Ver publicaciones
        </External>
      </section>
    </>
  );
}
function RequestForm() {
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email"),
          artist: f.get("artist"),
          title: f.get("title"),
          format: f.get("format"),
          notes: f.get("notes"),
          consent: f.get("consent") === "on",
        }),
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return sent ? (
    <Empty title="Queda anotado en nuestra lista.">
      <Check size={25} />
      <p>
        Recibimos tu búsqueda. Si podemos encontrar ese disco, te contactaremos
        al correo que dejaste.
      </p>
    </Empty>
  ) : (
    <form className="request-form" onSubmit={submit}>
      <h2>¿Qué disco buscas?</h2>
      <p>Cuéntanos el artista y álbum. Te contactaremos si lo encontramos.</p>
      <div className="form-row">
        <label>
          Artista
          <input name="artist" required minLength={2} maxLength={200} />
        </label>
        <label>
          Álbum
          <input name="title" required maxLength={250} />
        </label>
      </div>
      <label>
        Formato
        <select name="format">
          <option>Cualquiera</option>
          <option>Vinilo</option>
          <option>CD</option>
        </select>
      </label>
      <label>
        Tu nombre
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
        />
      </label>
      <label>
        Tu correo
        <input
          name="email"
          required
          type="email"
          maxLength={200}
          autoComplete="email"
        />
      </label>
      <label>
        Edición o detalles <span className="muted">(opcional)</span>
        <textarea name="notes" maxLength={1000} rows={2} />
      </label>
      <label className="checkbox-label consent">
        <input name="consent" type="checkbox" required />
        <span>
          Acepto que usen estos datos para responder mi búsqueda.{" "}
          <a href="/privacidad" target="_blank">
            Ver privacidad.
          </a>
        </span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button red full" disabled={busy}>
        {busy ? "Anotando tu búsqueda…" : "Enviar mi búsqueda"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
function InfoPage({ page, cfg }: { page: string; cfg: StoreSettings }) {
  const help = page === "/ayuda",
    privacy = page === "/privacidad";
  const faqs = [
    [
      "¿Cómo hago un pedido?",
      `Agrega discos a la bolsa, elige retiro o despacho y completa tus datos. Al confirmar, tu selección queda reservada por ${cfg.reservationHours} horas. Contacta a la tienda con tu número de pedido para coordinar el pago y la entrega.`,
    ],
    [
      "¿Puedo retirar en tienda?",
      `Sí, sin costo en ${cfg.address}, ${cfg.city}. Horario: ${cfg.hours}. Domingo cerrado. Coordina tu retiro antes de venir.`,
    ],
    ["¿Hacen envíos?", cfg.shippingInfo],
    [
      "¿Cómo pago?",
      "La tienda funciona con pedidos y reservas. El pago se coordina directamente con el negocio; no se solicitan datos de tarjetas en este sitio. Tu pedido se confirma después de registrar el pago recibido.",
    ],
    [
      "¿Las fotos son del ejemplar?",
      "Las carátulas se usan como referencia del álbum. La edición, presentación y condición del ejemplar pueden variar. Pide fotos y los detalles del disco a la tienda antes de confirmar la compra. Los discos sin carátula verificada muestran un marcador sin imagen.",
    ],
    [
      "¿Qué pasa si un disco se agota?",
      "El stock se comprueba al reservar. Si otra persona reservó la última unidad, verás un aviso y podrás ajustar tu bolsa. Las reservas no confirmadas se liberan al vencer.",
    ],
    ["¿Puedo cambiar o devolver un disco?", cfg.returnInfo],
    [
      "¿Cómo sigo mi pedido?",
      "Al reservar recibes un enlace privado donde puedes consultar el estado. Guárdalo. También puedes contactar a la tienda con tu número de pedido.",
    ],
  ];
  return (
    <section className="section info-page">
      <p className="eyebrow">Información</p>
      <h1>
        {help
          ? "Pedidos y entregas"
          : privacy
            ? "Privacidad"
            : "Condiciones de compra"}
      </h1>
      {help ? (
        <div className="faq-list">
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={20} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      ) : privacy ? (
        <div className="prose">
          <h2>Qué datos usamos</h2>
          <p>
            Para gestionar tu pedido guardamos tu nombre, correo, teléfono,
            selección de discos y, si solicitas despacho, la dirección de
            entrega. Para una búsqueda guardamos tu nombre, correo y el disco
            solicitado.
          </p>
          <h2>Para qué los usamos</h2>
          <p>
            Solo para gestionar pedidos, coordinar entregas, responder consultas
            y mantener el registro de las ventas. El personal autorizado de la
            tienda accede a estos datos a través de un panel privado. Los datos
            necesarios para despachar un pedido pueden compartirse con el
            transportista que se acuerde contigo.
          </p>
          <h2>Tu dispositivo y las cookies</h2>
          <p>
            La bolsa y los favoritos se guardan en tu navegador. El panel de
            administración utiliza una cookie de sesión necesaria para mantener
            el acceso. No usamos cookies de publicidad ni rastreadores de
            marketing.
          </p>
          <h2>Tus solicitudes</h2>
          <p>
            Puedes pedir acceso, corrección o eliminación de tus datos
            contactando a la tienda por Instagram e indicando el pedido o
            consulta. Conservaremos los registros que deban mantenerse para
            cumplir obligaciones legales o gestionar una compra pendiente.
          </p>
          <h2>Servicios y enlaces externos</h2>
          <p>
            El sitio se aloja en Cloudflare. Los enlaces a Instagram y Google
            Maps te llevan a servicios externos con sus propias políticas de
            privacidad.
          </p>
        </div>
      ) : (
        <div className="prose">
          <h2>Pedidos y reservas</h2>
          <p>
            La confirmación del formulario crea una reserva de stock por{" "}
            {cfg.reservationHours} horas. La reserva no equivale a un pago ni a
            una compra confirmada. Los pedidos no confirmados se liberan al
            vencer.
          </p>
          <h2>Precios y disponibilidad</h2>
          <p>
            Los precios se expresan en pesos chilenos (CLP). El precio y stock
            vigente se comprueban al crear el pedido. El despacho se presenta
            por separado; cuando requiere cotización, se acuerda contigo antes
            del pago. No se agregan cobros ocultos al reservar.
          </p>
          <h2>Edición y condición</h2>
          <p>
            Las imágenes son carátulas de referencia. Para conocer edición,
            origen, condición y presentación exacta, solicita los detalles y
            fotos del ejemplar antes de pagar. No se atribuye una condición de
            conservación que no haya sido confirmada por la tienda.
          </p>
          <h2>Pago y entrega</h2>
          <p>
            Los medios de pago se coordinan directamente con el negocio. El
            sitio no procesa tarjetas. El retiro se coordina en {cfg.address},{" "}
            {cfg.city}. {cfg.shippingInfo}
          </p>
          <h2>Cambios, devoluciones y problemas</h2>
          <p>
            {cfg.returnInfo} Estas condiciones no limitan los derechos que
            correspondan conforme a la legislación aplicable.
          </p>
          <h2>Contacto</h2>
          <p>
            El Rinconcito del Rock · {cfg.address}, {cfg.city} ·
            @elrinconcitodelrock.
          </p>
        </div>
      )}
      <div className="help-contact">
        <Mail size={24} />
        <div>
          <strong>¿Te quedó otra duda?</strong>
          <p>Contáctanos por Instagram.</p>
        </div>
        <External className="button outline" href={cfg.instagram}>
          Escribir por Instagram
        </External>
      </div>
    </section>
  );
}
