import type { Dish, DishStats, DiningTable, MenuCategory, Restaurant } from '../domain/types';

const rs = (rupees: number) => rupees * 100;

export const RESTAURANT: Restaurant = {
  id: 'rst_01',
  name: 'Sekuwa Ghar',
  slug: 'sekuwa-ghar',
  tagline: 'Charcoal grill & Newari kitchen',
  description:
    'Open charcoal grill, hand-folded momo and a Thakali kitchen that has been running since 1998. Everything below is rated only by people who actually ate here.',
  coverImageUrl: '/img/cover.jpg',
  currency: 'NPR',
  timezone: 'Asia/Kathmandu',
  avgRating: 4.6,
  ratingCount: 1248,
  serviceChargeRate: 0.1,
  taxRate: 0.13,
};

/** The floor plan. Tokens are opaque and stable — they get printed on tables. */
const TABLE_SEEDS: [name: string, token: string, capacity: number][] = [
  ['Table 1', 'q2Wd83NmXy7bTr', 2],
  ['Table 2', 'k9Lp41VcHs2gWn', 2],
  ['Table 3', 'm4Rt76ZbQx9dLf', 4],
  ['Table 4', 'p8Yn52JkCw3vMs', 4],
  ['Table 5', 'v6Hd19TgRp5nQz', 4],
  ['Table 6', 'b3Xs94FmKt8wYc', 6],
  ['Table 7', 'n7Gq35PdLv2hRb', 6],
  ['Table 8', 'c5Zk68WnBy4tXm', 4],
  ['Table 9', 'j1Vf27QsMd9pKw', 2],
  ['Table 10', 'r4Bm83HxNc6zTg', 8],
  ['Table 11', 'w9Tc51KrDf3jVn', 4],
  ['Table 12', 'x7Hk92QpLr4mZv', 4],
  ['Terrace 1', 'g2Nw46YbSt7cHq', 6],
  ['Terrace 2', 'd8Jp73MvXk1fRy', 6],
];

const FLOOR_OPENED = '2026-01-12T04:00:00.000Z';

export const TABLES: DiningTable[] = TABLE_SEEDS.map(([name, qrToken, capacity], index) => ({
  id: `tbl_${index + 1}`,
  restaurantId: RESTAURANT.id,
  name,
  qrToken,
  capacity,
  isActive: true,
  sortOrder: index,
  createdAt: FLOOR_OPENED,
}));

/** The table the demo QR points at. */
export const TABLE: DiningTable = TABLES[11];

export const CATEGORIES: MenuCategory[] = [
  { id: 'cat_momo', restaurantId: RESTAURANT.id, name: 'Momo', emoji: '🥟', sortOrder: 1 },
  { id: 'cat_grill', restaurantId: RESTAURANT.id, name: 'Sekuwa & Grills', emoji: '🔥', sortOrder: 2 },
  { id: 'cat_start', restaurantId: RESTAURANT.id, name: 'Starters', emoji: '🥗', sortOrder: 3 },
  { id: 'cat_main', restaurantId: RESTAURANT.id, name: 'Main Course', emoji: '🍛', sortOrder: 4 },
  { id: 'cat_noodle', restaurantId: RESTAURANT.id, name: 'Noodles & Rice', emoji: '🍜', sortOrder: 5 },
  { id: 'cat_drink', restaurantId: RESTAURANT.id, name: 'Drinks', emoji: '🥤', sortOrder: 6 },
  { id: 'cat_sweet', restaurantId: RESTAURANT.id, name: 'Desserts', emoji: '🍮', sortOrder: 7 },
];

/** [overall, count, taste, portion, value, recommendRate, orders30d, ordersPrev30d] */
type StatTuple = [number, number, number, number, number, number, number, number];

function stats(t: StatTuple | null, topTags: [string, number][] = []): DishStats {
  if (!t) {
    return {
      ratingCount: 0,
      avgRating: null,
      taste: null,
      portion: null,
      value: null,
      recommendRate: null,
      distribution: [0, 0, 0, 0, 0],
      orders30d: 0,
      ordersPrev30d: 0,
      topTags: [],
    };
  }
  const [overall, count, taste, portion, value, rec, o30, oPrev] = t;
  return {
    ratingCount: count,
    avgRating: overall,
    taste,
    portion,
    value,
    recommendRate: rec,
    distribution: distributionFor(overall, count),
    orders30d: o30,
    ordersPrev30d: oPrev,
    topTags: topTags.map(([tag, n]) => ({ tag, count: n })),
  };
}

/**
 * Reconstructs a plausible 1-5 histogram that averages to `overall`.
 * Only used to seed demo data — real stats come from the reviews table.
 */
function distributionFor(overall: number, count: number): [number, number, number, number, number] {
  const weights = [1, 2, 3, 4, 5].map((star) => Math.exp(-Math.pow(star - overall, 2) / 0.62));
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / total) * count);
  const out = raw.map((n) => Math.floor(n));
  let remainder = count - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((n, i) => [n - Math.floor(n), i] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);
  for (const i of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out as [number, number, number, number, number];
}

interface DishSeed {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image: string | null;
  veg?: boolean;
  spice?: 0 | 1 | 2 | 3;
  featured?: boolean;
  unavailable?: boolean;
  stats: StatTuple | null;
  tags?: [string, number][];
}

const SEEDS: DishSeed[] = [
  // ── Momo ──────────────────────────────────────────────────────────
  {
    id: 'dsh_steam_momo',
    categoryId: 'cat_momo',
    name: 'Chicken Steam Momo',
    description:
      'Ten hand-folded dumplings, thin skin, minced thigh meat with ginger and spring onion. Served with the house sesame–tomato achar.',
    price: rs(280),
    image: '/img/steam-momo.jpg',
    spice: 1,
    stats: [4.7, 512, 4.8, 4.5, 4.7, 0.93, 480, 452],
    tags: [['Delicious', 288], ['Juicy', 201], ['Good value', 154]],
  },
  {
    id: 'dsh_jhol_momo',
    categoryId: 'cat_momo',
    name: 'Buff Jhol Momo',
    description:
      'Steamed buff momo swimming in a warm sesame-and-tomato jhol. Drink the broth first, then eat. That is the correct order.',
    price: rs(320),
    image: '/img/jhol-momo.jpg',
    spice: 2,
    featured: true,
    stats: [4.9, 176, 4.9, 4.6, 4.7, 0.96, 158, 94],
    tags: [['Delicious', 141], ['Spicy', 88], ['Great presentation', 52]],
  },
  {
    id: 'dsh_fry_momo',
    categoryId: 'cat_momo',
    name: 'Veg Fry Momo',
    description: 'Cabbage, carrot and paneer momo, pan-fried until the base is lacquered and crisp.',
    price: rs(260),
    image: '/img/fry-momo.jpg',
    veg: true,
    stats: [4.3, 88, 4.4, 4.2, 4.3, 0.79, 96, 101],
    tags: [['Crispy', 61], ['Fresh', 30]],
  },
  {
    id: 'dsh_chilli_momo',
    categoryId: 'cat_momo',
    name: 'Chilli Momo',
    description: 'Fried momo tossed with capsicum, onion and a dark, glossy chilli-garlic sauce.',
    price: rs(340),
    image: '/img/chilli-momo.jpg',
    spice: 3,
    stats: [4.5, 64, 4.6, 4.3, 4.2, 0.84, 70, 40],
    tags: [['Spicy', 58], ['Delicious', 31]],
  },

  // ── Sekuwa & Grills ───────────────────────────────────────────────
  {
    id: 'dsh_chicken_sekuwa',
    categoryId: 'cat_grill',
    name: 'Chicken Sekuwa',
    description:
      'Boneless thigh marinated overnight in timur, garlic and mustard oil, then grilled over open charcoal. Served with chiura and mula ko achar.',
    price: rs(450),
    image: '/img/chicken-sekuwa.jpg',
    spice: 2,
    featured: true,
    stats: [4.8, 238, 4.8, 4.4, 4.5, 0.89, 212, 181],
    tags: [['Smoky', 164], ['Juicy', 131], ['Large portion', 74]],
  },
  {
    id: 'dsh_mutton_sekuwa',
    categoryId: 'cat_grill',
    name: 'Mutton Sekuwa',
    description: 'Bone-in mutton, slow-grilled and finished with a squeeze of lime and crushed timur.',
    price: rs(620),
    image: '/img/mutton-sekuwa.jpg',
    spice: 2,
    stats: [4.6, 41, 4.8, 4.1, 4.0, 0.85, 55, 50],
    tags: [['Smoky', 33], ['Expensive', 14]],
  },
  {
    id: 'dsh_tandoori',
    categoryId: 'cat_grill',
    name: 'Tandoori Chicken (Half)',
    description: 'Yoghurt and kashmiri chilli marinade, blistered in the clay oven, finished with butter.',
    price: rs(550),
    image: '/img/tandoori-chicken.jpg',
    spice: 2,
    stats: [4.4, 120, 4.5, 4.5, 4.1, 0.81, 132, 121],
    tags: [['Large portion', 78], ['Juicy', 45]],
  },
  {
    id: 'dsh_wings',
    categoryId: 'cat_grill',
    name: 'Peri Peri Wings',
    description: 'Six wings, double-fried for crunch, tossed in a bright, vinegary peri peri.',
    price: rs(420),
    image: '/img/peri-wings.jpg',
    spice: 3,
    stats: [4.6, 27, 4.7, 4.2, 4.3, 0.88, 38, 18],
    tags: [['Crispy', 24], ['Spicy', 19]],
  },

  // ── Starters ──────────────────────────────────────────────────────
  {
    id: 'dsh_aloo_sadeko',
    categoryId: 'cat_start',
    name: 'Aloo Sadeko',
    description: 'Warm potato tossed with mustard oil, fenugreek, sesame paste, lime and green chilli.',
    price: rs(180),
    image: '/img/aloo-sadeko.jpg',
    veg: true,
    spice: 1,
    stats: [4.5, 190, 4.6, 4.4, 4.8, 0.9, 262, 238],
    tags: [['Good value', 132], ['Fresh', 88], ['Spicy', 44]],
  },
  {
    id: 'dsh_chicken_chilli',
    categoryId: 'cat_start',
    name: 'Chicken Chilli',
    description: 'Crisp-fried chicken wok-tossed with onion, capsicum and green chilli. A drinking dish.',
    price: rs(420),
    image: '/img/chicken-chilli.jpg',
    spice: 3,
    stats: [4.2, 96, 4.3, 4.1, 4.0, 0.72, 104, 98],
    tags: [['Spicy', 71], ['Crispy', 38]],
  },
  {
    id: 'dsh_calamari',
    categoryId: 'cat_start',
    name: 'Crispy Calamari',
    description: 'Salt-and-pepper squid rings with a lime aioli.',
    price: rs(480),
    image: '/img/calamari.jpg',
    unavailable: true,
    stats: [3.9, 34, 4.0, 3.7, 3.6, 0.55, 30, 36],
    tags: [['Crispy', 18], ['Expensive', 15], ['Small portion', 12]],
  },
  {
    id: 'dsh_papaya',
    categoryId: 'cat_start',
    name: 'Green Papaya Sadeko',
    description: 'Shredded raw papaya, peanut, lime and timur. Cold, sharp and very crunchy.',
    price: rs(220),
    image: '/img/papaya-salad.jpg',
    veg: true,
    spice: 2,
    stats: [4.6, 12, 4.7, 4.3, 4.6, 0.91, 24, 20],
    tags: [['Fresh', 11], ['Spicy', 7]],
  },

  // ── Main Course ───────────────────────────────────────────────────
  {
    id: 'dsh_thakali',
    categoryId: 'cat_main',
    name: 'Thakali Khana Set',
    description:
      'Rice, black dal, seasonal tarkari, gundruk, chicken curry, achar and a small bowl of dahi. Unlimited rice and dal.',
    price: rs(520),
    image: '/img/thakali-set.jpg',
    spice: 1,
    featured: true,
    stats: [4.7, 302, 4.7, 4.9, 4.8, 0.94, 331, 302],
    tags: [['Large portion', 214], ['Good value', 178], ['Delicious', 121]],
  },
  {
    id: 'dsh_mutton_curry',
    categoryId: 'cat_main',
    name: 'Mutton Curry',
    description: 'Bone-in mutton cooked down slowly with onion, tomato and whole spices until the gravy darkens.',
    price: rs(580),
    image: '/img/mutton-curry.jpg',
    spice: 2,
    stats: [4.5, 78, 4.7, 4.3, 4.0, 0.83, 88, 70],
    tags: [['Delicious', 52], ['Spicy', 29]],
  },
  {
    id: 'dsh_paneer',
    categoryId: 'cat_main',
    name: 'Paneer Butter Masala',
    description: 'House-set paneer in a tomato and cashew gravy, finished with butter and kasuri methi.',
    price: rs(420),
    image: '/img/paneer.jpg',
    veg: true,
    spice: 1,
    stats: [4.4, 110, 4.5, 4.3, 4.2, 0.8, 118, 112],
    tags: [['Mild', 62], ['Kid friendly', 41]],
  },
  {
    id: 'dsh_kalo_dal',
    categoryId: 'cat_main',
    name: 'Kalo Dal Tadka',
    description: 'Black lentils simmered overnight, tempered with cumin, dried chilli and a lot of ghee.',
    price: rs(260),
    image: '/img/kalo-dal.jpg',
    veg: true,
    spice: 1,
    stats: [4.6, 145, 4.6, 4.5, 4.9, 0.92, 212, 140],
    tags: [['Good value', 98], ['Delicious', 76], ['Kid friendly', 33]],
  },

  // ── Noodles & Rice ────────────────────────────────────────────────
  {
    id: 'dsh_chowmein',
    categoryId: 'cat_noodle',
    name: 'Chicken Chowmein',
    description: 'Wok-fried noodles with cabbage, carrot and chicken. The Kathmandu default.',
    price: rs(300),
    image: '/img/chowmein.jpg',
    spice: 1,
    stats: [4.1, 288, 4.1, 4.3, 4.2, 0.68, 302, 311],
    tags: [['Large portion', 121], ['Mild', 88]],
  },
  {
    id: 'dsh_thukpa',
    categoryId: 'cat_noodle',
    name: 'Chicken Thukpa',
    description: 'Hand-pulled noodles in a long-simmered chicken broth with vegetables and coriander.',
    price: rs(340),
    image: '/img/thukpa.jpg',
    spice: 1,
    stats: [4.6, 96, 4.7, 4.6, 4.5, 0.9, 112, 61],
    tags: [['Delicious', 68], ['Large portion', 39]],
  },
  {
    id: 'dsh_fried_rice',
    categoryId: 'cat_noodle',
    name: 'Chicken Fried Rice',
    description: 'Day-old rice, egg, spring onion and chicken, fried hard over a high flame.',
    price: rs(320),
    image: '/img/fried-rice.jpg',
    stats: [4.0, 130, 4.0, 4.2, 4.1, 0.65, 141, 138],
    tags: [['Mild', 66], ['Large portion', 41]],
  },
  {
    id: 'dsh_veg_noodle',
    categoryId: 'cat_noodle',
    name: 'Veg Noodle Bowl',
    description: 'Cold rice noodles, herbs, peanut and a lime-chilli dressing.',
    price: rs(280),
    image: '/img/veg-noodle.jpg',
    veg: true,
    spice: 1,
    stats: [4.4, 20, 4.5, 4.2, 4.3, 0.8, 30, 28],
    tags: [['Fresh', 16]],
  },

  // ── Drinks ────────────────────────────────────────────────────────
  {
    id: 'dsh_lassi',
    categoryId: 'cat_drink',
    name: 'Mango Lassi',
    description: 'Thick set curd blended with Maldah mango pulp and a pinch of cardamom.',
    price: rs(190),
    image: '/img/mango-lassi.jpg',
    veg: true,
    stats: [4.8, 143, 4.9, 4.5, 4.5, 0.94, 181, 152],
    tags: [['Delicious', 96], ['Kid friendly', 52]],
  },
  {
    id: 'dsh_chiya',
    categoryId: 'cat_drink',
    name: 'Masala Chiya',
    description: 'Milk tea boiled with cardamom, clove and fresh ginger. Served in a glass.',
    price: rs(90),
    image: null,
    veg: true,
    stats: [4.5, 208, 4.6, 4.2, 4.9, 0.91, 402, 381],
    tags: [['Good value', 168], ['Delicious', 92]],
  },
  {
    id: 'dsh_iced_tea',
    categoryId: 'cat_drink',
    name: 'Everest Iced Tea',
    description: 'New this week — black tea, lime, mint and a little jaggery syrup, over crushed ice.',
    price: rs(160),
    image: null,
    veg: true,
    stats: null,
  },

  // ── Desserts ──────────────────────────────────────────────────────
  {
    id: 'dsh_juju',
    categoryId: 'cat_sweet',
    name: 'Juju Dhau',
    description: 'The king curd, set in a clay pot in Bhaktapur. Sweet, thick, faintly smoky from the pot.',
    price: rs(200),
    image: '/img/juju-dhau.jpg',
    veg: true,
    stats: [4.9, 84, 4.9, 4.4, 4.7, 0.97, 61, 44],
    tags: [['Delicious', 72], ['Great presentation', 31]],
  },
  {
    id: 'dsh_sikarni',
    categoryId: 'cat_sweet',
    name: 'Sikarni',
    description: 'Hung curd whipped with cardamom, saffron and pistachio.',
    price: rs(220),
    image: '/img/sikarni.jpg',
    veg: true,
    stats: [4.7, 39, 4.8, 4.2, 4.4, 0.92, 45, 40],
    tags: [['Delicious', 30], ['Small portion', 9]],
  },
  {
    id: 'dsh_gulab',
    categoryId: 'cat_sweet',
    name: 'Gulab Jamun',
    description: 'Two warm khoya dumplings in cardamom syrup.',
    price: rs(180),
    image: '/img/gulab-jamun.jpg',
    veg: true,
    stats: [4.3, 55, 4.4, 4.0, 4.3, 0.76, 66, 62],
    tags: [['Delicious', 35], ['Small portion', 14]],
  },
];

export const DISHES: Dish[] = SEEDS.map((seed, index) => ({
  id: seed.id,
  restaurantId: RESTAURANT.id,
  categoryId: seed.categoryId,
  name: seed.name,
  slug: seed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  description: seed.description,
  imageUrl: seed.image,
  price: seed.price,
  currency: RESTAURANT.currency,
  isAvailable: !seed.unavailable,
  isArchived: false,
  isFeatured: Boolean(seed.featured),
  sortOrder: index,
  spiceLevel: seed.spice ?? 0,
  isVeg: Boolean(seed.veg),
  stats: stats(seed.stats, seed.tags),
}));
