import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Disc3, ArrowUpRight, Plus, Heart } from "lucide-react";
import { displayTitle, money, type Product } from "./types";

export function Record({
  className = "",
  label = "EL RINCONCITO / DEL ROCK",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={"record " + className} aria-hidden="true">
      <div className="record-label">
        <span>33⅓ RPM · CONCEPCIÓN</span>
        <strong>
          {label.split("/").map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </strong>
        <i />
        <small>LADO A · BUENA MÚSICA</small>
      </div>
    </div>
  );
}
export function Logo() {
  return (
    <span className="brand">
      <span className="brand-disc">
        <Disc3 size={40} strokeWidth={1.5} />
      </span>
      <span>
        EL RINCONCITO
        <br />
        <b>
          DEL ROCK<span className="brand-dot">.</span>
        </b>
      </span>
    </span>
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
  useEffect(() => {
    back.current = document.activeElement;
    ref.current?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      if (back.current instanceof HTMLElement) back.current.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${drawer ? "drawer" : ""} ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <span className="eyebrow">{title}</span>
          <button
            onClick={onClose}
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
      alt={`Carátula de referencia de ${displayTitle(p.title)} — ${displayTitle(p.artist)}`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      width="600"
      height="600"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`sleeve sleeve-${Number(p.id.replace(/\D/g, "")) % 5}`}>
      <span>{p.format === "vinilo" ? "LONG PLAY" : "COMPACT DISC"}</span>
      <Disc3 strokeWidth={0.6} />
      <strong>{displayTitle(p.artist)}</strong>
      <small>{displayTitle(p.title)}</small>
      <span className="sleeve-caption">PORTADA ILUSTRATIVA · {p.content}</span>
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
        <button
          className="art-button"
          onClick={() => onOpen(p)}
          aria-label={`Ver ${displayTitle(p.title)} de ${displayTitle(p.artist)}`}
        >
          <Cover p={p} eager={eager} />
          <span className="art-fallback">
            <Disc3 />
            <span>
              {displayTitle(p.artist)}
              <br />
              {displayTitle(p.title)}
            </span>
          </span>
        </button>
        <span className="format-tag">
          {p.content.replace(/\s/g, " ").toUpperCase()}
        </span>
        <button
          className={`favorite-button ${favorite ? "saved" : ""}`}
          onClick={() => onFavorite(p)}
          aria-label={`${favorite ? "Quitar" : "Guardar"} ${displayTitle(p.title)} en favoritos`}
          aria-pressed={favorite}
        >
          <Heart size={17} fill={favorite ? "currentColor" : "none"} />
        </button>
        {p.stock === 0 && <span className="sold-out">Agotado</span>}
      </div>
      <div className="product-meta">
        <div>
          <p>{displayTitle(p.artist)}</p>
          <button className="title-button" onClick={() => onOpen(p)}>
            {displayTitle(p.title)}
          </button>
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
      {p.stock === 1 && (
        <span className="last-copy">Última unidad disponible</span>
      )}
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
      <Disc3 className="spin" /> Un momento, estamos revisando la batea.
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
