"use client";

import { createContext, useContext } from "react";

// Shared by every page under /collect-uk/dispatch -- the layout owns the
// ADMIN_TOKEN gate and provides the unlocked token here, so individual
// pages never reimplement auth handling.
export interface DispatchAuth {
  token: string;
  lock: () => void;
  // Call when the API rejects the token (401) -- clears it and returns
  // the whole area to the unlock screen.
  authFailure: () => void;
}

export const DispatchContext = createContext<DispatchAuth | null>(null);

export function useDispatchAuth(): DispatchAuth {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useDispatchAuth must be used inside the dispatch layout");
  return ctx;
}
