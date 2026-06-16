import type { ReactNode } from "react";

export function BuildView({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-3">{children}</section>;
}
