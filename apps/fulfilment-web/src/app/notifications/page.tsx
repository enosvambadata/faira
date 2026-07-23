import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Bell } from "@/components/ui/icons";

// Honest placeholder — the Notifications module (SCRUM-147) hasn't shipped
// yet. This says so plainly rather than showing fake notification rows.
export default function NotificationsPage() {
  return (
    <AppShell>
      <h1 className="text-xl font-semibold text-text">Notifications</h1>
      <div className="mt-6">
        <EmptyState
          icon={<Bell size={28} />}
          title="Notifications are coming soon"
          description="We're building SMS, WhatsApp, and in-app notifications for shipment updates. For now, watch this dashboard for status changes."
        />
      </div>
    </AppShell>
  );
}
