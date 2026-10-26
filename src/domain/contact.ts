// TODO: replace with the real Feastox sales WhatsApp number (digits only, with country code).
const SALES_WHATSAPP_NUMBER = '9813648886';

/** A WhatsApp chat with the Feastox team, text prefilled. */
export const salesWhatsAppUrl = (text: string): string => `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
