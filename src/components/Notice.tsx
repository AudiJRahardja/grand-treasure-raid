import type { ReactNode } from "react";

export function ErrorNotice({ title = "Something went wrong", children }: { title?: string; children: ReactNode }) {
  return (
    <div role="alert" className="card border-danger/60">
      <p className="font-semibold text-danger">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

export function InfoNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-display text-2xl text-gold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}
