"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  Search,
  Loader2,
  Shield,
  ShieldOff,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Building2,
  UserCheck,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
}

interface ExpertProfile {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  expertClassification: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  headline: string | null;
  shortBio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isPartner: boolean | null;
  company: { id: string; name: string; domain: string | null } | null;
}

const CLASSIFICATION_COLORS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  expert: { bg: "bg-cos-signal/10", text: "text-cos-signal", label: "Expert" },
  internal: {
    bg: "bg-cos-slate/10",
    text: "text-cos-slate",
    label: "Internal",
  },
  ambiguous: {
    bg: "bg-cos-warm/10",
    text: "text-cos-warm",
    label: "Ambiguous",
  },
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  superadmin: { bg: "bg-cos-ember/10", text: "text-cos-ember" },
  admin: { bg: "bg-cos-electric/10", text: "text-cos-electric" },
};

const PAGE_SIZE = 100;

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expertProfiles, setExpertProfiles] = useState<
    Record<string, { loading: boolean; profile: ExpertProfile | null }>
  >({});

  // Add staff modal
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState("admin");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [addTempPassword, setAddTempPassword] = useState("");

  useEffect(() => {
    fetch("/api/admin/staff")
      .then((res) => res.json())
      .then((data) => {
        if (data.staff) {
          setUsers(
            data.staff.map((u: { id: string; name: string; email: string; role: string | null; banned: boolean | null; createdAt: string }) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role ?? "user",
              banned: u.banned ?? false,
              createdAt: u.createdAt
                ? new Date(u.createdAt).toLocaleDateString()
                : "",
            }))
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleBan(userId: string) {
    await authClient.admin.banUser({ userId });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, banned: true } : u))
    );
  }

  async function handleUnban(userId: string) {
    await authClient.admin.unbanUser({ userId });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, banned: false } : u))
    );
  }

  async function handleSetRole(userId: string, role: string) {
    // Better Auth SDK types only accept "admin" | "user", but our DB also supports "superadmin".
    // Use type assertion for the API call while the DB column accepts any string.
    await authClient.admin.setRole({
      userId,
      role: role as "admin" | "user",
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    );
  }

  async function handleAddStaff() {
    if (!addEmail.trim()) { setAddError("Email is required"); return; }
    setAddLoading(true);
    setAddError("");
    setAddSuccess("");
    setAddTempPassword("");
    try {
      const res = await fetch("/api/admin/staff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), name: addName.trim() || undefined, role: addRole }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || "Failed"); return; }

      if (data.action === "created") {
        setAddSuccess(`Account created for ${data.user.name || data.user.email} as ${addRole}`);
        setAddTempPassword(data.tempPassword);
      } else {
        setAddSuccess(`${data.user.name || data.user.email} promoted to ${addRole}`);
      }

      // Refresh the staff list
      const staffRes = await fetch("/api/admin/staff");
      const staffData = await staffRes.json();
      if (staffData.staff) {
        setUsers(staffData.staff.map((u: { id: string; name: string; email: string; role: string | null; banned: boolean | null; createdAt: string }) => ({
          id: u.id, name: u.name, email: u.email, role: u.role ?? "user", banned: u.banned ?? false,
          createdAt: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "",
        })));
      }
    } catch (err) {
      setAddError(String(err));
    } finally {
      setAddLoading(false);
    }
  }

  async function handleExpandUser(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }

    setExpandedUserId(userId);

    // Fetch expert profile if not already loaded
    if (!expertProfiles[userId]) {
      setExpertProfiles((prev) => ({
        ...prev,
        [userId]: { loading: true, profile: null },
      }));

      try {
        const res = await fetch(`/api/admin/users/${userId}/expert-profile`);
        const data = await res.json();
        setExpertProfiles((prev) => ({
          ...prev,
          [userId]: { loading: false, profile: data.match || null },
        }));
      } catch {
        setExpertProfiles((prev) => ({
          ...prev,
          [userId]: { loading: false, profile: null },
        }));
      }
    }
  }

  const filtered = search
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-32 rounded-cos-md bg-cos-border" />
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
            Administrative Staff
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            {users.length} admin user{users.length !== 1 ? "s" : ""} with
            platform management access. Click a name to open their profile.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setShowAddStaff(true)}>
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />
            Add Staff
          </Button>
          <div className="flex items-center gap-1.5 rounded-cos bg-cos-ember/5 px-3 py-1.5">
            <ShieldCheck className="h-4 w-4 text-cos-ember" />
            <div className="text-center">
              <span className="text-sm font-bold text-cos-ember">
                {users.filter((u) => u.role === "superadmin").length}
              </span>
              <span className="ml-1 text-[10px] text-cos-slate">superadmin</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-cos bg-cos-electric/5 px-3 py-1.5">
            <Shield className="h-4 w-4 text-cos-electric" />
            <div className="text-center">
              <span className="text-sm font-bold text-cos-electric">
                {users.filter((u) => u.role === "admin").length}
              </span>
              <span className="ml-1 text-[10px] text-cos-slate">admin</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search staff by name or email..."
          className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        />
        {search && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-cos-border bg-cos-cloud/50">
              <th className="w-8 px-2 py-3.5" />
              <th className="w-[30%] px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Staff Member
              </th>
              <th className="w-[22%] px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Email
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Role
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Status
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Joined
              </th>
              <th className="w-24 px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cos-border/60">
            {paginated.map((user) => {
              const isExpanded = expandedUserId === user.id;
              const expertData = expertProfiles[user.id];
              const roleColor =
                ROLE_COLORS[user.role] ?? ROLE_COLORS.admin;

              return (
                <tr key={user.id} className="group">
                  <td colSpan={7} className="p-0">
                    {/* Main row */}
                    <div
                      className={`flex items-center transition-colors hover:bg-cos-electric/[0.02] ${
                        isExpanded ? "bg-cos-electric/[0.03]" : ""
                      }`}
                    >
                      {/* Expand chevron */}
                      <div className="w-8 px-2 py-3.5">
                        <button
                          onClick={() => handleExpandUser(user.id)}
                          className="text-cos-slate hover:text-cos-electric transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {/* User */}
                      <div
                        className="w-[30%] px-4 py-3.5 cursor-pointer"
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-cos-full text-xs font-semibold ${roleColor.bg} ${roleColor.text}`}>
                            {user.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <span className="truncate font-medium text-cos-midnight hover:text-cos-electric hover:underline">
                            {user.name}
                          </span>
                        </div>
                      </div>

                      {/* Email */}
                      <div className="w-[22%] px-4 py-3.5">
                        <span className="block truncate font-mono text-xs text-cos-slate" title={user.email}>
                          {user.email}
                        </span>
                      </div>

                      {/* Role */}
                      <div className="px-4 py-3.5">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleSetRole(user.id, e.target.value)
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-cos-md border border-cos-border bg-cos-cloud px-2 py-1 text-xs font-medium text-cos-midnight transition-colors focus:border-cos-electric focus:outline-none"
                        >
                          <option value="admin">Admin</option>
                          <option value="superadmin">Superadmin</option>
                          <option value="growth_ops">Growth Ops</option>
                          <option value="customer_success">CS</option>
                        </select>
                      </div>

                      {/* Status */}
                      <div className="px-4 py-3.5">
                        {user.banned ? (
                          <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-ember/8 px-2 py-0.5 text-[10px] font-medium text-cos-ember">
                            <span className="h-1.5 w-1.5 rounded-full bg-cos-ember" />
                            Banned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] font-medium text-cos-signal">
                            <span className="h-1.5 w-1.5 rounded-full bg-cos-signal" />
                            Active
                          </span>
                        )}
                      </div>

                      {/* Joined */}
                      <div className="px-4 py-3.5 text-xs text-cos-slate">
                        {user.createdAt}
                      </div>

                      {/* Actions */}
                      <div className="w-24 px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/admin/users/${user.id}`);
                            }}
                            title="View user details"
                            className="flex h-7 w-7 items-center justify-center rounded text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                          {user.banned ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnban(user.id);
                              }}
                              title="Unban user"
                              className="flex h-7 w-7 items-center justify-center rounded text-cos-ember hover:bg-cos-ember/5 transition-colors"
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBan(user.id);
                              }}
                              title="Ban user"
                              className="flex h-7 w-7 items-center justify-center rounded text-cos-slate hover:text-cos-ember hover:bg-cos-ember/5 transition-colors"
                            >
                              <Shield className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded expert profile section */}
                    {isExpanded && (
                      <div className="border-t border-cos-border bg-cos-cloud/30 px-5 py-4">
                        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cos-slate mb-3">
                          <UserCheck className="h-3.5 w-3.5" />
                          Linked Expert Profile
                        </h4>

                        {expertData?.loading ? (
                          <div className="flex items-center gap-2 text-sm text-cos-slate">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Looking up expert profile...
                          </div>
                        ) : expertData?.profile ? (
                          <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-4">
                            <div className="flex items-start gap-4">
                              {/* Avatar */}
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-cos-full bg-gradient-to-br from-cos-signal/20 to-cos-electric/20 text-sm font-semibold text-cos-signal">
                                {expertData.profile.name
                                  ?.charAt(0)
                                  ?.toUpperCase() || "?"}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-cos-midnight">
                                    {expertData.profile.name ||
                                      `${expertData.profile.firstName} ${expertData.profile.lastName}`}
                                  </span>
                                  {expertData.profile.expertClassification && (
                                    <span
                                      className={`inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold ${
                                        CLASSIFICATION_COLORS[
                                          expertData.profile
                                            .expertClassification
                                        ]?.bg || "bg-cos-slate/10"
                                      } ${
                                        CLASSIFICATION_COLORS[
                                          expertData.profile
                                            .expertClassification
                                        ]?.text || "text-cos-slate"
                                      }`}
                                    >
                                      {CLASSIFICATION_COLORS[
                                        expertData.profile
                                          .expertClassification
                                      ]?.label ||
                                        expertData.profile
                                          .expertClassification}
                                    </span>
                                  )}
                                </div>

                                {expertData.profile.title && (
                                  <p className="text-sm text-cos-slate mt-0.5">
                                    {expertData.profile.title}
                                  </p>
                                )}

                                {expertData.profile.headline && (
                                  <p className="text-xs text-cos-slate mt-1">
                                    {expertData.profile.headline}
                                  </p>
                                )}

                                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-cos-slate">
                                  {expertData.profile.company && (
                                    <span className="flex items-center gap-1">
                                      <Building2 className="h-3 w-3" />
                                      {expertData.profile.company.name}
                                    </span>
                                  )}
                                  {expertData.profile.email && (
                                    <span className="flex items-center gap-1 font-mono">
                                      <Mail className="h-3 w-3" />
                                      {expertData.profile.email}
                                    </span>
                                  )}
                                  {(expertData.profile.city ||
                                    expertData.profile.country) && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {[
                                        expertData.profile.city,
                                        expertData.profile.state,
                                        expertData.profile.country,
                                      ]
                                        .filter(Boolean)
                                        .join(", ")}
                                    </span>
                                  )}
                                </div>

                                {expertData.profile.linkedinUrl && (
                                  <a
                                    href={expertData.profile.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 mt-2 rounded-cos-md bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    LinkedIn Profile
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-cos-slate italic">
                            No linked expert profile found for{" "}
                            <span className="font-mono">{user.email}</span>
                          </p>
                        )}
                      </div>
                    )}
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
                  {search ? "No staff members match your search." : "No admin users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
            <span className="text-xs text-cos-slate">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-cos-slate">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {showAddStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-cos-midnight mb-1">Add Staff Member</h2>
            <p className="text-xs text-cos-slate mb-4">
              Add a new admin user. If they don&apos;t have an account yet, one will be created automatically.
            </p>

            {addSuccess ? (
              <div className="space-y-3">
                <div className="rounded-cos-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                  {addSuccess}
                </div>
                {addTempPassword && (
                  <div className="rounded-cos-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-semibold text-amber-800 mb-1">Temporary Password</p>
                    <p className="text-sm font-mono text-amber-900 select-all">{addTempPassword}</p>
                    <p className="text-[10px] text-amber-600 mt-1">Share this with the user so they can log in at /admin-login. They should change it after first login.</p>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => { setShowAddStaff(false); setAddEmail(""); setAddName(""); setAddRole("admin"); setAddSuccess(""); setAddTempPassword(""); }}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Email</label>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={(e) => { setAddEmail(e.target.value); setAddError(""); }}
                    placeholder="e.g. joseph@joincollectiveos.com"
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Full Name</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Joseph Gustilo"
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Role</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none"
                  >
                    <option value="superadmin">Superadmin</option>
                    <option value="admin">Admin</option>
                    <option value="growth_ops">Growth Ops</option>
                    <option value="customer_success">Customer Success</option>
                  </select>
                </div>
                {addError && (
                  <div className="rounded-cos-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                    {addError}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowAddStaff(false); setAddEmail(""); setAddName(""); setAddError(""); }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddStaff} disabled={addLoading || !addEmail.trim()}>
                    {addLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <UserCheck className="h-3.5 w-3.5 mr-1.5" />}
                    Add Staff
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
