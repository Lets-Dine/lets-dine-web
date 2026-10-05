import { useEffect, useState } from 'react';
import { cx } from './ui';

/** The restaurant's logo as a square tile. Renders nothing when there is no logo, or it fails to load. */
export function RestaurantMark({ name, logoUrl, className }: { name: string; logoUrl?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  if (!logoUrl || failed) return null;

  return (
    <img
      src={logoUrl}
      alt={`${name} logo`}
      onError={() => setFailed(true)}
      className={cx('shrink-0 rounded-full bg-surface-2 object-cover ring-1 ring-hairline ring-inset', className)}
    />
  );
}
