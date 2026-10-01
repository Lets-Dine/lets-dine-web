/**
 * Every number on this page is the real seed data from `data/menu.ts` and
 * `data/staff.ts` — the same restaurant a visitor lands on from `/demo`. A
 * dish here is always the dish it claims to be, at the rating it actually has.
 */

export const RESTAURANT_NAME = 'Sekuwa Ghar';
export const RESTAURANT_TAGLINE = 'Charcoal grill & Newari kitchen · Thamel, Kathmandu';

export interface LandingDish {
  name: string;
  description: string;
  image: string;
  price: string;
  rating: number;
  ratingCount: number;
  taste: number;
  portion: number;
  value: number;
  recommendRate: number;
  orders30d: number;
  ordersPrev30d: number;
  tags: [string, number][];
}

export const HERO_DISH: LandingDish = {
  name: 'Chicken Sekuwa',
  description: 'Boneless thigh marinated overnight in timur, garlic and mustard oil, grilled over open charcoal.',
  image: '/img/chicken-sekuwa.jpg',
  price: 'Rs. 450',
  rating: 4.8,
  ratingCount: 238,
  taste: 4.8,
  portion: 4.4,
  value: 4.5,
  recommendRate: 0.89,
  orders30d: 212,
  ordersPrev30d: 181,
  tags: [
    ['Smoky', 164],
    ['Juicy', 131],
    ['Large portion', 74],
  ],
};

export const DISH_COMMENTS = [
  { name: 'Anjali R.', text: 'Smoky char, falls off the bone. Best sekuwa in Thamel, and I have checked.' },
  { name: 'Bikash T.', text: 'Ask for extra chiura. Portion is generous for the price, I never finish it alone.' },
  { name: 'Sabina K.', text: 'Went back three times this month just for this plate.' },
];

export const MENU_DISHES: LandingDish[] = [
  HERO_DISH,
  {
    name: 'Buff Jhol Momo',
    description: 'Steamed buff momo swimming in a warm sesame-and-tomato jhol.',
    image: '/img/jhol-momo.jpg',
    price: 'Rs. 320',
    rating: 4.9,
    ratingCount: 176,
    taste: 4.9,
    portion: 4.6,
    value: 4.7,
    recommendRate: 0.96,
    orders30d: 158,
    ordersPrev30d: 94,
    tags: [
      ['Delicious', 141],
      ['Spicy', 88],
    ],
  },
  {
    name: 'Chicken Steam Momo',
    description: 'Ten hand-folded dumplings, thin skin, minced thigh meat with ginger and spring onion.',
    image: '/img/steam-momo.jpg',
    price: 'Rs. 280',
    rating: 4.7,
    ratingCount: 512,
    taste: 4.8,
    portion: 4.5,
    value: 4.7,
    recommendRate: 0.93,
    orders30d: 480,
    ordersPrev30d: 452,
    tags: [
      ['Delicious', 288],
      ['Juicy', 201],
    ],
  },
  {
    name: 'Thakali Khana Set',
    description: 'Rice, black dal, seasonal tarkari, gundruk, chicken curry and achar. Unlimited rice and dal.',
    image: '/img/thakali-set.jpg',
    price: 'Rs. 520',
    rating: 4.7,
    ratingCount: 302,
    taste: 4.7,
    portion: 4.9,
    value: 4.8,
    recommendRate: 0.94,
    orders30d: 331,
    ordersPrev30d: 302,
    tags: [
      ['Large portion', 214],
      ['Good value', 178],
    ],
  },
  {
    name: 'Aloo Sadeko',
    description: 'Warm potato tossed with mustard oil, fenugreek, sesame paste, lime and green chilli.',
    image: '/img/aloo-sadeko.jpg',
    price: 'Rs. 180',
    rating: 4.5,
    ratingCount: 190,
    taste: 4.6,
    portion: 4.4,
    value: 4.8,
    recommendRate: 0.9,
    orders30d: 262,
    ordersPrev30d: 238,
    tags: [
      ['Good value', 132],
      ['Fresh', 88],
    ],
  },
  {
    name: 'Juju Dhau',
    description: 'The king curd, set in a clay pot in Bhaktapur. Sweet, thick, faintly smoky from the pot.',
    image: '/img/juju-dhau.jpg',
    price: 'Rs. 200',
    rating: 4.9,
    ratingCount: 84,
    taste: 4.9,
    portion: 4.4,
    value: 4.7,
    recommendRate: 0.97,
    orders30d: 61,
    ordersPrev30d: 44,
    tags: [
      ['Delicious', 72],
      ['Great presentation', 31],
    ],
  },
];

export const CATEGORIES = [
  { name: 'Momo', emoji: '🥟' },
  { name: 'Sekuwa & Grills', emoji: '🔥' },
  { name: 'Starters', emoji: '🥗' },
  { name: 'Main Course', emoji: '🍛' },
  { name: 'Noodles & Rice', emoji: '🍜' },
  { name: 'Drinks', emoji: '🥤' },
  { name: 'Desserts', emoji: '🍮' },
];

export const TOP_DISHES = [
  { name: 'Chicken Steam Momo', rating: 4.7, orders: 480 },
  { name: 'Thakali Khana Set', rating: 4.7, orders: 331 },
  { name: 'Chicken Sekuwa', rating: 4.8, orders: 212 },
];

export const DASHBOARD_STATS = {
  ordersToday: 184,
  revenueToday: 'Rs. 96,420',
  avgRating: 4.6,
  ratingCount: 1248,
  repeatRate: 0.412,
};

export const CROSS_SELL_INSIGHT = '72% of Chicken Sekuwa orders this month also added extra chilli achar.';

/** Covers served per day, Monday through Sunday, for the week the dashboard shows. */
export const WEEK_ORDERS = [
  { day: 'Mon', orders: 118 },
  { day: 'Tue', orders: 132 },
  { day: 'Wed', orders: 124 },
  { day: 'Thu', orders: 161 },
  { day: 'Fri', orders: 208 },
  { day: 'Sat', orders: 246 },
  { day: 'Sun', orders: 184 },
] as const;

/** How the 1,248 ratings fall across one to five stars. */
export const RATING_DISTRIBUTION = [21, 34, 96, 331, 766] as const;

/** Dishes losing ground — the half of analytics most dashboards quietly omit. */
export const NEEDS_ATTENTION = [
  { name: 'Crispy Calamari', rating: 3.9, change: -0.4, note: 'Portion mentioned in 3 of 5 recent reviews' },
  { name: 'Veg Chowmein', rating: 4.1, change: -0.2, note: 'Orders down 18% against last month' },
] as const;

export const RESTAURANT_TYPES = [
  { name: 'Cafés', description: 'Fast turnover, high repeat visits — let regulars rediscover the menu.', image: '/img/mango-lassi.jpg' },
  { name: 'Casual dining', description: 'Big menus, mixed parties — help the table decide faster.', image: '/img/thakali-set.jpg' },
  { name: 'Fine dining', description: 'Every plate is a decision — back it with the room’s own verdict.', image: '/img/mutton-sekuwa.jpg' },
  { name: 'Food courts', description: 'Dozens of counters, one scan — surface what each stall is known for.', image: '/img/chowmein.jpg' },
  { name: 'Restaurant chains', description: 'One dashboard across every branch, dish by dish.', image: '/img/tandoori-chicken.jpg' },
  { name: 'Dessert bars', description: 'Small menus where every item has to earn its place.', image: '/img/sikarni.jpg' },
];

export const VERIFIED_REVIEWS = [
  {
    dish: 'Buff Jhol Momo',
    image: '/img/jhol-momo.jpg',
    rating: 5,
    text: 'Drink the broth first, then eat — the server was right. Ordering again next week.',
    name: 'Priya M.',
    verified: 'Verified · ordered 2 days ago',
  },
  {
    dish: 'Chicken Sekuwa',
    image: '/img/chicken-sekuwa.jpg',
    rating: 5,
    text: 'Char on the outside, still juicy inside. Worth the 15 minute wait.',
    name: 'Nabin S.',
    verified: 'Verified · ordered 6 days ago',
  },
  {
    dish: 'Thakali Khana Set',
    image: '/img/thakali-set.jpg',
    rating: 4,
    text: 'Unlimited dal and rice is no joke. Gundruk could be less salty.',
    name: 'Kripa A.',
    verified: 'Verified · ordered 1 week ago',
  },
];
