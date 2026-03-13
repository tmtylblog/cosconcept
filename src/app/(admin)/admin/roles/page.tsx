"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Shield,
  Crown,
  TrendingUp,
  HeartPulse,
  Plus,
  Loader2,
  X,
  Pencil,
  Trash2,
  Users,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/admin/permissions";

/* ── Types ────────────────────────────────────────────────────────── */

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

/* ── Icon map ─────────────────────────────────────────────────────── */

const ICON_MAP: Record<string, React.ReactNode> = {
  Crown: <Crown className="h-5 w-5" />,
  Shield: <Shield className="h-5 w-5" />,
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  HeartHandshake: <HeartPulse className="h-5 w-5" />,
};

const ICON_OPTIONS = ["Crown", "Shield", "TrendingUp", "HeartHandshake"];

const COLOR_OPTIONS = [
  { value: "cos-ember", label: "Ember", preview: "bg-cos-ember" },
  { value: "cos-electric", label: "Electric", preview: "bg-cos-electric" },
  { value: "cos-signal", label: "Signal", preview: "bg-cos-signal" },
  { value: "cos-warm", label: "Warm", preview: "bg-cos-warm" },
  { value: "cos-midnight", label: "Midnight", preview: "bg-cos-midnight" },
];

/* ── Component ────────────────────────────────────────────────────── */

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles");
      const data = await res.json();
      setRoles(data.roles ?? []);
    } catch (err) {
      console.error("Failed to fetch roles:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  function openCreate() {
    setEditingRole(null);
    setEditorOpen(true);
  }

  function openEdit(role: AdminRole) {
    setEditingRole(role);
    setEditorOpen(true);
  }

  async function handleDelete(role: AdminRole) {
    try {
      const res = await fetch(`/api/admin/roles?id=${role.id}&reassignTo=user`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to delete role");
        return;
      }
      setDeleteConfirm(null);
      fetchRoles();
    } catch (err) {
      setError(String(err));
    }
  }

  const sections = Object.entries(ADMIN_SECTIONS) as [AdminSection, { label: string; description: string }][];

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
          <h1 className="font-heading text-xl font-bold text-cos-midnight">
            Roles & Permissions
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Define admin roles and what each can access
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Role
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Role cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <div
            key={role.id}
            className="rounded-cos-2xl border border-cos-border bg-cos-surface p-5 transition-colors hover:border-cos-electric/30"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-surface-raised text-cos-midnight">
                  {ICON_MAP[role.icon ?? "Shield"] ?? <Shield className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-heading text-base font-semibold text-cos-midnight">
                    {role.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-cos-slate">
                    <Users className="h-3 w-3" />
                    {role.memberCount} {role.memberCount === 1 ? "member" : "members"}
                  </div>
                </div>
              </div>
              {role.isBuiltIn && (
                <span className="rounded-full bg-cos-cloud px-2 py-0.5 text-xs text-cos-slate">
                  Built-in
                </span>
              )}
            </div>

            {role.description && (
              <p className="mt-3 text-sm text-cos-slate">{role.description}</p>
            )}

            {/* Permission tags */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.slug === "superadmin" ? (
                <span className="rounded-full bg-cos-ember/10 px-2 py-0.5 text-xs font-medium text-cos-ember">
                  All permissions
                </span>
              ) : (
                (role.permissions as string[]).map((perm) => (
                  <span
                    key={perm}
                    className="rounded-full bg-cos-electric/10 px-2 py-0.5 text-xs text-cos-electric"
                  >
                    {ADMIN_SECTIONS[perm as AdminSection]?.label ?? perm}
                  </span>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(role)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              {!role.isBuiltIn && (
                <>
                  {deleteConfirm === role.id ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(role)}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Confirm Delete
                      </Button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs text-cos-slate hover:text-cos-midnight"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteConfirm(role.id)}
                      className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Permission matrix */}
      <div>
        <h2 className="mb-3 font-heading text-base font-semibold text-cos-midnight">
          Permission Matrix
        </h2>
        <div className="overflow-x-auto rounded-cos-xl border border-cos-border bg-cos-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-surface-raised text-left text-xs font-medium uppercase tracking-wider text-cos-slate">
                <th className="px-4 py-3">Section</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-4 py-3 text-center">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-cos-border">
              {sections.map(([key, section]) => (
                <tr key={key} className="hover:bg-cos-surface-raised/50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-cos-midnight">{section.label}</p>
                    <p className="text-xs text-cos-slate">{section.description}</p>
                  </td>
                  {roles.map((role) => {
                    const hasAccess =
                      role.slug === "superadmin" ||
                      (role.permissions as string[]).includes(key);
                    return (
                      <td key={role.id} className="px-4 py-2.5 text-center">
                        {hasAccess ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cos-cloud text-cos-slate-dim">
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor drawer */}
      {editorOpen && (
        <RoleEditorDrawer
          role={editingRole}
          onClose={() => {
            setEditorOpen(false);
            setEditingRole(null);
          }}
          onSaved={() => {
            fetchRoles();
            setEditorOpen(false);
            setEditingRole(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Role editor drawer ─────────────────────────────────────────── */

function RoleEditorDrawer({
  role,
  onClose,
  onSaved,
}: {
  role: AdminRole | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;
  const isSuperadmin = role?.slug === "superadmin";

  const [name, setName] = useState(role?.name ?? "");
  const [slug, setSlug] = useState(role?.slug ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [icon, setIcon] = useState(role?.icon ?? "Shield");
  const [color, setColor] = useState(role?.color ?? "cos-electric");
  const [permissions, setPermissions] = useState<string[]>(
    (role?.permissions as string[]) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name for new roles
  function handleNameChange(val: string) {
    setName(val);
    if (!isEdit) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "")
      );
    }
  }

  function togglePermission(section: string) {
    if (isSuperadmin) return;
    setPermissions((prev) =>
      prev.includes(section) ? prev.filter((p) => p !== section) : [...prev, section]
    );
  }

  async function handleSave() {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    setError(null);

    try {
      if (isEdit) {
        const res = await fetch("/api/admin/roles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: role.id,
            name: name.trim(),
            description: description.trim() || null,
            icon,
            color,
            permissions: isSuperadmin ? undefined : permissions,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to update role");
          return;
        }
      } else {
        const res = await fetch("/api/admin/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || null,
            icon,
            color,
            permissions,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to create role");
          return;
        }
      }
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const sections = Object.entries(ADMIN_SECTIONS) as [AdminSection, { label: string; description: string }][];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-cos-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cos-border px-6 py-4">
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            {isEdit ? `Edit ${role.name}` : "Create New Role"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-cos-slate hover:bg-cos-surface-raised hover:text-cos-midnight">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 rounded-cos-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Marketing Ops"
              className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => !isEdit && setSlug(e.target.value)}
              disabled={isEdit}
              className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric disabled:bg-cos-cloud disabled:text-cos-slate"
            />
            <p className="mt-1 text-xs text-cos-slate">
              {isEdit ? "Slug cannot be changed after creation" : "Auto-generated from name"}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this role does..."
              className="w-full rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
          </div>

          {/* Icon */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Icon</label>
            <div className="flex gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setIcon(opt)}
                  className={`flex h-10 w-10 items-center justify-center rounded-cos-lg border transition-colors ${
                    icon === opt
                      ? "border-cos-electric bg-cos-electric/10 text-cos-electric"
                      : "border-cos-border bg-cos-surface text-cos-slate hover:bg-cos-surface-raised"
                  }`}
                >
                  {ICON_MAP[opt]}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">Color</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setColor(opt.value)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                    color === opt.value ? "border-cos-midnight" : "border-transparent"
                  }`}
                  title={opt.label}
                >
                  <span className={`h-5 w-5 rounded-full ${opt.preview}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cos-midnight">
              Permissions
            </label>
            {isSuperadmin && (
              <p className="mb-2 text-xs text-cos-slate">
                Super Admin always has access to all sections.
              </p>
            )}
            <div className="space-y-2">
              {sections.map(([key, section]) => {
                const checked = isSuperadmin || permissions.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-center gap-3 rounded-cos-lg border p-3 transition-colors ${
                      checked
                        ? "border-cos-electric/30 bg-cos-electric/5"
                        : "border-cos-border bg-cos-surface hover:bg-cos-surface-raised"
                    } ${isSuperadmin ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermission(key)}
                      disabled={isSuperadmin}
                      className="rounded"
                    />
                    <div>
                      <p className="text-sm font-medium text-cos-midnight">{section.label}</p>
                      <p className="text-xs text-cos-slate">{section.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-cos-border px-6 py-4">
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !slug.trim() || saving}
            className="w-full"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Role"}
          </Button>
        </div>
      </div>
    </>
  );
}
