"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Search,
  Loader2,
  Shield,
  UserPlus,
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle,
  AlertCircle,
  Crown,
  TrendingUp,
  HeartPulse,
  Ban,
  UserCheck,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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

interface AdminRole {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  permissions: string[];
  isBuiltIn: boolean;
  memberCount: number;
}

interface ExpertProfile {
  id: string;
  full_name: string;
  title: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  linkedin_url: string | null;
  division: string | null;
}

/* ── Icon map ─────────────────────────────────────────────────────── */

const ROLE_ICONS: Record<string, React.ReactNode> = {
  Crown: <Crown className="h-3.5 w-3.5" />,
  Shield: <Shield className="h-3.5 w-3.5" />,
  TrendingUp: <TrendingUp className="h-3.5 w-3.5" />,
  HeartHandshake: <HeartPulse className="h-3.5 w-3.5" />,
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-cos-ember/10 text-cos-ember border-cos-ember/20",
  admin: "bg-cos-electric/10 text-cos-electric border-cos-electric/20",
  growth_ops: "bg-emerald-50 text-emerald-700 border-emerald-200",
  customer_success: "bg-amber-50 text-amber-700 border-amber-200",
  user: "bg-cos-cloud text-cos-slate border-cos-border",
};

/* ── Component ────────────────────────────────────────────────────── */

export default function StaffManagementPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expertProfiles, setExpertProfiles] = useState<Record<string, ExpertProfile | null>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/staff?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setStaff(data.staff ?? []);
    } catch (err) {
      console.error("Failed to fetch staff:", err);
    }
  }, [search]);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles");
      const data = await res.json();
      setRoles(data.roles ?? []);
    } catch (err) {
      console.error("Failed to fetch roles:", err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchStaff(), fetchRoles()]).finally(() => setLoading(false));
  }, [fetchStaff, fetchRoles]);

  async function handleRoleChange(userId: string, role: string) {
    setActionPending(userId);
    try {
      await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      setStaff((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      fetchRoles();
    } catch (err) {
      console.error("Role change failed:", err);
    } finally {
      setActionPending(null);
    }
  }

  async function handleBanToggle(user: StaffUser) {
    setActionPending(user.id);
    try {
      if (user.banned) {
        await authClient.admin.unbanUser({ userId: user.id });
      } else {
        await authClient.admin.banUser({ userId: user.id });
      }
      setStaff((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, banned: !u.banned } : u))
      );
    } catch (err) {
      console.error("Ban toggle failed:", err);
    } finally {
      setActionPending(null);
    }
  }

  async function handleImpersonate(userId: string) {
    try {
      await authClient.admin.impersonateUser({ userId });
      window.open("/dashboard", "_blank");
      setTimeout(async () => {
        await authClient.admin.stopImpersonating();
      }, 500);
    } catch (err) {
      console.error("Impersonation failed:", err);
    }
  }

  async function handleRevoke(userId: string) {
    setActionPending(userId);
    try {
      await fetch(`/api/admin/staff?userId=${userId}`, { method: "DELETE" });
      await fetchStaff();
      fetchRoles();
    } catch (err) {
      console.error("Revoke failed:", err);
    } finally {
      setActionPending(null);
    }
  }

  async function loadExpertProfile(userId: string) {
    if (expertProfiles[userId] !== undefined) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/expert-profile`);
      if (res.ok) {
        const data = await res.json();
        setExpertProfiles((prev) => ({ ...prev, [userId]: data.profile ?? null }));
      } else {
        setExpertProfiles((prev) => ({ ...prev, [userId]: null }));
      }
    } catch {
      setExpertProfiles((prev) => ({ ...prev, [userId]: null }));
    }
  }

  function toggleExpand(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
    } else {
      setExpandedId(userId);
      loadExpertProfile(userId);
    }
  }

  function toggleSelect(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  }

  async function handleBulkRoleChange(role: string) {
    setActionPending("bulk");
    try {
      for (const userId of selectedIds) {
        await fetch("/api/admin/staff", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role }),
        });
      }
      setSelectedIds(new Set());
      await fetchStaff();
      fetchRoles();
    } catch (err) {
      console.error("Bulk role change failed:", err);
    } finally {
      setActionPending(null);
    }
  }

  const filtered = staff.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    return true;
  });

  const getRoleConfig = (slug: string) => roles.find((r) => r.slug === slug);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-cos-midnight">Staff Management</h1>
          <p className="mt-1 text-sm text-cos-slate">
            Manage admin users, roles, and access
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Staff
        </Button>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {roles.map((role) => (
          <button
            key={role.id}
            onClick={() => setRoleFilter(roleFilter === role.slug ? "all" : role.slug)}
            className={`rounded-cos-xl border p-3 text-left transition-colors ${
              roleFilter === role.slug
                ? "border-cos-electric bg-cos-electric/5"
                : "border-cos-border bg-cos-surface hover:bg-cos-surface-raised"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-cos-slate">{role.name}</span>
            </div>
            <p className="mt-1 font-heading text-2xl font-bold text-cos-midnight">
              {role.memberCount}
            </p>
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-cos-lg border border-cos-border bg-cos-surface py-2 pl-10 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none"
        >
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-cos-xl border border-cos-electric/30 bg-cos-electric/5 p-3">
          <span className="text-sm font-medium text-cos-midnight">
            {selectedIds.size} selected
          </span>
          <select
            onChange={(e) => {
              if (e.target.value) handleBulkRoleChange(e.target.value);
              e.target.value = "";
            }}
            className="rounded-cos-lg border border-cos-border bg-cos-surface px-2 py-1.5 text-sm"
            disabled={actionPending === "bulk"}
          >
            <option value="">Change role to...</option>
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name}
              </option>
            ))}
            <option value="user">User (revoke admin)</option>
          </select>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-cos-slate hover:text-cos-midnight"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Staff table */}
      <div className="overflow-x-auto rounded-cos-xl border border-cos-border bg-cos-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cos-border bg-cos-surface-raised text-left text-xs font-medium uppercase tracking-wider text-cos-slate">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cos-border">
            {filtered.map((user) => (
              <StaffRow
                key={user.id}
                user={user}
                roles={roles}
                expanded={expandedId === user.id}
                selected={selectedIds.has(user.id)}
                expertProfile={expertProfiles[user.id]}
                actionPending={actionPending === user.id}
                onToggleExpand={() => toggleExpand(user.id)}
                onToggleSelect={() => toggleSelect(user.id)}
                onRoleChange={(role) => handleRoleChange(user.id, role)}
                onBanToggle={() => handleBanToggle(user)}
                onImpersonate={() => handleImpersonate(user.id)}
                onRevoke={() => handleRevoke(user.id)}
                getRoleConfig={getRoleConfig}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-cos-slate">
                  No staff members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite drawer */}
      {inviteOpen && (
        <InviteDrawer
          roles={roles}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            fetchStaff();
            fetchRoles();
          }}
        />
      )}
    </div>
  );
}

/* ── Staff row ──────────────────────────────────────────────────── */

function StaffRow({
  user,
  roles,
  expanded,
  selected,
  expertProfile,
  actionPending,
  onToggleExpand,
  onToggleSelect,
  onRoleChange,
  onBanToggle,
  onImpersonate,
  onRevoke,
  getRoleConfig,
}: {
  user: StaffUser;
  roles: AdminRole[];
  expanded: boolean;
  selected: boolean;
  expertProfile: ExpertProfile | null | undefined;
  actionPending: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onRoleChange: (role: string) => void;
  onBanToggle: () => void;
  onImpersonate: () => void;
  onRevoke: () => void;
  getRoleConfig: (slug: string) => AdminRole | undefined;
}) {
  const roleConfig = getRoleConfig(user.role ?? "");
  const colorClass = ROLE_COLORS[user.role ?? ""] ?? ROLE_COLORS.user;

  return (
    <>
      <tr className="group hover:bg-cos-surface-raised/50">
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="rounded"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={onToggleExpand} className="text-cos-slate hover:text-cos-midnight">
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <div>
              <a
                href={`/admin/users/${user.id}`}
                className="font-medium text-cos-midnight hover:text-cos-electric"
              >
                {user.name || "—"}
              </a>
              <p className="text-xs text-cos-slate">{user.email}</p>
              {user.jobTitle && (
                <p className="text-xs text-cos-slate-dim">{user.jobTitle}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <RoleDropdown
            value={user.role ?? "user"}
            roles={roles}
            onChange={onRoleChange}
            disabled={actionPending}
            colorClass={colorClass}
            label={roleConfig?.name ?? user.role ?? "User"}
          />
        </td>
        <td className="px-4 py-3">
          {user.banned ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Banned
            </span>
          ) : !user.emailVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              Invite Pending
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Active
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-cos-slate">
          {new Date(user.createdAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={onBanToggle}
              disabled={actionPending}
              title={user.banned ? "Unban" : "Ban"}
              className="rounded p-1.5 text-cos-slate hover:bg-cos-surface-raised hover:text-cos-midnight disabled:opacity-50"
            >
              {user.banned ? <UserCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            </button>
            <button
              onClick={onImpersonate}
              title="Impersonate"
              className="rounded p-1.5 text-cos-slate hover:bg-cos-surface-raised hover:text-cos-midnight"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            {user.role !== "superadmin" && (
              <button
                onClick={onRevoke}
                disabled={actionPending}
                title="Revoke admin access"
                className="rounded p-1.5 text-cos-slate hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-cos-surface-raised/30 px-12 py-4">
            {expertProfile === undefined ? (
              <div className="flex items-center gap-2 text-sm text-cos-slate">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading expert profile...
              </div>
            ) : expertProfile === null ? (
              <p className="text-sm text-cos-slate">No linked expert profile found.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-cos-midnight">{expertProfile.full_name}</p>
                {expertProfile.title && (
                  <p className="text-cos-slate">
                    {expertProfile.title}
                    {expertProfile.company ? ` at ${expertProfile.company}` : ""}
                  </p>
                )}
                {expertProfile.headline && (
                  <p className="text-xs text-cos-slate-dim">{expertProfile.headline}</p>
                )}
                <div className="flex gap-4 text-xs text-cos-slate">
                  {expertProfile.location && <span>{expertProfile.location}</span>}
                  {expertProfile.division && (
                    <span className="rounded bg-cos-cloud px-1.5 py-0.5 text-cos-slate">
                      {expertProfile.division}
                    </span>
                  )}
                  {expertProfile.linkedin_url && (
                    <a
                      href={expertProfile.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cos-electric hover:underline"
                    >
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Role dropdown ──────────────────────────────────────────────── */

function RoleDropdown({
  value,
  roles,
  onChange,
  disabled,
  colorClass,
  label,
}: {
  value: string;
  roles: AdminRole[];
  onChange: (role: string) => void;
  disabled: boolean;
  colorClass: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${colorClass} ${
          disabled ? "opacity-50" : "cursor-pointer hover:opacity-80"
        }`}
      >
        {label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-cos-lg border border-cos-border bg-cos-surface p-1 shadow-lg">
            {roles.map((r) => (
              <button
                key={r.slug}
                onClick={() => {
                  onChange(r.slug);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2 rounded-cos-md px-3 py-2 text-left text-sm hover:bg-cos-surface-raised ${
                  value === r.slug ? "bg-cos-electric/5" : ""
                }`}
              >
                <div className="mt-0.5">{ROLE_ICONS[r.icon ?? "Shield"] ?? <Shield className="h-3.5 w-3.5" />}</div>
                <div>
                  <p className="font-medium text-cos-midnight">{r.name}</p>
                  <p className="text-xs text-cos-slate">{r.description}</p>
                </div>
              </button>
            ))}
            <div className="my-1 border-t border-cos-border" />
            <button
              onClick={() => {
                onChange("user");
                setOpen(false);
              }}
              className="flex w-full items-start gap-2 rounded-cos-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="mt-0.5 h-3.5 w-3.5" />
              <div>
                <p className="font-medium">Revoke admin access</p>
                <p className="text-xs text-red-400">Demote to regular user</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Invite drawer ──────────────────────────────────────────────── */

function InviteDrawer({
  roles,
  onClose,
  onInvited,
}: {
  roles: AdminRole[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleInvite() {
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: "error", message: data.error ?? "Failed to invite user" });
      } else {
        const emailNote = data.emailSent === false
          ? " (invite email failed — ask them to use Forgot Password)"
          : "";
        setResult({ type: "success", message: `${data.message}${emailNote}` });
        onInvited();
        setName("");
        setEmail("");
      }
    } catch (err) {
      setResult({ type: "error", message: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-cos-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-cos-border px-6 py-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-cos-midnight">Invite Staff</h2>
            <p className="text-sm text-cos-slate">Add a new admin team member</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-cos-slate hover:bg-cos-surface-raised hover:text-cos-midnight">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {result && (
            <div
              className={`flex items-start gap-2 rounded-cos-xl border p-3 text-sm ${
                result.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {result.type === "success" ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p>{result.message}</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Role</label>
            <div className="space-y-2">
              {roles.map((r) => (
                <label
                  key={r.slug}
                  className={`flex cursor-pointer items-start gap-3 rounded-cos-lg border p-3 transition-colors ${
                    role === r.slug
                      ? "border-cos-electric bg-cos-electric/5"
                      : "border-cos-border bg-cos-surface hover:bg-cos-surface-raised"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.slug}
                    checked={role === r.slug}
                    onChange={() => setRole(r.slug)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-cos-midnight">{r.name}</p>
                    <p className="text-xs text-cos-slate">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-cos-border px-6 py-4">
          <Button
            onClick={handleInvite}
            disabled={!name.trim() || !email.trim() || submitting}
            className="w-full gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {submitting ? "Inviting..." : "Send Invite"}
          </Button>
        </div>
      </div>
    </>
  );
}
