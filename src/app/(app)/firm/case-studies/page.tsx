import { redirect } from "next/navigation";

/**
 * Legacy case-studies page — redirects to the consolidated Experience page.
 */
export default function CaseStudiesRedirectPage() {
  redirect("/firm/experience");
}
