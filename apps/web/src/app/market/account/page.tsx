"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMarketAuth } from "@/components/market/useMarketAuth";
import { ProfileSection } from "@/components/market/account/ProfileSection";
import { EarningsSection } from "@/components/market/account/EarningsSection";
import { MyListingsSection } from "@/components/market/account/MyListingsSection";
import { SalesSection } from "@/components/market/account/SalesSection";
import { VerificationSection } from "@/components/market/account/VerificationSection";

export default function SellerAccountPage() {
  const { signedIn, loading } = useMarketAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-[840px] px-4 py-6 sm:px-6">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-text">Sign in to your shop</h1>
        <p className="mt-2 text-sm text-muted">Manage your listings, sales and payouts.</p>
        <Link href="/login?next=/market/account" className="mt-5 inline-block">
          <Button size="md">Sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[840px] px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-text">Your shop</h1>
      <p className="mt-1 text-sm text-muted">Profile, listings, sales, payouts and verification — all in one place.</p>

      <div className="mt-6 flex flex-col gap-6">
        <ProfileSection />
        <EarningsSection />
        <MyListingsSection />
        <SalesSection />
        <VerificationSection />
      </div>
    </div>
  );
}
