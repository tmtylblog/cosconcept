"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  UserCheck,
  Share2,
  Globe,
  Loader2,
  Sparkles,
  Tag,
  Languages,
} from "lucide-react";
import { EditableTagSection, asArray } from "@/components/firm/shared";

interface OverviewData {
  confirmed: Record<string, unknown>;
  firmId: string;
}

interface FirmData {
  description: string | null;
  enrichmentData: Record<string, unknown> | null;
}

const TAG_STYLES: Record<string, string> = {
  firmCategory: "rounded-cos-pill bg-cos-warm/10 px-2.5 py-0.5 text-xs text-cos-warm",
  services: "rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs text-cos-electric",
  clients: "rounded-cos-pill border border-cos-border bg-white px-2.5 py-0.5 text-xs text-cos-midnight",
  skills: "rounded-cos-pill bg-cos-signal/10 px-2.5 py-0.5 text-xs text-cos-signal",
  industries: "rounded-cos-pill bg-cos-ember/10 px-2.5 py-0.5 text-xs text-cos-ember",
  markets: "rounded-cos-pill bg-cos-warm/10 px-2.5 py-0.5 text-xs text-cos-warm",
  languages: "rounded-cos-pill bg-cos-slate-light/10 px-2.5 py-0.5 text-xs text-cos-slate",
};

const TAG_FIELDS = [
  { field: "firmCategory", title: "Categories", icon: <Tag className="h-3.5 w-3.5" /> },
  { field: "services", title: "Services", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { field: "clients", title: "Clients", icon: <UserCheck className="h-3.5 w-3.5" /> },
  { field: "skills", title: "Skills", icon: <Share2 className="h-3.5 w-3.5" /> },
  { field: "industries", title: "Industries", icon: <Building2 className="h-3.5 w-3.5" /> },
  { field: "markets", title: "Markets", icon: <Globe className="h-3.5 w-3.5" /> },
  { field: "languages", title: "Languages", icon: <Languages className="h-3.5 w-3.5" /> },
] as const;

export function FirmOverviewTab({ orgId, firm }: { orgId: string; firm: FirmData | null }) {
  const [profileData, setProfileData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editInputs, setEditInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchProfile = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/customers/${orgId}/profile`)
      .then((r) => r.json())
      .then((d) => setProfileData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Merge enrichment extracted data + confirmed overrides
  const getFieldValues = (field: string): string[] => {
    const confirmed = asArray(profileData?.confirmed?.[field]);
    if (confirmed.length > 0) return confirmed;
    // Fallback to enrichment extracted data
    const ed = firm?.enrichmentData;
    if (!ed) return [];
    const extracted = (ed as Record<string, unknown>).extracted as Record<string, unknown> | undefined;
    // Check both top-level and extracted sub-object
    return asArray((ed as Record<string, unknown>)[field]) || asArray(extracted?.[field]);
  };

  const handleAdd = async (field: string, value: string) => {
    const current = getFieldValues(field);
    if (current.includes(value.trim())) return;
    const newValues = [...current, value.trim()];
    setSaving(field);
    try {
      await fetch(`/api/admin/customers/${orgId}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: newValues }),
      });
      fetchProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
      setEditInputs((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleRemove = async (field: string, value: string) => {
    const current = getFieldValues(field);
    const newValues = current.filter((v) => v !== value);
    setSaving(field);
    try {
      await fetch(`/api/admin/customers/${orgId}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: newValues }),
      });
      fetchProfile();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-cos-slate-light" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* About */}
      {firm?.description && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-cos-slate-dim" />
            <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">About</p>
          </div>
          <p className="text-sm text-cos-midnight leading-relaxed">{firm.description}</p>
        </div>
      )}

      {/* Tag sections */}
      {TAG_FIELDS.map(({ field, title, icon }) => {
        const tags = getFieldValues(field);
        return (
          <EditableTagSection
            key={field}
            icon={icon}
            title={title}
            tags={tags}
            field={field}
            tagStyle={TAG_STYLES[field] ?? TAG_STYLES.skills}
            loading={saving === field}
            editing={editingField === field}
            onEdit={() => setEditingField(editingField === field ? null : field)}
            onAdd={(val) => handleAdd(field, val)}
            onRemove={(val) => handleRemove(field, val)}
            editInput={editInputs[field] ?? ""}
            setEditInput={(v) => setEditInputs((prev) => ({ ...prev, [field]: v }))}
            emptyHint={`No ${title.toLowerCase()} yet`}
          />
        );
      })}
    </div>
  );
}
