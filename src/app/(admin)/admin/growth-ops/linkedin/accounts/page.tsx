import { redirect } from "next/navigation";

export default function LinkedInAccountsRedirect() {
  redirect("/admin/growth-ops/settings?tab=linkedin");
}
