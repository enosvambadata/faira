"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  market,
  marketOrders,
  ApiError,
  type MarketListingDetail,
  type MarketPaymentMethod,
} from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ShieldIcon } from "@/components/market/icons";
import { useMarketAuth } from "@/components/market/useMarketAuth";

const METHODS: { value: MarketPaymentMethod; label: string; hint: string }[] = [
  { value: "ECOCASH", label: "EcoCash", hint: "Approve the prompt on your phone" },
  { value: "ONEMONEY", label: "OneMoney", hint: "Approve the prompt on your phone" },
  { value: "ZIMSWITCH", label: "Card / ZIPIT (ZimSwitch)", hint: "You'll be taken to a secure page" },
  { value: "CASH_ON_DELIVERY", label: "Cash on delivery", hint: "Pay in cash when it arrives (if the seller offers it)" },
];

type Phase = "form" | "awaiting" | "done";

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const { signedIn, loading: authLoading } = useMarketAuth();

  const [listing, setListing] = useState<MarketListingDetail | null>(null);
  const [deliveryOption, setDeliveryOption] = useState<string>();
  const [fee, setFee] = useState<number | null>(null);
  const [method, setMethod] = useState<MarketPaymentMethod>("ECOCASH");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [instructions, setInstructions] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const l = await market.get(id);
        if (!ignore) {
          setListing(l);
          setDeliveryOption(l.deliveryOptions[0]);
        }
      } catch (err) {
        if (!ignore) setError(err instanceof ApiError ? err.message : "Couldn't load this listing.");
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [id]);

  // Best-effort delivery quote — needs the buyer's profile city; a 400 just
  // leaves the fee unshown rather than blocking checkout.
  useEffect(() => {
    if (!deliveryOption || !signedIn) return;
    let ignore = false;
    const quote = async () => {
      try {
        const { fee: f } = await marketOrders.deliveryFee(id, deliveryOption);
        if (!ignore) setFee(f);
      } catch {
        if (!ignore) setFee(null);
      }
    };
    quote();
    return () => {
      ignore = true;
    };
  }, [id, deliveryOption, signedIn]);

  const price = listing ? Number(listing.price) : 0;
  const total = price + (fee ?? 0);
  const needsEmail = method !== "CASH_ON_DELIVERY";
  const needsPhone = method === "ECOCASH" || method === "ONEMONEY";

  const pollUntilPaid = async (orderId: string) => {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const s = await marketOrders.paymentStatus(orderId);
        if (s.orderStatus === "PAID" || s.paymentStatus === "PAID") {
          setPhase("done");
          return;
        }
        if (s.paymentStatus === "FAILED") {
          setError("The payment was declined or cancelled. You can try again.");
          setPhase("form");
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    setError("We haven't seen your payment confirm yet. Check your Orders shortly.");
    setPhase("form");
  };

  const placeOrder = async () => {
    if (!deliveryOption) return;
    if (needsEmail && !email.trim()) {
      setError("Enter your email for the payment receipt.");
      return;
    }
    if (needsPhone && !phone.trim()) {
      setError("Enter your mobile-money phone number.");
      return;
    }
    setPlacing(true);
    setError(null);
    try {
      const order = await marketOrders.create(id, deliveryOption);
      const result = await marketOrders.pay(order.id, {
        method,
        email: needsEmail ? email.trim() : undefined,
        phone: needsPhone ? phone.trim() : undefined,
      });

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl; // ZimSwitch hosted page
        return;
      }
      if (method === "CASH_ON_DELIVERY") {
        setInstructions(result.instructions);
        setPhase("done");
        return;
      }
      // EcoCash / OneMoney: buyer approves on their phone; poll for confirmation.
      setInstructions(result.instructions ?? "Approve the prompt on your phone to complete payment.");
      setPhase("awaiting");
      await pollUntilPaid(order.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't place your order right now.");
    } finally {
      setPlacing(false);
    }
  };

  if (!authLoading && !signedIn) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-text">Sign in to check out</h1>
        <Link href={`/login?next=/market/listings/${id}/checkout`} className="mt-5 inline-block">
          <Button size="md">Sign in</Button>
        </Link>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-14 text-center sm:px-6">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-green/10 text-green">
          <ShieldIcon size={28} />
        </div>
        <h1 className="text-xl font-bold text-text">Order placed</h1>
        <p className="mt-2 text-sm text-muted">
          {instructions ?? "Your payment is confirmed. It's held in escrow until you confirm the part arrived as described."}
        </p>
        <Link href="/market" className="mt-6 inline-block">
          <Button size="md">Keep shopping</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[620px] px-4 py-6 sm:px-6">
      <Link href={`/market/listings/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
        ← Back to listing
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-text">Checkout</h1>

      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}

      {!listing ? (
        <Skeleton className="mt-6 h-40 w-full" />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {/* summary */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-light">
              {listing.imageUrls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- listing thumbnail
                <img src={listing.imageUrls[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-xl text-muted">🔧</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-text">{listing.title}</p>
              <p className="text-sm text-muted">${price.toLocaleString()}</p>
            </div>
          </div>

          {/* delivery */}
          <div>
            <span className="text-sm font-medium text-text">Delivery</span>
            <div className="mt-2 flex flex-col gap-2">
              {listing.deliveryOptions.map(opt => (
                <label key={opt} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-white px-3 py-2.5 text-sm">
                  <input type="radio" name="delivery" checked={deliveryOption === opt} onChange={() => setDeliveryOption(opt)} className="accent-primary" />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          {/* payment */}
          <div>
            <span className="text-sm font-medium text-text">Payment method</span>
            <div className="mt-2 flex flex-col gap-2">
              {METHODS.map(m => (
                <label key={m.value} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-white px-3 py-2.5 text-sm">
                  <input type="radio" name="method" checked={method === m.value} onChange={() => setMethod(m.value)} className="mt-0.5 accent-primary" />
                  <span>
                    <span className="font-medium text-text">{m.label}</span>
                    <span className="block text-xs text-muted">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {needsEmail && (
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  placeholder="Email for receipt"
                  className="h-11 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
                />
              )}
              {needsPhone && (
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="Mobile-money number, e.g. 0771234567"
                  className="h-11 rounded-md border border-border bg-white px-3.5 text-[15px] text-text outline-none focus:border-primary"
                />
              )}
            </div>
          </div>

          {/* totals */}
          <div className="rounded-lg border border-border bg-white p-4 text-sm">
            <div className="flex justify-between text-muted">
              <span>Item</span>
              <span>${price.toLocaleString()}</span>
            </div>
            <div className="mt-1 flex justify-between text-muted">
              <span>Delivery</span>
              <span>{fee != null ? `$${fee.toLocaleString()}` : "—"}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold text-text">
              <span>Total</span>
              <span>${total.toLocaleString()}</span>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
              <ShieldIcon size={14} />
              <span><span className="font-semibold text-green">Escrow protected.</span> Funds release when you confirm the part arrived.</span>
            </p>
          </div>

          {phase === "awaiting" ? (
            <Alert tone="info">{instructions ?? "Approve the payment on your phone…"}</Alert>
          ) : (
            <Button size="lg" onClick={placeOrder} loading={placing} disabled={placing || !deliveryOption}>
              {method === "CASH_ON_DELIVERY" ? "Place order" : `Pay $${total.toLocaleString()}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
