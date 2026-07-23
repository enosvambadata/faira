import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark active:bg-primary-dark disabled:bg-primary/50",
  secondary: "bg-white text-primary border border-primary hover:bg-primary-light disabled:opacity-50",
  ghost: "bg-transparent text-text hover:bg-black/5 disabled:opacity-50",
  danger: "bg-red text-white hover:bg-red/90 disabled:bg-red/50",
};

const SIZE_CLASSES: Record<Size, string> = {
  md: "h-11 px-4 text-[15px]",
  lg: "h-13 px-6 text-base",
};

// Large, mobile-friendly tap targets (min 44px height) and a visible
// disabled/loading state — this button is used across every form in the
// onboarding and verification flows, so its states have to be unambiguous.
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading = false, fullWidth = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "focus-visible:outline-none disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading && <Spinner size={16} className={variant === "secondary" || variant === "ghost" ? "text-primary" : "text-white"} />}
      {children}
    </button>
  );
});
