import legalJson from './legal.json';

export const legal = legalJson;

/** Fills `{{company}}`, `{{email}}` and `{{updated}}` from legal.json so each fact is written once. */
export const fillLegal = (text: string) =>
  text.replace(/\{\{(company|email|updated)\}\}/g, (_, key: 'company' | 'email' | 'updated') => legal[key]);
