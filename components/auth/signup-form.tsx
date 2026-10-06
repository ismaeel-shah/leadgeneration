"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { signup } from "@/actions/auth";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    startTransition(async () => {
      const result = await signup({ name: name.trim(), email: email.trim().toLowerCase(), password });
      if (!result.ok) { setError(result.error || "Could not create your account."); return; }
      router.push("/login?created=1");
    });
  }
  return <div className="auth-form-wrap"><div className="auth-mobile-brand">leadflow</div><div className="auth-form-title"><div className="eyebrow">Get started</div><h2>Create your workspace</h2><p>Set up your account, then add your LinkedIn profiles.</p></div><form className="form-stack" onSubmit={submit}><div className="field"><label htmlFor="signup-name">Your name</label><input id="signup-name" autoComplete="name" required value={name} onChange={event => setName(event.target.value)} placeholder="Ali Shah" /></div><div className="field"><label htmlFor="signup-email">Email address</label><input id="signup-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></div><div className="field"><label htmlFor="signup-password">Password</label><input id="signup-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" /><small>Use at least 12 characters.</small></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="button primary auth-submit" disabled={isPending}>{isPending ? "Creating account..." : <>Create account <ArrowRight size={16} /></>}</button></form><p className="auth-footnote">Already have an account? <Link href="/login">Sign in</Link></p></div>;
}
