import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import { displayTitle, formatLabel, money, type Product } from "./types";

export function Barcode({ code }: { code: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (ref.current)
      JsBarcode(ref.current, code, {
        format: "CODE128",
        width: 2,
        height: 80,
        margin: 0,
        marginLeft: 24,
        marginRight: 24,
        marginTop: 2,
        marginBottom: 2,
        displayValue: false,
        lineColor: "#000",
        background: "#fff",
      });
  }, [code]);
  return <svg ref={ref} role="img" aria-label={`Código de barras ${code}`} />;
}

function Label({ p, price }: { p: Product; price: boolean }) {
  return (
    <div className="barcode-label">
      <span className="barcode-brand">EL RINCONCITO DEL ROCK</span>
      <strong>{displayTitle(p.artist)}</strong>
      <span className="barcode-album">{displayTitle(p.title)}</span>
      <div className="barcode-meta">
        <span>{formatLabel(p)}</span>
        {price && <b>{money(p.price)}</b>}
      </div>
      <Barcode code={p.barcode!} />
      <code>{p.barcode}</code>
    </div>
  );
}

export function BarcodeLabels({ products }: { products: Product[] }) {
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [price, setPrice] = useState(true);
  const [layout, setLayout] = useState("a4");
  const valid = products.filter((p) => p.barcode);
  const count = valid.reduce((n, p) => n + (copies[p.id] ?? 1), 0);
  const allowed = count > 0 && count <= 300;
  const labels = allowed
    ? valid.flatMap((p) =>
        Array.from({ length: copies[p.id] ?? 1 }, (_, i) => (
          <Label key={p.id + "-" + i} p={p} price={price} />
        )),
      )
    : [];
  return (
    <div className="barcode-manager">
      <h2>Etiquetas de inventario</h2>
      <p>Un mismo título usa el mismo código en todos sus ejemplares.</p>
      <div className="label-options">
        <label>
          Papel
          <select value={layout} onChange={(e) => setLayout(e.target.value)}>
            <option value="a4">A4 · etiquetas de 64 × 38 mm</option>
            <option value="thermal">Rollo · una etiqueta de 60 × 40 mm</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={price}
            onChange={(e) => setPrice(e.target.checked)}
          />{" "}
          Incluir precio
        </label>
      </div>
      <div className="label-quantities">
        {valid.map((p) => (
          <label key={p.id}>
            <span>
              <strong>{displayTitle(p.artist)}</strong>
              <span>{displayTitle(p.title)}</span>
              <code>{p.barcode}</code>
            </span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              aria-label={`Etiquetas de ${displayTitle(p.title)}`}
              value={copies[p.id] ?? 1}
              onChange={(e) =>
                setCopies((c) => ({
                  ...c,
                  [p.id]: Math.max(
                    0,
                    Math.min(100, Math.floor(Number(e.target.value) || 0)),
                  ),
                }))
              }
            />
          </label>
        ))}
      </div>
      <div className="label-actions">
        <button
          type="button"
          className="button outline small"
          onClick={() =>
            setCopies(
              Object.fromEntries(
                valid.map((p) => [p.id, Math.min(p.stock, 100)]),
              ),
            )
          }
        >
          Una por unidad disponible
        </button>
        <button
          type="button"
          className="button small"
          disabled={!allowed}
          onClick={() => window.print()}
        >
          <Printer size={16} />
          Imprimir {count} {count === 1 ? "etiqueta" : "etiquetas"}
        </button>
      </div>
      {!allowed && (
        <p className="error" role="alert">
          Selecciona entre 1 y 300 etiquetas por impresión.
        </p>
      )}
      <p className="label-print-tip">
        Imprime al 100 %, sin ajustar a página ni encabezados. Prueba una
        etiqueta con tu lector antes de imprimir el lote.
      </p>
      {allowed && (
        <div className="label-preview" aria-label="Vista previa de etiqueta">
          <Label
            p={valid.find((p) => (copies[p.id] ?? 1) > 0)!}
            price={price}
          />
          <span>Vista previa · Code 128</span>
        </div>
      )}
      {createPortal(
        <div id="barcode-print-root" className={layout}>
          <style>{`@media print { @page { size: ${layout === "thermal" ? "60mm 40mm" : "A4 portrait"}; margin: ${layout === "thermal" ? "0" : "7mm"}; } }`}</style>
          <div className="barcode-sheet">{labels}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
