interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const Star = ({ size = 14, className, filled = true }: IconProps & { filled?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={filled ? 0 : 1.8}
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 2.6l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.2l-5.72 3.01 1.09-6.37L2.74 9.33l6.4-.93z" />
  </svg>
);

export const StarHalf = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
    <defs>
      <linearGradient id="halfStar">
        <stop offset="50%" stopColor="currentColor" />
        <stop offset="50%" stopColor="transparent" />
      </linearGradient>
    </defs>
    <path
      fill="url(#halfStar)"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      d="M12 2.6l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.2l-5.72 3.01 1.09-6.37L2.74 9.33l6.4-.93z"
    />
  </svg>
);

export const ChevronLeft = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRight = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const Search = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.2-3.2" />
  </svg>
);

export const Plus = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Minus = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} strokeWidth={2.4}>
    <path d="M5 12h14" />
  </svg>
);

export const Bag = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6 8h12l-1 12H7z" />
    <path d="M9 8V6.5a3 3 0 016 0V8" />
  </svg>
);

export const Check = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} strokeWidth={2.6}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export const X = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} strokeWidth={2.2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Leaf = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M20 4c0 9-5.6 14-12 14a8.7 8.7 0 01-2.4-.33C7 12.4 12 8.4 18 7.6 12.6 7.7 7.3 10.6 4.7 15.5A9 9 0 0120 4z" />
  </svg>
);

export const Chilli = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M13.6 3.2c.5-.9 1.9-.6 2 .4.1 1-.5 2-1.5 2.6 2.9 1 4.9 3.8 4.9 7.1 0 4-3.2 7.3-7.2 7.3-4.6 0-7.8-3.6-9.6-8-.3-.8.5-1.6 1.3-1.2 2 .9 3.6.6 5-.6 1.6-1.5 3.2-2.4 5.1-2.5-.6-1.1-.6-2.3 0-3.1z" />
  </svg>
);

export const Clock = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

export const Sparkle = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
    <path d="M19 15l.9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6L15.5 18l2.6-.9z" opacity=".7" />
  </svg>
);

export const Qr = ({ size = 22, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" />
    <path d="M8 8h3v3H8zM13 13h3v3h-3z" strokeWidth={1.5} />
  </svg>
);

export const Info = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const Receipt = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3z" strokeLinejoin="round" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);

export const Grid = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

export const Plate = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const Folder = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7a1 1 0 011-1h4l2 2h8a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1V7z" strokeLinejoin="round" />
  </svg>
);

export const Table = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="5" width="18" height="3" rx="1" />
    <path d="M6 8v11M18 8v11" />
  </svg>
);

export const Layers = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l8 4.5-8 4.5-8-4.5z" />
    <path d="M4 12l8 4.5 8-4.5" />
    <path d="M4 16.5l8 4.5 8-4.5" />
  </svg>
);

export const TrendUp = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 16l5-5 4 3 7-9" />
    <path d="M14 5h6v6" />
  </svg>
);

export const Sliders = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h10M20 7h-1M4 17h6M16 17h4" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="12" cy="17" r="2" />
  </svg>
);

export const Sun = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v1.6M12 19.4V21M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3 12h1.6M19.4 12H21M4.9 19.1L6 18M18 6l1.1-1.1" />
  </svg>
);

export const Moon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M16.5 13.2A7 7 0 119.2 4.4 5.6 5.6 0 0016.5 13.2z" />
  </svg>
);

export const Users = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0111 0" />
    <path d="M15.5 6.2a3 3 0 010 5.6M18.5 19a5 5 0 00-3.3-6.8" />
  </svg>
);

export const History = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3.6 12a8.4 8.4 0 102.4-5.9" />
    <path d="M3.2 4v4.4h4.4" />
    <path d="M12 8v4.4l3 1.8" />
  </svg>
);

export const Cash = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.4" />
  </svg>
);

export const Move = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

export const MapPin = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const Contact = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="9" cy="11" r="2.2" />
    <path d="M5.8 16.2a3.4 3.4 0 016.4 0M14.5 10h3.5M14.5 13.5H18" />
  </svg>
);

/** A ticket with a perforated stub — a plan is a pass you hold. */
export const Ticket = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 9.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.5a2.5 2.5 0 0 0 0-5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
    <path d="M14 5.5v13" strokeDasharray="1.6 2.6" />
  </svg>
);

export const Lock = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="11" width="14" height="9" rx="2.2" />
    <path d="M8.5 11V8.2a3.5 3.5 0 0 1 7 0V11" />
  </svg>
);

export const Alert = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4.2 2.9 19.4a.9.9 0 0 0 .8 1.35h16.6a.9.9 0 0 0 .8-1.35z" />
    <path d="M12 10v4.2M12 17.2h.01" />
  </svg>
);

/* ── Platform console ────────────────────────────────────────────── */

export const Building = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4.5 20.5V6.2a1 1 0 0 1 .7-.95l7-2.3a1 1 0 0 1 1.3.95V20.5" />
    <path d="M13.5 9.5h5a1 1 0 0 1 1 1v10M2.5 20.5h19M8 9.5h2M8 13h2M8 16.5h2" />
  </svg>
);

export const Bell = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6 9.5a6 6 0 0 1 12 0c0 5.2 2 6.5 2 6.5H4s2-1.3 2-6.5z" />
    <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);

export const Shield = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.2 4.8 6v5.6c0 4.3 2.9 7.6 7.2 9.2 4.3-1.6 7.2-4.9 7.2-9.2V6z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </svg>
);

export const Key = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="8" cy="15" r="3.8" />
    <path d="m10.8 12.2 8.4-8.4M16 6.6l2.4 2.4M13.6 9l1.8 1.8" />
  </svg>
);

export const ArrowUpRight = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </svg>
);

export const Download = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4v11M7.5 10.8 12 15.3l4.5-4.5M5 19.5h14" />
  </svg>
);

export const Copy = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
    <path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" />
  </svg>
);

export const Send = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M20.5 3.8 3.8 10.6l6.4 2.4 2.4 6.4z" />
    <path d="m10.2 13 4.4-4.4" />
  </svg>
);

export const Eye = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const Megaphone = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2.5l8 4.2V4.8l-8 4.2H5a1 1 0 0 0-1 1z" />
    <path d="M19 9.5a3.5 3.5 0 0 1 0 5" />
  </svg>
);
