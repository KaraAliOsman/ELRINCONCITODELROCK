import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Disc3, ArrowUpRight, Plus, Heart } from "lucide-react";
import { displayTitle, formatLabel, money, type Product } from "./types";

export function Record({ className = "" }: { className?: string }) {
  return (
    <div className={"record " + className} aria-hidden="true">
      <div className="record-label">
        <img src="/assets/logo.jpg" alt="" width="150" height="150" />
        <i />
      </div>
    </div>
  );
}
export function Logo() {
  return (
    <img
      className="brand"
      src="/assets/logo.jpg"
      alt="El Rinconcito del Rock"
      width="150"
      height="150"
    />
  );
}
export function Modal({
  title,
  onClose,
  children,
  drawer = false,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  drawer?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<Element | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const [keyboardOpen] = useState(
    () => document.activeElement?.matches(":focus-visible") ?? false,
  );
  function close(immediate = false) {
    if (
      immediate ||
      keyboardOpen ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onClose();
      return;
    }
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, 180);
  }
  useEffect(() => {
    back.current = document.activeElement;
    ref.current?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.body.style.overflow = before;
      if (back.current instanceof HTMLElement) back.current.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${drawer ? "drawer" : ""} ${wide ? "wide" : ""}`}
      aria-label={title}
      data-closing={closing}
      data-keyboard-open={keyboardOpen}
      onCancel={(e) => {
        e.preventDefault();
        close(true);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(e.detail === 0);
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <span className="eyebrow">{title}</span>
          <button
            onClick={(e) => close(e.detail === 0)}
            aria-label="Cerrar ventana"
            className="icon-button"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Cover({ p, eager = false }: { p: Product; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p.image]);
  return p.image && !failed ? (
    <img
      className="cover-image"
      src={p.image}
      alt={`${p.image.includes("/illustrative-") ? "Ilustración de catálogo para" : "Carátula de referencia de"} ${displayTitle(p.title)} — ${displayTitle(p.artist)}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      width="600"
      height="600"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="sleeve">
      <span>{p.format === "vinilo" ? "VINILO" : "CD"}</span>
      <Disc3 strokeWidth={0.6} />
      <strong>{displayTitle(p.artist)}</strong>
      <small>{displayTitle(p.title)}</small>
      <span className="sleeve-caption">SIN FOTO DEL EJEMPLAR</span>
    </div>
  );
}
export function ProductCard({
  p,
  onOpen,
  onAdd,
  onFavorite,
  favorite = false,
  eager = false,
}: {
  p: Product;
  onOpen: (p: Product) => void;
  onAdd: (p: Product) => void;
  onFavorite: (p: Product) => void;
  favorite?: boolean;
  eager?: boolean;
}) {
  return (
    <article className="product-card">
      <div className="product-art">
        <a
          className="art-button"
          href={"/disco/" + p.slug}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onOpen(p);
          }}
          aria-label={`Ver ${displayTitle(p.title)} de ${displayTitle(p.artist)}`}
        >
          <Cover p={p} eager={eager} />
        </a>
        <button
          className={`favorite-button ${favorite ? "saved" : ""}`}
          onClick={() => onFavorite(p)}
          aria-label={`${favorite ? "Quitar" : "Guardar"} ${displayTitle(p.title)} ${favorite ? "de" : "en"} favoritos`}
          aria-pressed={favorite}
        >
          <Heart size={17} fill={favorite ? "currentColor" : "none"} />
        </button>
        {p.stock === 0 && <span className="sold-out">Agotado</span>}
      </div>
      <div className="product-meta">
        <div className="product-caption">
          <span className="format-tag">{formatLabel(p)}</span>
          <h3>{displayTitle(p.artist)}</h3>
          <a
            className="title-button"
            href={"/disco/" + p.slug}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              onOpen(p);
            }}
          >
            {displayTitle(p.title)}
          </a>
        </div>
        <div className="product-price">
          <strong>{money(p.price)}</strong>
          <button
            aria-label={`Agregar ${displayTitle(p.title)} a la bolsa`}
            className="add-button"
            onClick={() => onAdd(p)}
            disabled={!p.stock}
          >
            <Plus size={21} />
          </button>
        </div>
      </div>
      <span className="last-copy" aria-hidden={p.stock !== 1}>
        {p.stock === 1 ? "Queda 1" : "\u00a0"}
      </span>
    </article>
  );
}
export function Loading({ cards = false }: { cards?: boolean }) {
  return cards ? (
    <div
      className="product-grid skeleton-grid"
      aria-label="Cargando discos"
      aria-busy="true"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i}>
          <div className="skeleton square" />
          <div className="skeleton line" />
          <div className="skeleton short" />
        </div>
      ))}
    </div>
  ) : (
    <div className="loading" role="status">
      <Disc3 className="spin" /> Cargando…
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Disc3 size={56} strokeWidth={1} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function External({
  href,
  children,
  className = "text-link",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
      <ArrowUpRight size={18} />
    </a>
  );
}
