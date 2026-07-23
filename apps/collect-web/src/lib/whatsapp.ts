// Build a wa.me deep link that opens WhatsApp with the message (and, when we
// have it, the customer's number) ready to send. No WhatsApp Business API —
// this just hands off to whatever WhatsApp the staff member already uses.
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  // UK-diaspora senders mostly use +44 numbers typed as 07... — normalise
  // that one common national form; anything already carrying a country code
  // (447…, 263…) is used as-is. Empty → wa.me opens the contact picker.
  const intl = digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
  const base = intl ? `https://wa.me/${intl}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}
