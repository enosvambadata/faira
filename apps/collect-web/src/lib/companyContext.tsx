"use client";

import { createContext, useContext } from "react";
import { CollectUkCompany, CollectUkCompanyRoleType } from "@/lib/api";

// Shared by every page under /collect-uk/companies/[id] -- the layout
// loads the company + the caller's role once and provides them here so
// tab pages only fetch their own section's data.
export interface CompanyPortalContext {
  company: CollectUkCompany;
  role: CollectUkCompanyRoleType | null;
  isAdmin: boolean;
  setCompany: (company: CollectUkCompany) => void;
}

export const CompanyContext = createContext<CompanyPortalContext | null>(null);

export function useCompanyPortal(): CompanyPortalContext {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyPortal must be used inside the company portal layout");
  return ctx;
}
