import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "@/components/ui/icons";

export default function OnboardingSubmittedPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-md text-center">
        <Card className="flex flex-col items-center gap-4 py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green/10">
            <CheckCircle size={32} className="text-green" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text">Registration submitted</h1>
            <p className="mt-2 text-[15px] text-muted">
              Thanks for registering with Faira Fulfilment. Next, verify your identity so you can start creating
              shipments.
            </p>
          </div>
          <Link href="/verification" className="w-full">
            <Button fullWidth size="lg">
              Start verification
            </Button>
          </Link>
          <Link href="/dashboard" className="text-sm font-medium text-primary">
            I&apos;ll do this later
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
