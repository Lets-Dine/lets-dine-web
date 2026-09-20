export type OrderItem = {
  name: string;
  qty: number;
  unitPrice: number;
  course: "Starter" | "Main" | "Drink" | "Dessert";
  firedAt: string;
};

export type Table = {
  id: string;
  label: string;
  seats: number;
  occupied: boolean;
  disabled?: boolean;
  seatedMinutes?: number;
  server?: string;
  items: OrderItem[];
};

export const MENU: Omit<OrderItem, "qty" | "firedAt">[] = [
  { name: "Bread & cultured butter", unitPrice: 6, course: "Starter" },
  { name: "Charred octopus", unitPrice: 24, course: "Starter" },
  { name: "Braised short rib", unitPrice: 29, course: "Main" },
  { name: "Saffron risotto", unitPrice: 22.5, course: "Main" },
  { name: "Steak frites", unitPrice: 34, course: "Main" },
  { name: "House red (glass)", unitPrice: 12, course: "Drink" },
  { name: "Espresso", unitPrice: 4, course: "Drink" },
  { name: "Burnt-honey tart", unitPrice: 12, course: "Dessert" },
];

export const TAX_RATE = 0.085;

export const VENUE = {
  name: "The Copper Stove",
  tagline: "Est. 1987 · Service Pass",
  shift: "Shift 14:00–22:00",
  lead: "Chef M. Okafor",
};

const mains: OrderItem[] = [
  { name: "Braised short rib", qty: 2, unitPrice: 29, course: "Main", firedAt: "19:12" },
  { name: "Saffron risotto", qty: 1, unitPrice: 22.5, course: "Main", firedAt: "19:14" },
  { name: "Smoked trout crêpe", qty: 1, unitPrice: 19, course: "Starter", firedAt: "18:58" },
  { name: "House red (glass)", qty: 2, unitPrice: 12, course: "Drink", firedAt: "18:52" },
  { name: "Burnt-honey tart", qty: 1, unitPrice: 12, course: "Dessert", firedAt: "19:40" },
];

export const initialTables: Table[] = [
  { id: "t1", label: "T1", seats: 4, occupied: true, seatedMinutes: 38, server: "Ines", items: mains },
  { id: "t2", label: "T2", seats: 2, occupied: false, items: [] },
  {
    id: "t3",
    label: "T3",
    seats: 6,
    occupied: true,
    seatedMinutes: 12,
    server: "Bruno",
    items: [
      { name: "Oysters, mignonette", qty: 6, unitPrice: 4.5, course: "Starter", firedAt: "20:02" },
      { name: "Duck rillettes", qty: 1, unitPrice: 16, course: "Starter", firedAt: "20:05" },
      { name: "Sparkling water", qty: 3, unitPrice: 5, course: "Drink", firedAt: "20:00" },
      { name: "Steak frites", qty: 1, unitPrice: 34, course: "Main", firedAt: "20:11" },
    ],
  },
  { id: "t4", label: "T4", seats: 4, occupied: false, items: [] },
  {
    id: "t5",
    label: "T5",
    seats: 2,
    occupied: true,
    seatedMinutes: 64,
    server: "Ines",
    items: [
      { name: "Tasting menu", qty: 2, unitPrice: 78, course: "Main", firedAt: "18:30" },
      { name: "Champagne (glass)", qty: 2, unitPrice: 18, course: "Drink", firedAt: "18:26" },
      { name: "Cheese trolley", qty: 1, unitPrice: 18.75, course: "Dessert", firedAt: "19:48" },
    ],
  },
  { id: "t6", label: "T6", seats: 8, occupied: false, items: [] },
  {
    id: "t7",
    label: "T7",
    seats: 4,
    occupied: true,
    seatedMinutes: 21,
    server: "Marek",
    items: [
      { name: "Charred octopus", qty: 2, unitPrice: 24, course: "Starter", firedAt: "20:14" },
      { name: "Negroni", qty: 3, unitPrice: 14, course: "Drink", firedAt: "20:10" },
      { name: "Bread & cultured butter", qty: 2, unitPrice: 6, course: "Starter", firedAt: "20:12" },
    ],
  },
  { id: "t8", label: "T8", seats: 2, occupied: false, items: [] },
  {
    id: "t9",
    label: "T9",
    seats: 4,
    occupied: true,
    seatedMinutes: 52,
    server: "Bruno",
    items: [
      { name: "Coq au vin", qty: 2, unitPrice: 31, course: "Main", firedAt: "19:22" },
      { name: "Beaujolais (bottle)", qty: 1, unitPrice: 52, course: "Drink", firedAt: "19:18" },
      { name: "Île flottante", qty: 2, unitPrice: 11, course: "Dessert", firedAt: "20:01" },
    ],
  },
  { id: "t10", label: "T10", seats: 6, occupied: false, items: [] },
  {
    id: "t11",
    label: "T11",
    seats: 2,
    occupied: true,
    seatedMinutes: 8,
    server: "Marek",
    items: [
      { name: "Pastis", qty: 2, unitPrice: 9, course: "Drink", firedAt: "20:26" },
      { name: "Olives & almonds", qty: 1, unitPrice: 7.5, course: "Starter", firedAt: "20:27" },
    ],
  },
  { id: "t12", label: "T12", seats: 4, occupied: false, items: [] },
  {
    id: "t13",
    label: "T13",
    seats: 8,
    occupied: true,
    seatedMinutes: 77,
    server: "Ines",
    items: [
      { name: "Bouillabaisse", qty: 4, unitPrice: 36, course: "Main", firedAt: "18:44" },
      { name: "Rosé (bottle)", qty: 2, unitPrice: 44, course: "Drink", firedAt: "18:40" },
      { name: "Tarte tatin", qty: 3, unitPrice: 12, course: "Dessert", firedAt: "19:58" },
      { name: "Espresso", qty: 4, unitPrice: 4, course: "Drink", firedAt: "20:12" },
    ],
  },
  { id: "t14", label: "T14", seats: 2, occupied: false, items: [] },
  { id: "t15", label: "T15", seats: 4, occupied: false, items: [] },
  { id: "t16", label: "T16", seats: 6, occupied: false, items: [] },
];

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const subtotalOf = (t: Table) =>
  t.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

export const totalsOf = (t: Table) => {
  const subtotal = subtotalOf(t);
  const tax = subtotal * TAX_RATE;
  return { subtotal, tax, total: subtotal + tax };
};

export const elapsed = (minutes?: number) => {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
