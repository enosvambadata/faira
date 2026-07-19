import { Card } from "@/components/ui/Card";

// Shared section wrapper for the seller account page.
export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}
