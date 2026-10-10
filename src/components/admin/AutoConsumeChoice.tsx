import { Link } from 'react-router-dom';
import { Segmented } from './kit';

type Choice = 'inherit' | 'on' | 'off';

const toChoice = (value: boolean | null): Choice => (value === null ? 'inherit' : value ? 'on' : 'off');
const fromChoice = (choice: Choice): boolean | null => (choice === 'inherit' ? null : choice === 'on');

/**
 * Whether starting a dish takes its recipe off stock, set at one level. A branch or a dish can follow
 * the level above it (`null`) or say on or off for itself, so a single dish can be exempt from a
 * restaurant that tracks everything, or tracked in one that mostly doesn't.
 */
export function AutoConsumeChoice({ value, onChange, inheritLabel }: { value: boolean | null; onChange: (next: boolean | null) => void; inheritLabel: string }) {
  return (
    <Segmented
      label="Take stock off automatically"
      value={toChoice(value)}
      onChange={(choice) => onChange(fromChoice(choice))}
      options={[
        { value: 'inherit', label: inheritLabel },
        { value: 'on', label: 'On' },
        { value: 'off', label: 'Off' },
      ]}
    />
  );
}

/** Shown in place of the controls when the plan does not include automatic stock use. */
export function AutoConsumeLockedNote() {
  return (
    <p className="rounded-xl bg-surface-2/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-3 ring-1 ring-hairline ring-inset">
      Automatic stock use is not part of your plan, so stock is only changed by hand.{' '}
      <Link to="/admin/plan" className="font-semibold text-flame-1">
        See plans
      </Link>
    </p>
  );
}
