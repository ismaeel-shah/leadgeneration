"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const signedOut = error.message.includes("signed in");
  return (
    <div className="card empty-state" role="alert">
      <div className="empty-state-icon"><AlertTriangle size={22} /></div>
      <h3>{signedOut ? "Your session has ended" : "This page couldn’t load"}</h3>
      <p>{signedOut ? "Sign in again to continue." : "Check your connection and try again. If it keeps happening, the database may be unreachable."}</p>
      {signedOut
        ? <Link className="button primary" href="/login">Sign in</Link>
        : <button type="button" className="button primary" onClick={reset}>Try again</button>}
    </div>
  );
}
