import { ShieldIcon } from "@/components/market/icons";

// Anti-leakage Layer 3 (SCRUM-260): the single source of the protection message.
// Shown, non-dismissable, at every point of contact (checkout + conversations)
// so paying off-platform is always visibly the worse choice. Change the wording
// here and it changes everywhere — never hardcode this copy inline.
export const PROTECTION_COPY = {
  headline: "Only orders paid through Faira are protected.",
  body:
    "Paying off-platform — cash, EcoCash, or a bank transfer arranged in chat — is at your own risk: no escrow, no refunds, and no dispute support.",
};

export function ProtectionNotice({ className = "" }: { className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 ${className}`}
    >
      <ShieldIcon size={15} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-semibold">{PROTECTION_COPY.headline}</span> {PROTECTION_COPY.body}
      </span>
    </div>
  );
}
