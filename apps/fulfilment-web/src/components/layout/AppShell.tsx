"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Package, Bell, User, HelpCircle, LogOut } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Package },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/support", label: "Support", icon: HelpCircle },
  { href: "/profile", label: "Profile", icon: User },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="hidden border-b border-border bg-white sm:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="text-lg font-semibold text-primary">
            Faira Fulfilment
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                    active ? "bg-primary-light text-primary-dark" : "text-muted hover:bg-light",
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleSignOut}
              className="ml-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-light"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 sm:px-6 sm:pb-6">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-white sm:hidden">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium",
                active ? "text-primary" : "text-muted",
              )}
            >
              <Icon size={22} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
