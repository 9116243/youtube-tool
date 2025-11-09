import * as React from "react";
import { cn } from "@/lib/utils";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, viewportClassName, children, ...props }, ref) => (
    <div ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
      <div className={cn("max-h-64 overflow-y-auto pr-1", viewportClassName)}>{children}</div>
    </div>
  ),
);
ScrollArea.displayName = "ScrollArea";

export default ScrollArea;

