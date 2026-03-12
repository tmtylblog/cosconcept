"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Search,
  Loader2,
  Shield,
  UserPlus,
  ChevronDown,
  X,
  CheckCircle,
  AlertCircle,
  Mail,
  Crown,
  TrendingUp,
  HeartPulse,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ────────────────────────────────────────────────────────── */

interface StaffUser {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  jobTitle: string | null;
  createdAt: string;
  emailVerified: boolean | null;
}

const ROLES = [
  {
    value: "superadmin",
    label: "Super Admin",
    description: "Full platform access — all admin sections",
    color: "bg-cos-ember/10 text-cos-ember border-cos-ember/20",
    icon: <Crown className="h-3.5 w-3.5" />,
  },
  {
    value: "growth_ops",
    label: "Growth Ops",
    description: "LinkedIn inbox, campaigns, target lists, attribution",
    color: "bg-cos-electric/10 text-cos-electric border-cos-electric/20",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
  {
    value: "customer_success",
    label: "Customer Success",
    description: "CIO dashboard and customer health tracking",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: <HeartPulse className="h-3.5 w-3.5" />,
  },
  {
    value: "user",
    label: "User (no admin)",
    description: "Standard platform user — no admin access",
    color: "bg-cos-cloud text-cos-slate border-cos-border",
    icon: <Users className="h-3.5 w-3.5" />,
  },
];

function roleMeta(role: string | null) {
  return ROLES.find((r) => r.value === role) ?? ROLES[ROLES.length - 1];
}

/* ── Invite Modal ─────────────────────────────────────────────────── */

function InviteModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("growth_ops");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: data.message });
        onSuccess();
      } else {
        setResult({ ok: false, message: data.error ?? "Invite failed" });
      }
    } catch {
      setResult({ ok: false, message: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-cos-xl border border-cos-border bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border px-6 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-cos-electric" />
            <h2 className="font-heading text-base font-bold text-cos-midnight">
              Invite Staff Member
            </h2>
          </div>
          <button onClick={onClose} className="text-cos-slate hover:text-cos-midnight">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-cos-slate uppercase tracking-wide">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-cos-slate uppercase tracking-wide">
              Work Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-cos-slate uppercase tracking-wide">
              Access Level
            </label>
            <div className="space-y-2">
              {ROLES.filter((r) => r.value !== "user").map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-cos-lg border p-3 transition-all ${
                    role === r.value
                      ? "border-cos-electric bg-cos-electric/5"
                      : "border-cos-border hover:border-cos-electric/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                    className="mt-0.5 accent-cos-electric"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-cos-pill border px-2 py-0.5 text-[10px] font-semibold ${r.color}`}>
                        {r.icon}
                        {r.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-cos-slate">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`flex items-start gap-2 rounded-cos-lg border p-3 text-sm ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-cos-ember/20 bg-cos-ember/5 text-cos-ember"
            }`}>
              {result.ok ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{result.message}</span>
            </div>
          )}

          {!result?.ok && (
            <p className="text-[11px] text-cos-slate">
              <Mail className="mr-1 inline h-3 w-3" />
              They will receive an email to set their password and log in.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {result?.ok ? "Done" : "Cancel"}
            </Button>
            {!result?.ok && (
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="bg-cos-electric hover:bg-cos-electric/90"
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Send Invite
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Role Change Dropdown ─────────────────────────────────────────── */

function RoleDropdown({
  userId,
  currentRole,
  onChanged,
}: {
  userId: string;
  currentRole: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const meta = roleMeta(currentRole);

  async function changeRole(role: string) {
    setOpen(false);
    setSaving(true);
    await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    setSaving(false);
    onChanged();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-1 rounded-cos-pill border px-2.5 py-1 text-[11px] font-semibold transition-all hover:opacity-80 ${meta.color}`}
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          meta.icon
        )}
        {meta.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-cos-lg border border-cos-border bg-white shadow-lg">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => changeRole(r.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-cos-cloud first:rounded-t-cos-lg last:rounded-b-cos-lg"
              >
                <span className={`inline-flex items-center gap-1 rounded-cos-pill border px-2 py-0.5 text-[10px] font-semibold ${r.color}`}>
                  {r.icon}
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────── */

export default function StaffAccessPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/staff?${params}`);
      const data = await res.json();
      setStaff(data.staff ?? []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  async function revokeAccess(userId: string) {
    if (!confirm("Remove admin access for this user?")) return;
    await fetch(`/api/admin/staff?userId=${userId}`, { method: "DELETE" });
    fetchStaff();
  }

  // Count by role for the summary bar
  const roleCounts = ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r.value] = staff.filter((u) => u.role === r.value).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            Staff Access
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Invite team members and manage their admin access levels.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowInvite(true)}
          className="bg-cos-electric hover:bg-cos-electric/90"
        >
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Invite Staff
        </Button>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ROLES.filter((r) => r.value !== "user").map((r) => (
          <div key={r.value} className="rounded-cos-lg border border-cos-border bg-white px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1 rounded-cos-pill border px-2 py-0.5 text-[10px] font-semibold ${r.color}`}>
                {r.icon}
                {r.label}
              </span>
            </div>
            <div className="text-2xl font-bold text-cos-midnight">{roleCounts[r.value] ?? 0}</div>
            <div className="text-[10px] text-cos-slate mt-0.5">{r.description}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate-light" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-cos-lg border border-cos-border bg-white py-2 pl-9 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-16">
          <Shield className="h-10 w-10 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-midnight">
            {search ? "No staff match your search" : "No staff users yet"}
          </p>
          {!search && (
            <p className="mt-1 text-xs text-cos-slate">
              Click &quot;Invite Staff&quot; to add team members.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Name
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Email
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Access Level
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Status
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Joined
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border/60">
              {staff.map((user) => {
                const meta = roleMeta(user.role);
                const initials = (user.name ?? user.email)
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <tr key={user.id} className="transition-colors hover:bg-cos-electric/[0.02]">
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-[10px] font-semibold text-cos-electric">
                          {initials}
                        </div>
                        <div>
                          <div className="font-medium text-cos-midnight text-sm">
                            {user.name ?? "—"}
                          </div>
                          {user.jobTitle && (
                            <div className="text-[10px] text-cos-slate">{user.jobTitle}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-cos-slate">{user.email}</span>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <RoleDropdown
                        userId={user.id}
                        currentRole={user.role}
                        onChanged={fetchStaff}
                      />
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {user.banned ? (
                        <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-ember/10 px-2 py-0.5 text-[10px] font-medium text-cos-ember">
                          Banned
                        </span>
                      ) : user.emailVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-cos-pill bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                          <CheckCircle className="h-2.5 w-2.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm">
                          <Mail className="h-2.5 w-2.5" />
                          Invite Pending
                        </span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-cos-slate">
                        {new Date(user.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {user.role !== "superadmin" && (
                        <button
                          onClick={() => revokeAccess(user.id)}
                          className="text-xs text-cos-slate hover:text-cos-ember transition-colors"
                        >
                          Revoke access
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={fetchStaff}
        />
      )}
    </div>
  );
}
