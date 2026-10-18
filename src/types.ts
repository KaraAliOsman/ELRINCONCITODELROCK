export interface Product {
  id: string;
  slug: string;
  artist: string;
  title: string;
  format: "vinilo" | "cd";
  content: string;
  language: "es" | "en";
  category: string;
  price: number;
  stock: number;
  image: string;
  description: string;
  featured: number;
  active: number;
  version: number;
  source?: string;
  barcode?: string;
  retail_barcode?: string;
}
// Two D1 statements per row, within the Free plan's 50-query request limit.
export const IMPORT_BATCH_SIZE = 20;
export interface StoreSettings {
  address: string;
  city: string;
  hours: string;
  instagram: string;
  maps: string;
  whatsapp: string;
  email: string;
  shippingEnabled: boolean;
  shippingCost: number | null;
  pickupEnabled: boolean;
  reservationHours: number;
  shippingInfo: string;
  returnInfo: string;
  paymentMode: "reservation";
}
export interface OrderItem {
  product_id: string;
  artist: string;
  title: string;
  format: string;
  quantity: number;
  unit_price: number;
}
export interface Order {
  channel: "web" | "store";
  id: string;
  code: string;
  token?: string;
  customer_name: string;
  email: string;
  phone: string;
  delivery: "pickup" | "shipping";
  address: string;
  city: string;
  region: string;
  notes: string;
  subtotal: number;
  shipping_cost: number | null;
  status: string;
  payment_status: string;
  tracking: string;
  admin_notes?: string;
  created_at: string;
  expires_at: string;
  items: OrderItem[];
}
export const money = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
export const formatLabel = (p: Pick<Product, "content">) => {
  const value = p.content.toUpperCase().replace(/\s/g, "");
  const labels: Record<string, string> = {
    "1VIN": "Vinilo",
    VIN: "Vinilo",
    "1CD": "CD",
    CD: "CD",
    BOX: "Box",
    "1CS": "Cassette",
    "1BLURAY": "Blu-ray",
  };
  return (
    labels[value] ||
    value
      .replace(/VIN/g, "LP")
      .replace(/CDS/g, "CD")
      .replace(/BLURAY/g, "Blu-ray")
      .replace(/(\d)(LP|CD|DVD)/g, "$1 $2")
      .replace(/\+/g, " + ")
  );
};
export const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/\band\b/g, "y")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const displayTitle = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase("es-CL")
    .replace(/(^|\s|[(/])\p{L}/gu, (c) => c.toLocaleUpperCase("es-CL"))
    .replace(
      /\b(And|Of|To|For|A|An|In|On|At|The|With|From|El|La|Los|Las|De|Del|Y|En|Con)\b/g,
      (word, _group: string, offset: number) =>
        offset === 0 ? word : word.toLowerCase(),
    )
    .replace(
      /\b(ac\s*\/\s*dc|r\.e\.m\.|abba|inxs|ufo|nofx|ep|lp|cd|dvd|mtv|ii|iii|iv|vi|vii|viii|ix)\b/gi,
      (word) => word.toUpperCase(),
    )
    .replace(/\br\.e\.m\./gi, "R.E.M.")
    .replace(/\bZz\b/g, "ZZ");
export const statusName: Record<string, string> = {
  pending: "Por confirmar",
  confirmed: "Confirmado",
  ready: "Listo para retiro",
  shipped: "Enviado",
  completed: "Entregado",
  cancelled: "Cancelado",
  expired: "Reserva vencida",
};
