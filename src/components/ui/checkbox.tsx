import * as React from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, checked, defaultChecked, onChange, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border border-white/20 bg-slate-900 text-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
        className,
      )}
      checked={checked}
      defaultChecked={defaultChecked}
      onChange={(event) => {
        onCheckedChange?.(event.currentTarget.checked);
        onChange?.(event);
      }}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";

export default Checkbox;

