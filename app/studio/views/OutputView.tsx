import type { ReactNode } from "react";

export function OutputView({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4">{children}</section>;
}
