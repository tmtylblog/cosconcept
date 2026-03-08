"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Globe,
  Database,
  DollarSign,
  Clock,
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

interface OrgFirm {
  id: string;
  name: string;
  website: string | null;
  firmType: string | null;
  sizeBand: string | null;
  profileCompleteness: number | null;
  createdAt: string;
}

interface EnrichmentStat {
  entries: number;
  cost: number;
  phases: string[];
  lastEnriched: string | null;
}

interface OrgDetails {
  members: OrgMember[];
  firms: OrgFirm[];
  enrichmentStats: Record<string, EnrichmentStat>;
}

const PHASE_COLORS: Record<string, string> = {
  jina: "bg-cos-electric/10 text-cos-electric",
  classifier: "bg-cos-signal/10 text-cos-signal",
  pdl: "bg-purple-100 text-purple-700",
  linkedin: "bg-blue-100 text-blue-700",
  case_study: "bg-cos-warm/10 text-cos-warm",
  onboarding: "bg-emerald-100 text-emerald-700",
  memory: "bg-pink-100 text-pink-700",
  deep_crawl: "bg-orange-100 text-orange-700",
};

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgDetails, setOrgDetails] = useState<Record<string, OrgDetails>>({});
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

  async function loadDetails(orgId: string) {
    if (orgDetails[orgId]) return;
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/details`);
      if (res.ok) {
        const data = await res.json();
        setOrgDetails((prev) => ({ ...prev, [orgId]: data }));
      }
    } catch (err) {
      console.error("Failed to load org details:", err);
    }
  }

  function handleExpand(orgId: string) {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
    } else {
      setExpandedOrg(orgId);
      loadDetails(orgId);
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
          {orgs.length} organization{orgs.length !== 1 ? "s" : ""} on the platform.
        </p>
      </div>

      {orgs.length === 0 && (
        <div className="rounded-cos-xl border border-dashed border-cos-border py-12 text-center text-sm text-cos-slate">
          No organizations yet.
        </div>
      )}

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

            {/* Expanded details */}
            {expandedOrg === org.id && (
              <div className="border-t border-cos-border">
                {orgDetails[org.id] ? (
                  <div className="divide-y divide-cos-border">
                    {/* Members */}
                    <div className="p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
                        Members ({orgDetails[org.id].members.length})
                      </p>
                      {orgDetails[org.id].members.length > 0 ? (
                        <div className="space-y-1">
                          {orgDetails[org.id].members.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-3 rounded-cos-md bg-cos-cloud px-3 py-2"
                            >
                              <div className="flex h-6 w-6 items-center justify-center rounded-cos-full bg-cos-electric/10 text-[10px] font-medium text-cos-electric">
                                {m.userName?.charAt(0)?.toUpperCase() || "?"}
                              </div>
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
                        <p className="text-xs text-cos-slate">No members.</p>
                      )}
                    </div>

                    {/* Service Firms + Enrichment */}
                    <div className="p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
                        Service Firms ({orgDetails[org.id].firms.length})
                      </p>
                      {orgDetails[org.id].firms.length > 0 ? (
                        <div className="space-y-3">
                          {orgDetails[org.id].firms.map((firm) => {
                            const enrichment = orgDetails[org.id].enrichmentStats[firm.id];
                            return (
                              <div
                                key={firm.id}
                                className="rounded-cos-lg border border-cos-border bg-cos-cloud p-3"
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-medium text-cos-midnight">
                                      {firm.name}
                                    </p>
                                    <div className="mt-0.5 flex items-center gap-3 text-xs text-cos-slate">
                                      {firm.website && (
                                        <span className="flex items-center gap-1">
                                          <Globe className="h-3 w-3" />
                                          {firm.website}
                                        </span>
                                      )}
                                      {firm.firmType && (
                                        <span>{firm.firmType.replace(/_/g, " ")}</span>
                                      )}
                                      {firm.sizeBand && (
                                        <span>{firm.sizeBand.replace(/_/g, " ")}</span>
                                      )}
                                    </div>
                                  </div>
                                  {firm.profileCompleteness != null && (
                                    <div className="text-right">
                                      <span className="text-xs text-cos-slate">Profile</span>
                                      <p className={`font-mono text-sm font-medium ${
                                        firm.profileCompleteness >= 0.7
                                          ? "text-cos-signal"
                                          : firm.profileCompleteness >= 0.4
                                            ? "text-cos-warm"
                                            : "text-cos-ember"
                                      }`}>
                                        {Math.round(firm.profileCompleteness * 100)}%
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Enrichment stats */}
                                {enrichment ? (
                                  <div className="mt-2 rounded-cos-md bg-cos-surface p-2">
                                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
                                      Enrichment
                                    </p>
                                    <div className="flex items-center gap-4 text-xs">
                                      <span className="flex items-center gap-1 text-cos-slate">
                                        <Database className="h-3 w-3 text-cos-electric" />
                                        {enrichment.entries} entries
                                      </span>
                                      <span className="flex items-center gap-1 text-cos-slate">
                                        <DollarSign className="h-3 w-3 text-cos-warm" />
                                        ${enrichment.cost.toFixed(4)}
                                      </span>
                                      {enrichment.lastEnriched && (
                                        <span className="flex items-center gap-1 text-cos-slate">
                                          <Clock className="h-3 w-3 text-cos-signal" />
                                          {new Date(enrichment.lastEnriched).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {enrichment.phases.map((phase) => (
                                        <span
                                          key={phase}
                                          className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                                            PHASE_COLORS[phase] || "bg-cos-slate/10 text-cos-slate"
                                          }`}
                                        >
                                          {phase}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-cos-slate-light">
                                    No enrichment data yet.
                                  </p>
                                )}

                                <p className="mt-1 font-mono text-[10px] text-cos-slate-light">
                                  ID: {firm.id}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-cos-slate">
                          No service firms linked to this organization.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-xs text-cos-slate">Loading details...</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
