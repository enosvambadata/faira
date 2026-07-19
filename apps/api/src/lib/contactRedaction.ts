// Anti-leakage: detect (and optionally redact) contact info that buyers/sellers
// try to slip into free text to move a deal off-platform onto WhatsApp + EcoCash.
//
// Design priority is PRECISION over recall (per product decision): this runs over
// an auto-parts marketplace full of numbers that look phone-ish — engine codes
// (2NZ-FE, 1KZ-TE), years and year-ranges (2005-2012), OEM part numbers
// (04465-42160, 90915-YZZD1), VINs (17-char alphanumeric), and prices ($650).
// A false positive that mangles a genuine part spec is worse than missing one
// evasive number, so the matchers are deliberately conservative:
//   * phone matches are anchored to Zimbabwe shapes (+263 / 0-lead 10-digit),
//   * never letter-adjacent (excludes engine codes / VINs / lettered part nos),
//   * the OEM 5-5 layout (NNNNN-NNNNN) is explicitly excluded,
//   * 4-digit years and short prices can't reach the digit-count thresholds.
//
// `detectContactInfo` is the shared core. Callers choose the policy:
//   * messaging  -> redactContactInfo (silent redact, keep raw for admins)
//   * listings / profile -> detectContactInfo(...).found -> reject-and-warn

export type ContactKind = "phone" | "email" | "spelled" | "handle";

export interface ContactMatch {
  start: number;
  end: number;
  kind: ContactKind;
  value: string;
}

export interface DetectionResult {
  found: boolean;
  kinds: ContactKind[];
  matches: ContactMatch[];
}

export const REDACTION_PLACEHOLDER = "[hidden — transact through Faira for protection]";

// Shown to users when a write is rejected for containing contact info.
export const CONTACT_INFO_REJECTION =
  "Remove phone numbers, emails, WhatsApp handles or contact details. " +
  "Keep the conversation and payment on Faira — that's the only way an order is protected.";

// A digit "run" separator: the characters people put between digits of a phone
// number (space, dot, dash, and its unicode cousins, plus newlines for numbers
// split across lines). NOT letters — letter-adjacency is how we tell a phone
// from an engine code / VIN / part number.
const SEP = "[\\s.\\-\\u2013\\u2014]?";

// Guard: reject a candidate that is really a Toyota-style OEM part number laid
// out as five digits, a separator, five digits (04465-42160 / 04465 42160).
const OEM_5_5 = /^\d{5}[\s.\-–—]\d{5}$/;

// Zimbabwe mobile in international form: +263 / 263, then 7X and 7 more digits
// (9 national digits total). Not preceded/followed by a letter or digit so it
// can't be a slice of a longer alphanumeric code.
const PHONE_INTL = new RegExp(
  `(?<![A-Za-z0-9])(\\+?263${SEP}7\\d(?:${SEP}\\d){7})(?![A-Za-z0-9])`,
  "g",
);

// Zimbabwe mobile in local form: leading 0 then 9 more digits (0771234567,
// 077 123 4567, 077-123-4567, and split-across-lines variants).
const PHONE_LOCAL = new RegExp(
  `(?<![A-Za-z0-9])(0(?:${SEP}\\d){9})(?![A-Za-z0-9])`,
  "g",
);

const EMAIL = /(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}(?![A-Za-z0-9])/g;

// Off-platform handles / apps and explicit "my number is …" solicitations.
// Word-based, so they never collide with part codes. "call it a day" / "reach
// out" don't match — the follower (me/us/on/at) or app name is required.
const HANDLE = new RegExp(
  [
    "\\b(?:whats?app|telegram|signal|viber|imo|wechat|snapchat|instagram|insta|messenger)\\b",
    "\\b(?:call|text|dm|ping|reach|ring|contact|hit|inbox)\\s+(?:me|us)(?:\\s+(?:on|at|via))?\\b",
    "\\bmy\\s+(?:number|cell|mobile|line|whats?app|contact|digits)\\b",
  ].join("|"),
  "gi",
);

// Digits spelled as words to dodge digit matchers ("zero seven seven one …").
// Require a run of >=7 number-words so a normal sentence ("one gearbox and two
// doors") can't trip it. "o" is excluded — too common as a bare letter.
const NUMBER_WORD = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|niner|double|triple)";
const SPELLED = new RegExp(`\\b(?:${NUMBER_WORD}[\\s,.\\-]+(?:and[\\s,.\\-]+)?){6,}${NUMBER_WORD}\\b`, "gi");

function collect(text: string, re: RegExp, kind: ContactKind, out: ContactMatch[]): void {
  // Each RegExp is module-level with the /g flag; reset lastIndex so repeated
  // calls across messages don't skip matches.
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[1] ?? m[0];
    const start = m.index + m[0].indexOf(value);
    if ((kind === "phone") && OEM_5_5.test(value.trim())) continue; // it's a part number
    out.push({ start, end: start + value.length, kind, value });
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width loops
  }
}

/**
 * Shared detection core. Returns every contact-info span found, without mutating
 * the text. Callers decide whether to redact (messages) or reject (listings,
 * profile). Precision-tuned: see the file header for the must-NOT-match set.
 */
export function detectContactInfo(text: string): DetectionResult {
  if (!text) return { found: false, kinds: [], matches: [] };
  const matches: ContactMatch[] = [];
  collect(text, EMAIL, "email", matches);
  collect(text, PHONE_INTL, "phone", matches);
  collect(text, PHONE_LOCAL, "phone", matches);
  collect(text, HANDLE, "handle", matches);
  collect(text, SPELLED, "spelled", matches);

  matches.sort((a, b) => a.start - b.start);
  const kinds = [...new Set(matches.map(m => m.kind))];
  return { found: matches.length > 0, kinds, matches };
}

/**
 * Redact contact info by replacing each detected span with the placeholder.
 * Overlapping spans (e.g. a handle phrase overlapping a phone) are merged so we
 * never emit a half-replaced token. Used ONLY on messages — listings/profile
 * reject instead so the seller fixes their own copy.
 */
export function redactContactInfo(text: string): { redacted: string; containedContactInfo: boolean } {
  const { matches } = detectContactInfo(text);
  if (matches.length === 0) return { redacted: text, containedContactInfo: false };

  // Merge overlapping/adjacent spans left-to-right.
  const merged: Array<{ start: number; end: number }> = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else merged.push({ start: m.start, end: m.end });
  }

  let result = "";
  let cursor = 0;
  for (const span of merged) {
    result += text.slice(cursor, span.start) + REDACTION_PLACEHOLDER;
    cursor = span.end;
  }
  result += text.slice(cursor);
  return { redacted: result, containedContactInfo: true };
}

/**
 * Reject-and-warn helper for write paths that should refuse contact info rather
 * than silently redact it (listing title/description, profile display name).
 * Returns the name of the first field containing contact info, or null if clean.
 */
export function findContactInfoField(fields: Record<string, string | null | undefined>): string | null {
  for (const [name, value] of Object.entries(fields)) {
    if (value && detectContactInfo(value).found) return name;
  }
  return null;
}

// NOTE(image-OCR): numbers can also be shared as a photo (e.g. a screenshot of a
// phone contact) which text redaction cannot see. We do NOT solve that here.
// Future: when a message carries an imageUrl, run an OCR pass (e.g. a cheap
// vision call or tesseract worker), feed the extracted text through
// detectContactInfo, and set containedContactInfo on the message so the same
// admin review / repeat-offender flagging applies. Not built now.
