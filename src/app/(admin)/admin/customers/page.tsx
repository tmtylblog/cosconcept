"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  Search,
  Loader2,
  Clock,
  Eye,
  ExternalLink,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/* ── Types ────────────────────────────────────────────────────────── */

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  members: number;
  registeredMembers: number;
  legacyUsers: number;
  createdAt: string;
}

interface CustomerUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
  orgName?: string;
  orgSlug?: string;
  orgPlan?: string;
}

type Tab = "companies" | "users";
type FilterStatus = "all" | "free" | "pro" | "enterprise";

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: "bg-cos-cloud", text: "text-cos-slate" },
  pro: { bg: "bg-cos-electric/10", text: "text-cos-electric" },
  enterprise: { bg: "bg-cos-warm/10", text: "text-cos-warm" },
};

const PAGE_SIZE = 100;

/* ── Component ────────────────────────────────────────────────────── */

export default function CustomersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("companies");

  // ── Companies tab state ──
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [companyPage, setCompanyPage] = useState(1);

  // ── Users tab state ──
  const [userPage, setUserPage] = useState(1);
  const [customerUsers, setCustomerUsers] = useState<CustomerUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [impersonating, setImpersonating] = useState<string | null>(null);

  // Load all organizations
  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => r.json())
      .then((data) => {
        setOrgs(data.organizations ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load orgs:", err);
        setLoading(false);
      });
  }, []);

  // Load customer users when tab switches to "users"
  useEffect(() => {
    if (activeTab !== "users" || usersLoaded) return;
    setUsersLoading(true);

    authClient.admin
      .listUsers({ query: { limit: 500 } })
      .then(async (res) => {
        if (!res.data?.users) return;

        const regularUsers = res.data.users
          .filter((u) => {
            const role = (u as unknown as { role: string }).role ?? "user";
            return role === "user";
          })
          .map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: (u as unknown as { role: string }).role ?? "user",
            banned: (u as unknown as { banned: boolean }).banned ?? false,
            createdAt: u.createdAt
              ? new Date(u.createdAt).toLocaleDateString()
              : "",
          }));

        // Build member-to-org mapping
        const memberToOrg = new Map<string, { orgName: string; orgSlug: string; orgPlan: string }>();
        try {
          const detailsPromises = orgs.map(async (org) => {
            try {
              const r = await fetch(`/api/admin/organizations/${org.id}/details`);
              if (r.ok) {
                const data = await r.json();
                return { orgId: org.id, members: data.members ?? [] };
              }
            } catch { /* skip */ }
            return null;
          });

          const results = await Promise.all(detailsPromises);
          const orgLookup = new Map(orgs.map((o) => [o.id, o]));
          for (const result of results) {
            if (!result) continue;
            const org = orgLookup.get(result.orgId);
            if (!org) continue;
            for (const member of result.members) {
              memberToOrg.set(member.userId, {
                orgName: org.name,
                orgSlug: org.slug,
                orgPlan: org.plan,
              });
            }
          }
        } catch { /* skip enrichment */ }

        const enriched: CustomerUser[] = regularUsers.map((user) => {
          const orgInfo = memberToOrg.get(user.id);
          return {
            ...user,
            orgName: orgInfo?.orgName,
            orgSlug: orgInfo?.orgSlug,
            orgPlan: orgInfo?.orgPlan,
          };
        });

        setCustomerUsers(enriched);
        setUsersLoaded(true);
      })
      .catch(console.error)
      .finally(() => setUsersLoading(false));
  }, [activeTab, usersLoaded, orgs]);

  // Impersonate user
  async function handleImpersonate(userId: string) {
    setImpersonating(userId);
    try {
      await authClient.admin.impersonateUser({ userId });
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Impersonation failed:", err);
      setImpersonating(null);
    }
  }

  // Filter organizations
  const filtered = orgs.filter((org) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !org.name.toLowerCase().includes(q) &&
        !org.slug.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filterStatus !== "all") {
      return org.plan === filterStatus;
    }
    return true;
  });

  // Filter users
  const filteredUsers = userSearch
    ? customerUsers.filter((u) => {
        const q = userSearch.toLowerCase();
        return (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.orgName?.toLowerCase().includes(q) ?? false)
        );
      })
    : customerUsers;

  // Stats
  const stats = {
    total: orgs.length,
    free: orgs.filter((o) => o.plan === "free").length,
    pro: orgs.filter((o) => o.plan === "pro").length,
    enterprise: orgs.filter((o) => o.plan === "enterprise").length,
    totalMembers: orgs.reduce((sum, o) => sum + o.members, 0),
  };

  // Pagination helpers
  const companyTotalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const companyPaginated = filtered.slice(
    (companyPage - 1) * PAGE_SIZE,
    companyPage * PAGE_SIZE
  );
  const userTotalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const userPaginated = filteredUsers.slice(
    (userPage - 1) * PAGE_SIZE,
    userPage * PAGE_SIZE
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 rounded-cos-md bg-cos-border" />
        <div className="h-12 rounded-cos-xl bg-cos-border/50" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-cos-lg bg-cos-border/30" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            Customer Management
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Manage customer organizations, users, and subscription plans.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-cos bg-cos-electric/5 px-3 py-1.5 text-center">
            <div className="text-lg font-bold text-cos-electric">{stats.total}</div>
            <div className="text-[10px] font-medium uppercase text-cos-slate">Companies</div>
          </div>
          <div className="rounded-cos bg-cos-signal/5 px-3 py-1.5 text-center">
            <div className="text-lg font-bold text-cos-signal">{stats.totalMembers}</div>
            <div className="text-[10px] font-medium uppercase text-cos-slate">Users</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cos-border">
        <button
          onClick={() => setActiveTab("companies")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "companies"
              ? "border-cos-electric text-cos-electric"
              : "border-transparent text-cos-slate hover:text-cos-midnight"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Companies
          <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-semibold text-cos-slate">
            {stats.total}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "users"
              ? "border-cos-electric text-cos-electric"
              : "border-transparent text-cos-slate hover:text-cos-midnight"
          }`}
        >
          <Users className="h-4 w-4" />
          Users
          <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-semibold text-cos-slate">
            {stats.totalMembers}
          </span>
        </button>
      </div>

      {/* ── COMPANIES TAB ── */}
      {activeTab === "companies" && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate-light" />
              <input
                type="text"
                placeholder="Search companies by name or slug..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCompanyPage(1); }}
                className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
              />
              {searchQuery && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric">
                  {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 rounded-cos-lg bg-cos-cloud-dim p-1">
              {(
                [
                  { key: "all", label: "All" },
                  { key: "free", label: `Free (${stats.free})` },
                  { key: "pro", label: `Pro (${stats.pro})` },
                  { key: "enterprise", label: `Ent (${stats.enterprise})` },
                ] as { key: FilterStatus; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setFilterStatus(key); setCompanyPage(1); }}
                  className={`rounded-cos-md px-3.5 py-1.5 text-xs font-medium capitalize transition-all ${
                    filterStatus === key
                      ? "bg-cos-surface text-cos-midnight shadow-sm"
                      : "text-cos-slate hover:text-cos-midnight"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Companies Table */}
          <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cos-border bg-cos-cloud/50">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                    Company
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                    Slug
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                    Plan
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                    Users
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                    Created
                  </th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cos-border/60">
                {companyPaginated.map((org) => {
                  const planStyle = PLAN_COLORS[org.plan] ?? PLAN_COLORS.free;
                  return (
                    <tr
                      key={org.id}
                      onClick={() => router.push(`/admin/customers/${org.id}`)}
                      className="cursor-pointer transition-colors hover:bg-cos-electric/[0.02]"
                    >
                      {/* Company name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-cos-lg bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-xs font-semibold text-cos-electric">
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-cos-midnight">{org.name}</span>
                        </div>
                      </td>

                      {/* Slug */}
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-cos-slate">/{org.slug}</span>
                      </td>

                      {/* Plan */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-cos-pill px-2.5 py-1 text-[10px] font-bold uppercase ${planStyle.bg} ${planStyle.text}`}
                        >
                          {org.plan}
                        </span>
                      </td>

                      {/* Users */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-cos-slate-light" />
                          <span className="font-mono text-xs font-semibold text-cos-midnight">
                            {org.members}
                          </span>
                          {org.legacyUsers > 0 && org.registeredMembers > 0 && (
                            <span className="text-[10px] text-cos-slate" title={`${org.registeredMembers} registered + ${org.legacyUsers} imported`}>
                              ({org.registeredMembers}+{org.legacyUsers})
                            </span>
                          )}
                          {org.legacyUsers > 0 && org.registeredMembers === 0 && (
                            <span className="text-[10px] text-cos-slate" title={`${org.legacyUsers} imported users`}>
                              imported
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        {org.status === "active" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-cos-pill bg-cos-signal/8 px-2.5 py-1 text-xs font-medium text-cos-signal">
                            <span className="h-1.5 w-1.5 rounded-full bg-cos-signal" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-cos-pill bg-cos-slate/8 px-2.5 py-1 text-xs font-medium text-cos-slate">
                            <span className="h-1.5 w-1.5 rounded-full bg-cos-slate" />
                            {org.status}
                          </span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-cos-slate">
                          <Clock className="h-3.5 w-3.5" />
                          {org.createdAt}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/customers/${org.id}`);
                          }}
                          className="h-7 gap-1.5 text-xs text-cos-slate hover:text-cos-electric"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-cos-slate"
                    >
                      {searchQuery ? "No companies match your search." : "No companies found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {companyTotalPages > 1 && (
              <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
                <span className="text-xs text-cos-slate">
                  Showing {(companyPage - 1) * PAGE_SIZE + 1}–{Math.min(companyPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCompanyPage((p) => Math.max(1, p - 1))}
                    disabled={companyPage === 1}
                    className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-cos-slate">
                    Page {companyPage} of {companyTotalPages}
                  </span>
                  <button
                    onClick={() => setCompanyPage((p) => Math.min(companyTotalPages, p + 1))}
                    disabled={companyPage === companyTotalPages}
                    className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === "users" && (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate-light" />
            <input
              type="text"
              placeholder="Search users by name, email, or company..."
              value={userSearch}
              onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
              className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
            {userSearch && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric">
                {filteredUsers.length} result{filteredUsers.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
              <span className="ml-2 text-sm text-cos-slate">Loading customer users...</span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-cos-border bg-cos-cloud/50">
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                      User
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                      Email
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                      Company
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                      Plan
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                      Status
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                      Joined
                    </th>
                    <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cos-border/60">
                  {userPaginated.map((user) => {
                    const planStyle = user.orgPlan
                      ? PLAN_COLORS[user.orgPlan] ?? PLAN_COLORS.free
                      : null;
                    return (
                      <tr
                        key={user.id}
                        className="transition-colors hover:bg-cos-electric/[0.02]"
                      >
                        {/* Name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-cos-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-xs font-semibold text-cos-electric">
                              {user.name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                            <span className="font-medium text-cos-midnight">
                              {user.name}
                            </span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-cos-slate">
                            {user.email}
                          </span>
                        </td>

                        {/* Company */}
                        <td className="px-5 py-3.5">
                          {user.orgName ? (
                            <button
                              onClick={() => {
                                setActiveTab("companies");
                                setSearchQuery(user.orgName ?? "");
                              }}
                              className="flex items-center gap-1.5 text-xs font-medium text-cos-electric hover:underline"
                            >
                              <Building2 className="h-3 w-3" />
                              {user.orgName}
                            </button>
                          ) : (
                            <span className="text-xs italic text-cos-slate-light">
                              No company
                            </span>
                          )}
                        </td>

                        {/* Plan */}
                        <td className="px-5 py-3.5">
                          {planStyle ? (
                            <span
                              className={`inline-flex items-center rounded-cos-pill px-2.5 py-1 text-[10px] font-bold uppercase ${planStyle.bg} ${planStyle.text}`}
                            >
                              {user.orgPlan}
                            </span>
                          ) : (
                            <span className="text-[10px] text-cos-slate-light">&mdash;</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          {user.banned ? (
                            <span className="inline-flex items-center gap-1.5 rounded-cos-pill bg-cos-ember/8 px-2.5 py-1 text-xs font-medium text-cos-ember">
                              <span className="h-1.5 w-1.5 rounded-full bg-cos-ember" />
                              Banned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-cos-pill bg-cos-signal/8 px-2.5 py-1 text-xs font-medium text-cos-signal">
                              <span className="h-1.5 w-1.5 rounded-full bg-cos-signal" />
                              Active
                            </span>
                          )}
                        </td>

                        {/* Joined */}
                        <td className="px-5 py-3.5 text-xs text-cos-slate">
                          {user.createdAt}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImpersonate(user.id)}
                            disabled={impersonating === user.id}
                            title="Simulate as this user"
                            className="h-7 w-7 p-0 text-cos-slate hover:text-cos-electric"
                          >
                            {impersonating === user.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-5 py-12 text-center text-sm text-cos-slate"
                      >
                        {userSearch ? "No users match your search." : "No customer users found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {userTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
                  <span className="text-xs text-cos-slate">
                    Showing {(userPage - 1) * PAGE_SIZE + 1}–{Math.min(userPage * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                      disabled={userPage === 1}
                      className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-cos-slate">
                      Page {userPage} of {userTotalPages}
                    </span>
                    <button
                      onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                      disabled={userPage === userTotalPages}
                      className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
