/** Staff phone numbers follow the sign-up rule: ten digits, nothing else. */
export const PHONE_LENGTH = 10;

/** Keeps typing honest: digits only, capped at ten. */
export const cleanPhone = (value: string) => value.replace(/\D/g, '').slice(0, PHONE_LENGTH);

/** `undefined` when fine; an empty number is fine (it is optional everywhere it is used). */
export const phoneError = (value: string): string | undefined =>
  value === '' || value.length === PHONE_LENGTH ? undefined : `Enter a ${PHONE_LENGTH} digit phone number.`;
