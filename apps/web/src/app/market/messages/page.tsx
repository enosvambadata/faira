"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { marketMessages, type MarketConversationListItem } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useMarketAuth } from "@/components/market/useMarketAuth";

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function MessagesInboxPage() {
  const { signedIn, loading: authLoading } = useMarketAuth();
  const [items, setItems] = useState<MarketConversationListItem[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let ignore = false;
    const load = async () => {
      try {
        const list = await marketMessages.list();
        if (!ignore) setItems(list);
      } catch {
        if (!ignore) setItems([]);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [signedIn]);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-text">Messages</h1>

      {authLoading && <Skeleton className="h-40 w-full" />}

      {!authLoading && !signedIn && (
        <EmptyState
          icon={<span className="text-3xl">💬</span>}
          title="Sign in to see your messages"
          description="Chat with sellers about parts before you buy."
          action={
            <Link href="/login?next=/market/messages">
              <Button size="md">Sign in</Button>
            </Link>
          }
        />
      )}

      {!authLoading && signedIn && items === null && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!authLoading && signedIn && items && items.length === 0 && (
        <EmptyState
          icon={<span className="text-3xl">💬</span>}
          title="No messages yet"
          description="Open a part and tap Message to ask the seller a question."
          action={
            <Link href="/market">
              <Button size="md">Browse parts</Button>
            </Link>
          }
        />
      )}

      {!authLoading && signedIn && items && items.length > 0 && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
          {items.map(c => (
            <li key={c.id}>
              <Link href={`/market/messages/${c.id}`} className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-light">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-light">
                  {c.listing.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- seller listing thumbnail
                    <img src={c.listing.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-lg text-muted">🔧</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-text">{c.otherParticipant.displayName ?? "Faira user"}</span>
                    {c.lastMessage && <span className="shrink-0 text-xs text-muted">{timeAgo(c.lastMessage.createdAt)}</span>}
                  </div>
                  <p className="truncate text-sm text-muted">{c.listing.title}</p>
                  <p className="truncate text-sm text-muted">
                    {c.lastMessage ? c.lastMessage.body ?? "📷 Photo" : "No messages yet"}
                  </p>
                </div>
                {c.unreadCount > 0 && (
                  <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                    {c.unreadCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
