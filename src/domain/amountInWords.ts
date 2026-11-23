const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', below100(n % 100)].filter(Boolean).join(' ');

/** Whole number in the Nepali/Indian grouping: thousand, lakh, crore, arab. */
function words(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const arab = Math.floor(n / 1_000_000_000);
  const rest = n % 1_000_000_000;
  for (const [value, unit] of [[arab, 'Arab'], [Math.floor(rest / 10_000_000), 'Crore'], [Math.floor((rest % 10_000_000) / 100_000), 'Lakh'], [Math.floor((rest % 100_000) / 1000), 'Thousand']] as const) {
    if (value) parts.push(`${below100(value)} ${unit}`);
  }
  const hundreds = rest % 1000;
  if (hundreds) parts.push(below1000(hundreds));
  return parts.join(' ');
}

/** "Rs. One Thousand Two Hundred Thirty and Fifty Paisa Only" for minor units (paisa); null for any currency but NPR. */
export function amountInWords(minor: number, currency: string): string | null {
  if (currency !== 'NPR' || !Number.isInteger(minor) || minor < 0) return null;
  const rupees = Math.floor(minor / 100);
  const paisa = minor % 100;
  return `Rs. ${words(rupees)}${paisa ? ` and ${below100(paisa)} Paisa` : ''} Only`;
}
