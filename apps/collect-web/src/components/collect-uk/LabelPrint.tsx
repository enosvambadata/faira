"use client";

export type PaperMode = "a4" | "label";

// When printing to a thermal label printer the roll is a fixed 4x6" (100x150mm)
// and each label must land on its own physical label. This @page rule + the
// per-card page break only apply in Label mode; A4 mode prints several labels
// per sheet as before. Both label pages tag each label with `.label-card`.
export function ThermalLabelStyle({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <style>{`
      @page { size: 100mm 150mm; margin: 4mm; }
      @media print {
        .label-card {
          box-sizing: border-box;
          width: 92mm;
          min-height: 140mm;
          page-break-after: always;
          break-after: page;
        }
        .label-card:last-child { page-break-after: auto; break-after: auto; }
      }
    `}</style>
  );
}

export function PaperModeToggle({ mode, onChange }: { mode: PaperMode; onChange: (m: PaperMode) => void }) {
  return (
    <div className="no-print inline-flex rounded-md border border-border p-0.5 text-sm">
      {(["a4", "label"] as const).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded px-2.5 py-1 font-medium ${mode === m ? "bg-primary-light text-primary" : "text-muted"}`}
        >
          {m === "a4" ? "A4 paper" : "Label 4×6"}
        </button>
      ))}
    </div>
  );
}
