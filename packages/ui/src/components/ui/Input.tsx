import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "../../cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-border bg-white px-3.5 text-[15px] text-text placeholder:text-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary",
        "aria-[invalid=true]:border-red aria-[invalid=true]:ring-red",
        "disabled:bg-light disabled:text-muted",
        className,
      )}
      {...props}
    />
  );
});
