import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, className, actions }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 px-6 py-6 backdrop-blur-xl md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold text-white md:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-slate-300">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
