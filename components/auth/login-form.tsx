"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight } from "lucide-react";

export function LoginForm({ canSignUp }: { canSignUp: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    startTransition(async () => {
      try {
        const result = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false });
        if (result?.error) { setError("Email or password is incorrect."); return; }
        router.push("/"); router.refresh();
      } catch { setError("Could not sign in. Check your connection and try again."); }
    });
  }
  return <div className="auth-form-wrap"><div className="auth-mobile-brand">leadflow</div><div className="auth-form-title"><div className="eyebrow">Welcome back</div><h2>Sign in to LeadFlow</h2><p>Pick up where you left off.</p></div><form className="form-stack" onSubmit={submit}><div className="field"><label htmlFor="login-email">Email address</label><input id="login-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></div><div className="field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="button primary auth-submit" disabled={isPending}>{isPending ? "Signing in..." : <>Sign in <ArrowRight size={16} /></>}</button></form>{canSignUp && <p className="auth-footnote">New here? <Link href="/signup">Create an account</Link></p>}</div>;
}
