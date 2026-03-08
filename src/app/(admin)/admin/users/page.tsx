"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { Search, Eye, Loader2, Shield, ShieldOff } from "lucide-react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [impersonating, setImpersonating] = useState<string | null>(null);

  useEffect(() => {
    authClient.admin
      .listUsers({ query: { limit: 100 } })
      .then((res) => {
        if (res.data?.users) {
          setUsers(
            res.data.users.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: (u as unknown as { role: string }).role ?? "user",
              banned: (u as unknown as { banned: boolean }).banned ?? false,
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

  async function handleSetRole(userId: string, role: "user" | "admin") {
    await authClient.admin.setRole({ userId, role });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    );
  }

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

  const filtered = search
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

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
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Users
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          {users.length} registered user{users.length !== 1 ? "s" : ""} on the platform.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name or email..."
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
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                User
              </th>
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Email
              </th>
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Role
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
            {filtered.map((user) => (
              <tr
                key={user.id}
                className="transition-colors hover:bg-cos-electric/[0.02]"
              >
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
                <td className="px-5 py-3.5 font-mono text-xs text-cos-slate">
                  {user.email}
                </td>
                <td className="px-5 py-3.5">
                  <select
                    value={user.role}
                    onChange={(e) =>
                      handleSetRole(user.id, e.target.value as "user" | "admin")
                    }
                    className="rounded-cos-md border border-cos-border bg-cos-cloud px-2.5 py-1 text-xs font-medium text-cos-midnight transition-colors focus:border-cos-electric focus:outline-none"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </td>
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
                <td className="px-5 py-3.5 text-xs text-cos-slate">
                  {user.createdAt}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1">
                    {user.banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnban(user.id)}
                        className="h-7 gap-1.5 text-xs"
                      >
                        <ShieldOff className="h-3 w-3" />
                        Unban
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBan(user.id)}
                        className="h-7 gap-1.5 text-xs"
                      >
                        <Shield className="h-3 w-3" />
                        Ban
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleImpersonate(user.id)}
                      disabled={
                        impersonating === user.id ||
                        user.role === "superadmin"
                      }
                      title="Impersonate this user"
                      className="h-7 w-7 p-0 text-cos-slate hover:text-cos-electric"
                    >
                      {impersonating === user.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-12 text-center text-sm text-cos-slate"
                >
                  {search ? "No users match your search." : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
