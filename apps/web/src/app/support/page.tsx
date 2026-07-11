import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { HelpCircle } from "@/components/ui/icons";

// Honest placeholder — no ticketing system exists yet (SCRUM-151 is
// unbuilt). A real contact channel is better than a fake "submit ticket"
// form that goes nowhere.
export default function SupportPage() {
  return (
    <AppShell>
      <h1 className="text-xl font-semibold text-text">Support</h1>
      <Card className="mt-6 flex items-start gap-3 max-w-md">
        <HelpCircle size={24} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-[15px] text-text">Need help with your account or a shipment?</p>
          <p className="mt-1 text-sm text-muted">
            Email us at <a href="mailto:support@faira.co.zw" className="font-medium text-primary">support@faira.co.zw</a> and
            we&apos;ll get back to you. In-app support tickets are coming soon.
          </p>
        </div>
      </Card>
    </AppShell>
  );
}
