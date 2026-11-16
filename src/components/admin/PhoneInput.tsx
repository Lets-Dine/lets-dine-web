import { cleanPhone } from '../../domain/phone';
import { TextInput } from './kit';

/** Ten digits, nothing else: typing anything else is simply ignored, as on the sign-up form. */
export function PhoneInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return <TextInput value={value} onChange={(v) => onChange(cleanPhone(v))} type="tel" inputMode="numeric" maxLength={10} placeholder="98XXXXXXXX" autoComplete="off" className="tnum" />;
}
