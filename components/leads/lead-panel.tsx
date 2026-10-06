"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Right-side sheet for the intercepted lead route; Esc or the backdrop goes back. */
export function LeadPanel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Let nested dialogs (meeting, delete) close first.
      if (event.key === "Escape" && document.querySelectorAll("[aria-modal=true]").length === 1) router.back();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) router.back(); }}>
      <section className="drawer lead-panel" role="dialog" aria-modal="true" aria-label="Lead details">
        {children}
      </section>
    </div>
  );
}
