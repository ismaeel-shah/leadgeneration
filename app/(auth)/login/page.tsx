import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const runtime = "nodejs";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return <LoginForm canSignUp={process.env.ALLOW_SIGNUP === "true"} />;
}
