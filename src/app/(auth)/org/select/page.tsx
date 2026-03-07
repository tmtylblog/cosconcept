"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

export default function OrgSelectPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  useEffect(() => {
    loadOrgs();
  }, []);

  async function loadOrgs() {
    try {
      const { data } = await authClient.organization.list();
      setOrgs((data as Organization[]) ?? []);
    } catch {
      // If listing fails, user may have no orgs yet
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectOrg(orgId: string) {
    await authClient.organization.setActive({ organizationId: orgId });
    router.push("/dashboard");
  }

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const slug = newOrgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const { data } = await authClient.organization.create({
        name: newOrgName.trim(),
        slug,
      });
      if (data) {
        await selectOrg(data.id);
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cos-cloud">
        <p className="text-cos-slate">Loading organizations...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cos-cloud">
      <div className="w-full max-w-md space-y-6 rounded-cos-xl border border-cos-border bg-cos-surface p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-cos-midnight">
            Select Organization
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Choose a workspace to continue
          </p>
        </div>

        {orgs.length > 0 && (
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
        )}

        <div className="border-t border-cos-border pt-4">
          <p className="mb-2 text-sm font-medium text-cos-midnight">
            Create a new organization
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Organization name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createOrg()}
              className="flex-1 rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
            <Button onClick={createOrg} disabled={creating || !newOrgName.trim()}>
              {creating ? "..." : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
