import type { Review } from '../domain/types';
import { DISHES } from './menu';

/**
 * Seeded demo reviews. Every one of these is anchored to a completed order —
 * the app has no code path that can display an unverified review.
 */

interface Written {
  dishId: string;
  overall: number;
  comment: string;
  tags: string[];
  daysAgo: number;
  again: boolean;
}

const WRITTEN: Written[] = [
  {
    dishId: 'dsh_chicken_sekuwa',
    overall: 5,
    comment: 'Smoky and juicy, and the achar that comes with it is excellent. Ask for extra chiura.',
    tags: ['Smoky', 'Juicy'],
    daysAgo: 2,
    again: true,
  },
  {
    dishId: 'dsh_chicken_sekuwa',
    overall: 5,
    comment: 'Best sekuwa I have had on this side of the ring road. Charcoal flavour is real, not liquid smoke.',
    tags: ['Smoky', 'Large portion'],
    daysAgo: 5,
    again: true,
  },
  {
    dishId: 'dsh_chicken_sekuwa',
    overall: 4,
    comment: 'Very tasty, slightly spicier than I expected. Portion was good for two people sharing.',
    tags: ['Spicy'],
    daysAgo: 9,
    again: true,
  },
  {
    dishId: 'dsh_chicken_sekuwa',
    overall: 4,
    comment: 'Great flavour but a couple of pieces were a little dry. Still ordering it again.',
    tags: [],
    daysAgo: 14,
    again: true,
  },
  {
    dishId: 'dsh_jhol_momo',
    overall: 5,
    comment: 'The jhol is the whole point. Sesame-heavy, warm, slightly nutty. I drank the leftover broth.',
    tags: ['Delicious', 'Spicy'],
    daysAgo: 1,
    again: true,
  },
  {
    dishId: 'dsh_jhol_momo',
    overall: 5,
    comment: 'Skin was thin and did not break. Everything arrived hot. This is the dish to order here.',
    tags: ['Great presentation'],
    daysAgo: 4,
    again: true,
  },
  {
    dishId: 'dsh_steam_momo',
    overall: 5,
    comment: 'Ten pieces for Rs. 280 is honestly a steal. Filling is well seasoned, not just onion.',
    tags: ['Good value', 'Juicy'],
    daysAgo: 3,
    again: true,
  },
  {
    dishId: 'dsh_steam_momo',
    overall: 4,
    comment: 'Solid momo. The achar could be spicier for my taste but I asked and they brought chilli.',
    tags: ['Mild'],
    daysAgo: 8,
    again: true,
  },
  {
    dishId: 'dsh_thakali',
    overall: 5,
    comment: 'Came hungry, left defeated. They refilled dal twice without being asked. Gundruk was excellent.',
    tags: ['Large portion', 'Good value'],
    daysAgo: 2,
    again: true,
  },
  {
    dishId: 'dsh_thakali',
    overall: 5,
    comment: 'Proper Thakali set. The chicken curry has actual depth and the achar rotates by season.',
    tags: ['Delicious'],
    daysAgo: 6,
    again: true,
  },
  {
    dishId: 'dsh_chowmein',
    overall: 3,
    comment: 'Fine, but nothing special. Order the thukpa instead if you want noodles.',
    tags: ['Mild'],
    daysAgo: 3,
    again: false,
  },
  {
    dishId: 'dsh_chowmein',
    overall: 4,
    comment: 'Generous plate and properly hot from the wok. Standard chowmein done competently.',
    tags: ['Large portion'],
    daysAgo: 11,
    again: true,
  },
  {
    dishId: 'dsh_calamari',
    overall: 3,
    comment: 'Crisp but a bit chewy, and Rs. 480 for that many rings is steep.',
    tags: ['Expensive', 'Small portion'],
    daysAgo: 7,
    again: false,
  },
  {
    dishId: 'dsh_aloo_sadeko',
    overall: 5,
    comment: 'Sharp, sour, mustard-oil forward. Exactly how it should taste. Get it with the sekuwa.',
    tags: ['Fresh', 'Good value'],
    daysAgo: 2,
    again: true,
  },
  {
    dishId: 'dsh_kalo_dal',
    overall: 5,
    comment: 'Tastes like it has been on the stove all day, because it has. Rs. 260 well spent.',
    tags: ['Good value', 'Delicious'],
    daysAgo: 4,
    again: true,
  },
  {
    dishId: 'dsh_juju',
    overall: 5,
    comment: 'Served in the clay pot, properly set, not runny. Do not skip this.',
    tags: ['Delicious', 'Great presentation'],
    daysAgo: 1,
    again: true,
  },
  {
    dishId: 'dsh_thukpa',
    overall: 5,
    comment: 'Broth is the real thing, clearly simmered for hours. Perfect on a cold evening.',
    tags: ['Delicious'],
    daysAgo: 5,
    again: true,
  },
  {
    dishId: 'dsh_mutton_sekuwa',
    overall: 5,
    comment: 'Expensive but worth it once. Bone-in pieces carry much more flavour than the chicken.',
    tags: ['Smoky', 'Expensive'],
    daysAgo: 6,
    again: true,
  },
  {
    dishId: 'dsh_chilli_momo',
    overall: 5,
    comment: 'Genuinely spicy, not a suggestion of spice. Sauce clings to every piece.',
    tags: ['Spicy'],
    daysAgo: 3,
    again: true,
  },
  {
    dishId: 'dsh_lassi',
    overall: 5,
    comment: 'Thick enough that the straw stands up. Not overly sweet.',
    tags: ['Delicious'],
    daysAgo: 2,
    again: true,
  },
  {
    dishId: 'dsh_wings',
    overall: 5,
    comment: 'Very crisp, very sharp sauce. Six wings goes fast between two people.',
    tags: ['Crispy', 'Spicy'],
    daysAgo: 4,
    again: true,
  },
  {
    dishId: 'dsh_paneer',
    overall: 4,
    comment: 'Mild and creamy — good if you are eating with kids. House-made paneer is soft.',
    tags: ['Mild', 'Kid friendly'],
    daysAgo: 9,
    again: true,
  },
  {
    dishId: 'dsh_papaya',
    overall: 5,
    comment: 'Cold, crunchy and sour. Great counterweight to the grilled stuff.',
    tags: ['Fresh'],
    daysAgo: 5,
    again: true,
  },
  {
    dishId: 'dsh_gulab',
    overall: 4,
    comment: 'Warm and soaked all the way through. Two pieces is the right amount.',
    tags: ['Delicious'],
    daysAgo: 8,
    again: true,
  },
  {
    dishId: 'dsh_sikarni',
    overall: 5,
    comment: 'Saffron is actually detectable. Lighter than it looks.',
    tags: ['Delicious'],
    daysAgo: 7,
    again: true,
  },
  {
    dishId: 'dsh_tandoori',
    overall: 4,
    comment: 'Half bird is plenty. Nicely charred, though the marinade could go deeper.',
    tags: ['Large portion'],
    daysAgo: 10,
    again: true,
  },
  {
    dishId: 'dsh_fry_momo',
    overall: 4,
    comment: 'Base was properly lacquered and crisp. Filling is a bit plain on its own.',
    tags: ['Crispy'],
    daysAgo: 12,
    again: true,
  },
  {
    dishId: 'dsh_mutton_curry',
    overall: 5,
    comment: 'Dark, slow-cooked gravy that clings to the rice. Bones give it body.',
    tags: ['Delicious'],
    daysAgo: 6,
    again: true,
  },
  {
    dishId: 'dsh_chicken_chilli',
    overall: 4,
    comment: 'Good with a drink. Loses its crunch quickly, so eat it first.',
    tags: ['Spicy', 'Crispy'],
    daysAgo: 9,
    again: true,
  },
  {
    dishId: 'dsh_fried_rice',
    overall: 4,
    comment: 'Nothing surprising but the rice is properly separate and not oily.',
    tags: ['Mild'],
    daysAgo: 13,
    again: true,
  },
  {
    dishId: 'dsh_chiya',
    overall: 5,
    comment: 'Ninety rupees for a proper glass of masala chiya. Ginger is fresh, not powder.',
    tags: ['Good value'],
    daysAgo: 1,
    again: true,
  },
  {
    dishId: 'dsh_veg_noodle',
    overall: 4,
    comment: 'Refreshing and light, the peanuts make it. Wanted a little more dressing.',
    tags: ['Fresh'],
    daysAgo: 15,
    again: true,
  },
];

const DAY = 86_400_000;
/** Fixed epoch so demo timestamps are stable across reloads. */
const SEED_NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

function starsFrom(overall: number, jitter: number): number {
  return Math.max(1, Math.min(5, Math.round((overall + jitter) * 2) / 2));
}

export const SEED_REVIEWS: Review[] = WRITTEN.map((w, i) => {
  const dish = DISHES.find((d) => d.id === w.dishId);
  const s = dish?.stats;
  return {
    id: `rvw_seed_${i}`,
    dishId: w.dishId,
    orderId: `ord_seed_${i}`,
    overall: w.overall,
    taste: starsFrom(s?.taste ?? w.overall, 0),
    portion: starsFrom(s?.portion ?? w.overall, 0),
    value: starsFrom(s?.value ?? w.overall, 0),
    wouldOrderAgain: w.again,
    comment: w.comment,
    tags: w.tags,
    createdAt: new Date(SEED_NOW - w.daysAgo * DAY).toISOString(),
    verified: true,
  } satisfies Review;
});
