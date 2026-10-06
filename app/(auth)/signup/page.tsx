import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignupForm } from "@/components/auth/signup-form";

export const runtime = "nodejs";

export default async function SignupPage() {
  // Reading the session first keeps this page dynamic, so ALLOW_SIGNUP is read per request.
  const session = await auth();
  if (session?.user) redirect("/");
  if (process.env.ALLOW_SIGNUP !== "true") redirect("/login");
  return <SignupForm />;
}
