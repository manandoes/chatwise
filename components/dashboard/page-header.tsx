// The title block at the top of every dashboard screen.

import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-h1 font-bold tracking-tight text-text-primary">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[68ch] text-pretty text-text-secondary">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
