import { redirect } from "next/navigation";

// The Vamba Collect landing moved to collect-web. Until parts-web gets its own
// marketplace landing (Phase 3), the marketplace root forwards to the browse.
export default function RootPage() {
  redirect("/market");
}
