"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Search,
  Loader2,
  Building2,
  Shield,
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  CheckCircle,
  XCircle,
  Filter,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ────────────────────────────────────────────────────────── */

interface LegacyUser {
  id: string;
  legacyUserId: string;
  legacyOrgId: string | null;
  legacyOrgName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  legacyRoles: string[];
  firmId: string | null;
  firmName: string | null;
  firmWebsite: string | null;
  userId: string | null;
  createdAt: string;
}

interface RoleStat {
  role: string;
  count: number;
}

interface Stats {
  total: number;
  matchedCount: number;
  unmatchedCount: number;
  uniqueOrgs: number;
  uniqueFirms: number;
}

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-cos-electric/10 text-cos-electric",
  "Deal Maker": "bg-cos-warm/10 text-cos-warm",
  Expert: "bg-cos-signal/10 text-cos-signal",
  "Collective Manager": "bg-purple-100 text-purple-700",
  "Internal Viewer": "bg-cos-cloud text-cos-slate",
  "Partnership Admin": "bg-emerald-100 text-emerald-700",
  "Super Admin": "bg-cos-ember/10 text-cos-ember",
  Advisor: "bg-blue-100 text-blue-700",
  Viewer: "bg-cos-cloud text-cos-slate-light",
};

/* ── Component ────────────────────────────────────────────────────── */

export default function RolesPage() {
  const [users, setUsers] = useState<LegacyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [matchedFilter, setMatchedFilter] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [roles, setRoles] = useState<RoleStat[]>([]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  const limit = 50;

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (matchedFilter) params.set("matched", matchedFilter);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/admin/legacy-users?${params}`);
      const data = await res.json();

      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 0);
      setStats(data.stats ?? null);
      setRoles(data.roles ?? []);
    } catch (err) {
      console.error("Failed to load legacy users:", err);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, matchedFilter, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, matchedFilter]);

  // Run import
  async function handleImport(dryRun: boolean) {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(
        `/api/admin/import/legacy-users${dryRun ? "?dryRun=true" : ""}`,
        { method: "POST" }
      );
      const data = await res.json();
      setImportResult(data);
      if (!dryRun && data.success) {
        fetchUsers();
      }
    } catch (err) {
      console.error("Import failed:", err);
      setImportResult({ error: "Import request failed" });
    } finally {
      setImporting(false);
    }
  }

  // Re-match existing users by domain
  async function handleRematch(dryRun: boolean) {
    setRematching(true);
    setImportResult(null);
    try {
      const params = new URLSearchParams({ rematch: "true" });
      if (dryRun) params.set("dryRun", "true");
      const res = await fetch(
        `/api/admin/import/legacy-users?${params}`,
        { method: "POST" }
      );
      const data = await res.json();
      setImportResult(data);
      if (!dryRun && data.success) {
        fetchUsers();
      }
    } catch (err) {
      console.error("Re-match failed:", err);
      setImportResult({ error: "Re-match request failed" });
    } finally {
      setRematching(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            Role Management
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Legacy user roles imported from the original Collective OS platform.
            Manage user-to-firm associations and role assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleImport(true)}
            disabled={importing}
            className="text-xs"
          >
            {importing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="mr-1.5 h-3.5 w-3.5" />
            )}
            Preview Import
          </Button>
          <Button
            size="sm"
            onClick={() => handleImport(false)}
            disabled={importing}
            className="bg-cos-electric hover:bg-cos-electric/90 text-xs"
          >
            {importing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            Run Import
          </Button>
          <div className="h-6 w-px bg-cos-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRematch(true)}
            disabled={rematching}
            className="text-xs"
          >
            {rematching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="mr-1.5 h-3.5 w-3.5" />
            )}
            Preview Re-match
          </Button>
          <Button
            size="sm"
            onClick={() => handleRematch(false)}
            disabled={rematching}
            className="bg-cos-signal hover:bg-cos-signal/90 text-white text-xs"
          >
            {rematching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Re-match by Domain
          </Button>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="rounded-cos-lg border border-cos-border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            {importResult.error ? (
              <XCircle className="h-4 w-4 text-cos-ember" />
            ) : (
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            )}
            <h3 className="text-sm font-semibold text-cos-midnight">
              {importResult.dryRun ? "Import Preview" : importResult.error ? "Import Failed" : "Import Complete"}
            </h3>
            <button
              onClick={() => setImportResult(null)}
              className="ml-auto text-xs text-cos-slate hover:text-cos-midnight"
            >
              Dismiss
            </button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-cos bg-cos-cloud/50 p-3 text-xs font-mono text-cos-midnight">
            {JSON.stringify(importResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
            <div className="text-xl font-bold text-cos-electric">{stats.total.toLocaleString()}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">Total Users</div>
          </div>
          <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
            <div className="text-xl font-bold text-emerald-600">{stats.matchedCount.toLocaleString()}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">Matched to Firm</div>
          </div>
          <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
            <div className="text-xl font-bold text-cos-warm">{stats.unmatchedCount.toLocaleString()}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">Unmatched</div>
          </div>
          <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
            <div className="text-xl font-bold text-cos-signal">{stats.uniqueOrgs.toLocaleString()}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">Legacy Orgs</div>
          </div>
          <div className="rounded-cos-lg border border-cos-border bg-white px-4 py-3 text-center">
            <div className="text-xl font-bold text-purple-600">{stats.uniqueFirms}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">Linked Firms</div>
          </div>
        </div>
      )}

      {/* Role Distribution */}
      {roles.length > 0 && (
        <div className="rounded-cos-lg border border-cos-border bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-cos-electric" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
              Role Distribution
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button
                key={r.role}
                onClick={() => setRoleFilter(roleFilter === r.role ? "" : r.role)}
                className={`rounded-cos-pill px-3 py-1.5 text-xs font-medium transition-all ${
                  roleFilter === r.role
                    ? "ring-2 ring-cos-electric ring-offset-1"
                    : ""
                } ${ROLE_COLORS[r.role] ?? "bg-cos-cloud text-cos-slate"}`}
              >
                {r.role}
                <span className="ml-1.5 opacity-70">({r.count.toLocaleString()})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate-light" />
          <input
            type="text"
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-cos-lg border border-cos-border bg-white py-2 pl-9 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { key: "", label: "All" },
              { key: "true", label: "Matched" },
              { key: "false", label: "Unmatched" },
            ] as { key: "" | "true" | "false"; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMatchedFilter(key)}
              className={`rounded-cos-pill px-3 py-1.5 text-xs font-medium transition-colors ${
                matchedFilter === key
                  ? "bg-cos-electric text-white"
                  : "bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {(search || roleFilter || matchedFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setRoleFilter("");
              setMatchedFilter("");
            }}
            className="text-xs text-cos-slate hover:text-cos-electric"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count + pagination header */}
      <div className="flex items-center justify-between text-xs text-cos-slate">
        <span>
          {total.toLocaleString()} user{total !== 1 ? "s" : ""}
          {search || roleFilter || matchedFilter ? " (filtered)" : ""}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-cos p-1 hover:bg-cos-cloud disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-cos p-1 hover:bg-cos-cloud disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* User Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-16">
          <Users className="h-10 w-10 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-midnight">
            {stats?.total === 0
              ? "No legacy users imported yet"
              : "No users match your filters"}
          </p>
          {stats?.total === 0 && (
            <p className="mt-1 text-xs text-cos-slate">
              Click &quot;Run Import&quot; to import users from the legacy platform.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  User
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Email
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Title
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Legacy Org
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Linked Firm
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Roles
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/60">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="transition-colors hover:bg-cos-electric/[0.02]"
                >
                  {/* Name */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-[10px] font-semibold text-cos-electric">
                        {(user.firstName ?? "?").charAt(0).toUpperCase()}
                        {(user.lastName ?? "").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-cos-midnight text-sm">
                        {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                      </span>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-cos-slate">
                      {user.email ?? "—"}
                    </span>
                  </td>

                  {/* Title */}
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-cos-slate">
                      {user.title ?? "—"}
                    </span>
                  </td>

                  {/* Legacy Org */}
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-cos-slate">
                      {user.legacyOrgName ?? "—"}
                    </span>
                  </td>

                  {/* Linked Firm */}
                  <td className="px-4 py-2.5">
                    {user.firmName ? (
                      <a
                        href={`/admin/customers`}
                        className="flex items-center gap-1 text-xs font-medium text-cos-electric hover:underline"
                      >
                        <Building2 className="h-3 w-3" />
                        {user.firmName}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-cos-slate-light italic">
                        <XCircle className="h-3 w-3" />
                        Unmatched
                      </span>
                    )}
                  </td>

                  {/* Roles */}
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(user.legacyRoles ?? []).map((role) => (
                        <span
                          key={role}
                          className={`rounded-cos-pill px-2 py-0.5 text-[9px] font-medium ${
                            ROLE_COLORS[role] ?? "bg-cos-cloud text-cos-slate"
                          }`}
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs text-cos-slate">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-cos px-3 py-1.5 hover:bg-cos-cloud disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="px-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-cos px-3 py-1.5 hover:bg-cos-cloud disabled:opacity-30"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
