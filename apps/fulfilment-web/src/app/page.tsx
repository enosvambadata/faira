import { redirect } from "next/navigation";

// Fulfilment's home is the seller dashboard (which guards auth and forwards to
// /login when signed out).
export default function RootPage() {
  redirect("/dashboard");
}
