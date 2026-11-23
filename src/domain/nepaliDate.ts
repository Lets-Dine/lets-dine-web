/**
 * Miti: the Bikram Sambat date IRD invoices carry. There is no formula for BS month lengths, so they are a table (from the
 * nepali-date-converter data, checked against Hamro Patro's Shrawan 1 dates). The sources agree for BS 2082 to 2087 and
 * differ by a day from 2088, so past the end of 2087 we print no Miti rather than a wrong one — extend the table then.
 */
const FIRST = { year: 2082, ad: Date.UTC(2025, 3, 14) }; // 1 Baisakh 2082
const MONTHS: number[][] = [
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
];

/** "2083-08-08" for the Nepal calendar day `at` falls on, or null outside the verified range. */
export function toMiti(at: Date, timeZone = 'Asia/Kathmandu'): string | null {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number);
  let left = Math.round((Date.UTC(y, m - 1, d) - FIRST.ad) / 86_400_000);
  if (left < 0) return null;
  for (const [i, months] of MONTHS.entries()) {
    for (const [month, days] of months.entries()) {
      if (left < days) return `${FIRST.year + i}-${String(month + 1).padStart(2, '0')}-${String(left + 1).padStart(2, '0')}`;
      left -= days;
    }
  }
  return null;
}
