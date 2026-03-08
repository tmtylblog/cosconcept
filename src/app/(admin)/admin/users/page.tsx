"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  Search,
  Eye,
  Loader2,
} from "lucide-react";

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
      // Redirect to dashboard as the impersonated user
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
    return <div className="text-sm text-cos-slate">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">
            Users
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            {users.length} total users on the platform.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-2.5 focus-within:border-cos-electric focus-within:ring-1 focus-within:ring-cos-electric">
        <Search className="h-4 w-4 text-cos-slate" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name or email..."
          className="flex-1 bg-transparent text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
        />
        {search && (
          <span className="text-xs text-cos-slate">
            {filtered.length} results
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-cos-xl border border-cos-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-cos-border bg-cos-surface">
            <tr>
              <th className="px-4 py-3 font-medium text-cos-slate">Name</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Email</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Role</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Status</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Joined</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cos-border">
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-cos-electric/5">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-cos-full bg-cos-electric/10 text-xs font-medium text-cos-electric">
                      {user.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <span className="text-cos-midnight">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-cos-slate">{user.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) =>
                      handleSetRole(user.id, e.target.value as "user" | "admin")
                    }
                    className="rounded-cos-md border border-cos-border bg-cos-surface px-2 py-1 text-xs"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  {user.banned ? (
                    <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-ember/10 px-2 py-0.5 text-xs font-medium text-cos-ember">
                      Banned
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-xs font-medium text-cos-signal">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-cos-slate">{user.createdAt}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {user.banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnban(user.id)}
                      >
                        Unban
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBan(user.id)}
                      >
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
                      className="text-cos-slate"
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
                  className="px-4 py-8 text-center text-sm text-cos-slate"
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
