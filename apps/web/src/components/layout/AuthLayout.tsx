import { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="mb-8 text-xl font-semibold text-primary">Faira</div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
