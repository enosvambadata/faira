"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  marketBuyerOrders,
  marketMessages,
  ApiError,
  type MarketOrderDetail,
  type MarketOrderReview,
} from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ShieldIcon, StarIcon } from "@/components/market/icons";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-text">{value}</span>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<MarketOrderDetail | null>(null);
  const [review, setReview] = useState<MarketOrderReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // review draft
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [o, r] = await Promise.all([marketBuyerOrders.get(id), marketBuyerOrders.review(id).catch(() => null)]);
        if (!ignore) {
          setOrder(o);
          setReview(r);
        }
      } catch (err) {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Couldn't load this order.");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id]);

  const run = async (fn: () => Promise<{ status: string; displayStatus: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setOrder(prev => (prev ? { ...prev, status: res.status, displayStatus: res.displayStatus } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (rating < 1) {
      setError("Pick a star rating.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await marketBuyerOrders.submitReview(id, rating, comment.trim() || undefined);
      setReview(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit your review.");
    } finally {
      setBusy(false);
    }
  };

  const messageSeller = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const conv = await marketMessages.start(order.listing.id);
      router.push(`/market/messages/${conv.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[620px] px-4 py-6 sm:px-6">
      <Link href="/market/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
        ← Your orders
      </Link>

      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}

      {!order ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-5">
          {/* header */}
          <div className="flex items-center gap-3">
            <Link href={`/market/listings/${order.listing.id}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-light">
              {order.listing.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- listing thumbnail
                <img src={order.listing.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-xl text-muted">🔧</div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/market/listings/${order.listing.id}`} className="line-clamp-2 text-sm font-medium text-text hover:text-primary">
                {order.listing.title}
              </Link>
              <p className="text-lg font-bold text-text">${Number(order.priceAtPurchase).toLocaleString()}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary-dark">
              {order.displayStatus}
            </span>
          </div>

          {/* details */}
          <div className="rounded-lg border border-border bg-white px-4 py-1">
            <Info label="Ordered" value={new Date(order.createdAt).toLocaleDateString()} />
            <div className="border-t border-border" />
            <Info label="Delivery" value={order.deliveryOption} />
            {order.paymentMethod && <><div className="border-t border-border" /><Info label="Payment" value={order.paymentMethod} /></>}
            {order.trackingReference && <><div className="border-t border-border" /><Info label="Tracking" value={order.trackingReference} /></>}
          </div>

          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldIcon size={16} className="text-green" />
            <span><span className="font-semibold text-green">Escrow protected.</span> Confirm delivery once the part arrives as described — that releases the payment to the seller.</span>
          </p>

          {/* actions */}
          <div className="flex flex-col gap-2">
            {order.status === "PAID" && (
              <Button size="lg" onClick={() => run(() => marketBuyerOrders.confirmDelivery(id))} loading={busy} disabled={busy}>
                Confirm delivery
              </Button>
            )}
            {order.canMarkCollected && (
              <Button size="md" variant="secondary" onClick={() => run(() => marketBuyerOrders.markCollected(id))} loading={busy} disabled={busy}>
                Mark as collected
              </Button>
            )}
            <Button size="md" variant="ghost" onClick={messageSeller} disabled={busy}>
              Message seller
            </Button>
          </div>

          {/* review */}
          {order.status === "COMPLETED" && (
            <div className="rounded-lg border border-border bg-white p-4">
              <h2 className="text-sm font-semibold text-text">Rate this order</h2>
              {review ? (
                <p className="mt-2 flex items-center gap-1 text-sm text-muted">
                  You rated <span className="flex text-gold">{Array.from({ length: review.rating }).map((_, i) => <StarIcon key={i} size={14} />)}</span>
                  {review.comment && <span>— “{review.comment}”</span>}
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`} className={n <= rating ? "text-gold" : "text-border"}>
                        <StarIcon size={26} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={2}
                    placeholder="How was the part and the seller? (optional)"
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary"
                  />
                  <Button size="md" onClick={submitReview} loading={busy} disabled={busy || rating < 1}>Submit review</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
