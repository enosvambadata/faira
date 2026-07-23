import { TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "../../cn";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-border bg-white px-3.5 py-2.5 text-[15px] text-text placeholder:text-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary",
        "aria-[invalid=true]:border-red aria-[invalid=true]:ring-red",
        "min-h-[100px] resize-y",
        className,
      )}
      {...props}
    />
  );
});
