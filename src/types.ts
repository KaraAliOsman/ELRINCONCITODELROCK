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
}
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
    .toLocaleLowerCase("es-CL")
    .replace(/(^|\s|[(/])\p{L}/gu, (c) => c.toLocaleUpperCase("es-CL"));
export const statusName: Record<string, string> = {
  pending: "Por confirmar",
  confirmed: "Confirmado",
  ready: "Listo para retiro",
  shipped: "Enviado",
  completed: "Entregado",
  cancelled: "Cancelado",
  expired: "Reserva vencida",
};
