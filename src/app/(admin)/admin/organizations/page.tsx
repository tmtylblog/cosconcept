"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  Save,
  X,
} from "lucide-react";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  members: number;
  createdAt: string;
}

interface OrgMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
}

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<Record<string, OrgMember[]>>({});
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => r.json())
      .then((data) => setOrgs(data.organizations ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function loadMembers(orgId: string) {
    if (orgMembers[orgId]) return;
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/members`);
      if (res.ok) {
        const data = await res.json();
        setOrgMembers((prev) => ({ ...prev, [orgId]: data.members ?? [] }));
      }
    } catch (err) {
      console.error("Failed to load members:", err);
    }
  }

  function handleExpand(orgId: string) {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
    } else {
      setExpandedOrg(orgId);
      loadMembers(orgId);
    }
  }

  async function handlePlanChange(orgId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: pendingPlan }),
      });
      if (res.ok) {
        setOrgs((prev) =>
          prev.map((o) =>
            o.id === orgId ? { ...o, plan: pendingPlan } : o
          )
        );
        setEditingPlan(null);
      }
    } catch (err) {
      console.error("Failed to update plan:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-cos-slate">Loading organizations...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">
          Organizations
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          {orgs.length} organizations on the platform.
        </p>
      </div>

      <div className="space-y-2">
        {orgs.map((org) => (
          <div
            key={org.id}
            className="rounded-cos-xl border border-cos-border bg-cos-surface"
          >
            {/* Org row */}
            <button
              onClick={() => handleExpand(org.id)}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-cos-electric/5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-cos-electric/10">
                <Building2 className="h-4 w-4 text-cos-electric" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-cos-midnight">{org.name}</p>
                <p className="font-mono text-xs text-cos-slate-light">
                  {org.slug}
                </p>
              </div>

              {/* Plan badge */}
              {editingPlan === org.id ? (
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <select
                    value={pendingPlan}
                    onChange={(e) => setPendingPlan(e.target.value)}
                    className="rounded-cos-md border border-cos-border bg-cos-cloud px-2 py-1 text-xs"
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                  <button
                    onClick={() => handlePlanChange(org.id)}
                    disabled={saving}
                    className="rounded-cos-md bg-cos-electric p-1 text-white hover:bg-cos-electric-hover"
                  >
                    <Save className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setEditingPlan(null)}
                    className="rounded-cos-md p-1 text-cos-slate hover:bg-cos-cloud"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingPlan(org.id);
                    setPendingPlan(org.plan);
                  }}
                  className={`rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${
                    org.plan === "enterprise"
                      ? "bg-cos-electric/10 text-cos-electric"
                      : org.plan === "pro"
                        ? "bg-cos-signal/10 text-cos-signal"
                        : "bg-cos-slate/10 text-cos-slate"
                  }`}
                  title="Click to change plan"
                >
                  {org.plan}
                </button>
              )}

              <span className="text-xs text-cos-slate">{org.status}</span>

              <div className="flex items-center gap-1 text-xs text-cos-slate">
                <Users className="h-3.5 w-3.5" />
                {org.members}
              </div>

              <span className="text-xs text-cos-slate-light">
                {org.createdAt}
              </span>

              {expandedOrg === org.id ? (
                <ChevronDown className="h-4 w-4 text-cos-slate" />
              ) : (
                <ChevronRight className="h-4 w-4 text-cos-slate" />
              )}
            </button>

            {/* Expanded: members */}
            {expandedOrg === org.id && (
              <div className="border-t border-cos-border p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
                  Members
                </p>
                {orgMembers[org.id] ? (
                  orgMembers[org.id].length > 0 ? (
                    <div className="space-y-1">
                      {orgMembers[org.id].map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 rounded-cos-md bg-cos-cloud px-3 py-2"
                        >
                          <span className="flex-1 text-sm text-cos-midnight">
                            {m.userName}
                          </span>
                          <span className="text-xs text-cos-slate">
                            {m.userEmail}
                          </span>
                          <span
                            className={`rounded-cos-pill px-2 py-0.5 text-xs font-medium ${
                              m.role === "owner"
                                ? "bg-cos-electric/10 text-cos-electric"
                                : m.role === "admin"
                                  ? "bg-cos-warm/10 text-cos-warm"
                                  : "bg-cos-slate/10 text-cos-slate"
                            }`}
                          >
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-cos-slate">No members found.</p>
                  )
                ) : (
                  <p className="text-xs text-cos-slate">Loading members...</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
