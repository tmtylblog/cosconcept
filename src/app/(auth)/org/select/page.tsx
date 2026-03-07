"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

/**
 * Org Select — mostly invisible.
 *
 * Flow:
 *   0 orgs → auto-create from user's email domain → dashboard
 *   1 org  → auto-select → dashboard
 *   2+ orgs → show picker (rare)
 */
export default function OrgSelectPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    if (session?.user) {
      handleOrgSetup();
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleOrgSetup() {
    try {
      const { data } = await authClient.organization.list();
      const orgList = (data as Organization[]) ?? [];

      if (orgList.length === 1) {
        // Auto-select the only org
        await authClient.organization.setActive({ organizationId: orgList[0].id });
        router.replace("/dashboard");
        return;
      }

      if (orgList.length === 0) {
        // Auto-create from email domain
        setStatus("Setting up your workspace...");
        const email = session?.user?.email ?? "";
        const domain = email.split("@")[1] ?? "my-firm";
        const orgName = domainToOrgName(domain);
        const slug = domain.replace(/\./g, "-");

        const { data: newOrg } = await authClient.organization.create({
          name: orgName,
          slug,
        });
        if (newOrg) {
          await authClient.organization.setActive({ organizationId: newOrg.id });
        }
        router.replace("/dashboard");
        return;
      }

      // Multiple orgs — show picker
      setOrgs(orgList);
      setLoading(false);
    } catch {
      // Fallback — just go to dashboard
      router.replace("/dashboard");
    }
  }

  async function selectOrg(orgId: string) {
    await authClient.organization.setActive({ organizationId: orgId });
    router.replace("/dashboard");
  }

  // Loading / auto-setup state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cos-cloud">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
          <p className="text-sm text-cos-slate">{status}</p>
        </div>
      </div>
    );
  }

  // Only shown for multi-org users (rare)
  return (
    <div className="flex min-h-screen items-center justify-center bg-cos-cloud">
      <div className="w-full max-w-md space-y-6 rounded-cos-xl border border-cos-border bg-cos-surface p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-cos-midnight">
            Choose Workspace
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            You belong to multiple organizations
          </p>
        </div>

        <div className="space-y-2">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => selectOrg(org.id)}
              className="flex w-full items-center gap-3 rounded-cos-lg border border-cos-border bg-cos-surface p-4 text-left transition hover:border-cos-electric hover:bg-cos-cloud"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-electric/10 text-cos-electric font-bold">
                {org.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-cos-midnight">{org.name}</p>
                <p className="text-xs text-cos-slate">{org.slug}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Convert a domain like "chameleon.co" to a nice org name like "Chameleon" */
function domainToOrgName(domain: string): string {
  // Strip common TLDs to get the company part
  const parts = domain.split(".");
  const companyPart = parts[0];
  // Capitalize first letter of each word
  return companyPart
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
