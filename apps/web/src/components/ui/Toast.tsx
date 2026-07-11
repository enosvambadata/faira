"use client";

import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckCircle, AlertCircle, Info, X } from "./icons";

type Tone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<Tone, typeof CheckCircle> = { success: CheckCircle, error: AlertCircle, info: Info };
const TONE_CLASSES: Record<Tone, string> = {
  success: "border-green/30 text-green",
  error: "border-red/30 text-red",
  info: "border-primary/30 text-primary",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((item: Omit<ToastItem, "id">) => {
    setItems(prev => [...prev, { ...item, id: Date.now() }]);
  }, []);

  const remove = (id: number) => setItems(prev => prev.filter(item => item.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {items.map(item => {
          const Icon = TONE_ICON[item.tone];
          return (
            <RadixToast.Root
              key={item.id}
              duration={5000}
              onOpenChange={open => !open && remove(item.id)}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-white p-4 shadow-[var(--shadow-modal)]",
                "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2",
                TONE_CLASSES[item.tone],
              )}
            >
              <Icon size={20} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <RadixToast.Title className="text-sm font-medium text-text">{item.title}</RadixToast.Title>
                {item.description && (
                  <RadixToast.Description className="mt-0.5 text-sm text-muted">{item.description}</RadixToast.Description>
                )}
              </div>
              <RadixToast.Close aria-label="Dismiss" className="text-muted">
                <X size={16} />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
