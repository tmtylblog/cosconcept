import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingPage } from "@/components/landing-page";

export default async function Home() {
  // If already authenticated, go straight to dashboard
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) {
      redirect("/dashboard");
    }
  } catch {
    // Not authenticated — show landing page
  }

  return <LandingPage />;
}
