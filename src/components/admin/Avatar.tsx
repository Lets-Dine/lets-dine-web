import { ImageUpload } from './ImageUpload';
import { getAvatarSignature } from '../../api/staff';
import { cx } from '../ui';

const hueOf = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 40);

/** A person's photo, or their initial on a tint taken from their name when they have none. */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const hue = hueOf(name);
  if (src) return <img src={src} alt="" className={cx('shrink-0 rounded-full object-cover', className)} />;
  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center rounded-full font-display font-bold', className)}
      style={{ background: `oklch(0.92 0.06 ${hue})`, color: `oklch(0.34 0.08 ${hue})` }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** The photo with its upload and remove actions: a square crop, shown round. */
export function AvatarPicker({ name, value, onChange, disabled }: { name: string; value: string | null; onChange: (url: string | null) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={value} className="size-20 text-[30px]" />
      <div className="flex flex-wrap items-center gap-2">
        <ImageUpload
          target="staff-avatar"
          aspect={1}
          signer={getAvatarSignature}
          label={value ? 'Change photo' : 'Add a photo'}
          disabled={disabled}
          onUploaded={onChange}
          className="h-9 px-4 text-[13.5px]"
        />
        {value && !disabled && (
          <button type="button" onClick={() => onChange(null)} className="px-2 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
