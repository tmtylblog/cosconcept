"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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

  if (loading) {
    return <div className="text-sm text-cos-slate">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-cos-midnight">
        Users
      </h1>

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
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-cos-electric/5">
                <td className="px-4 py-3 text-cos-midnight">{user.name}</td>
                <td className="px-4 py-3 text-cos-slate">{user.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    onChange={(e) => handleSetRole(user.id, e.target.value as "user" | "admin")}
                    className="rounded-cos-md border border-cos-border bg-cos-surface px-2 py-1 text-xs"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  {user.banned ? (
                    <span className="text-xs font-medium text-cos-ember">
                      Banned
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-cos-signal">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-cos-slate">{user.createdAt}</td>
                <td className="px-4 py-3">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
