// Applies the Collect UK product theme (see .theme-collect in globals.css)
// to every page under /collect-uk — portal, booking, tracking, and driver —
// without touching Fulfilment's shared-with-mobile brand.
export default function CollectUkLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-collect flex min-h-screen flex-1 flex-col bg-bg text-text">{children}</div>;
}
