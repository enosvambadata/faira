"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { marketMessages, ApiError, type MarketConversation, type MarketMessage } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useMarketAuth } from "@/components/market/useMarketAuth";
import { ProtectionNotice } from "@/components/market/ProtectionNotice";

export default function ChatThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { userId, signedIn, loading: authLoading } = useMarketAuth();

  const [conversation, setConversation] = useState<MarketConversation | null>(null);
  const [messages, setMessages] = useState<MarketMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!signedIn) return;
    let ignore = false;
    const load = async () => {
      try {
        const [conv, msgs] = await Promise.all([marketMessages.get(id), marketMessages.messages(id)]);
        if (!ignore) {
          setConversation(conv);
          setMessages(msgs);
        }
      } catch (err) {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Couldn't load this conversation.");
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [id, signedIn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const msg = await marketMessages.send(id, body);
      setMessages(prev => [...(prev ?? []), msg]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your message.");
    } finally {
      setSending(false);
    }
  };

  if (!authLoading && !signedIn) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-text">Sign in to view this conversation</h1>
        <Link href={`/login?next=/market/messages/${id}`} className="mt-5 inline-block">
          <Button size="md">Sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-184px)] max-w-[760px] flex-col px-4 sm:px-6">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border py-3">
        <Link href="/market/messages" className="text-muted hover:text-primary">←</Link>
        {conversation ? (
          <Link href={`/market/listings/${conversation.listingId}`} className="flex min-w-0 items-center gap-2.5 hover:opacity-90">
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-light">
              {conversation.listing.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- listing thumbnail
                <img src={conversation.listing.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted">🔧</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{conversation.otherParticipant.displayName ?? "Faira user"}</p>
              <p className="truncate text-xs text-muted">{conversation.listing.title} · ${conversation.listing.price}</p>
            </div>
          </Link>
        ) : (
          <Skeleton className="h-9 w-48" />
        )}
      </div>

      {error && <div className="pt-3"><Alert tone="error">{error}</Alert></div>}

      <ProtectionNotice className="mt-3" />

      {/* messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages === null && !error && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="ml-auto h-10 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>
        )}
        {messages && messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted">Say hello — ask about condition, fitment or collection.</p>
        )}
        {messages && messages.length > 0 && (
          <div className="flex flex-col gap-2">
            {messages.map(m => {
              const mine = m.senderId === userId;
              return (
                <div
                  key={m.id}
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine ? "self-end bg-primary text-white" : "self-start border border-border bg-white text-text"
                  }`}
                >
                  {m.body}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* composer */}
      <div className="flex items-center gap-2 border-t border-border py-3">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Message…"
          aria-label="Message"
          className="h-11 flex-1 rounded-full border border-border bg-white px-4 text-[15px] text-text outline-none focus:border-primary"
        />
        <Button size="md" onClick={send} loading={sending} disabled={!draft.trim() || sending}>
          Send
        </Button>
      </div>
    </div>
  );
}
