"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Target,
  Users,
  Building2,
  Globe,
  Handshake,
  DollarSign,
  Lightbulb,
  Shield,
  BarChart3,
} from "lucide-react";
import { EditableTagSection, asArray } from "@/components/firm/shared";

interface PreferencesData {
  preferences: Record<string, string | string[]>;
  confirmed: Record<string, unknown>;
  firmId: string;
}

// Preference field definitions with display config
const PREF_SECTIONS = [
  // v2 interview fields (text-based)
  { field: "partnershipPhilosophy", title: "Partnership Philosophy", icon: <Handshake className="h-3.5 w-3.5" />, type: "text" as const },
  { field: "capabilityGaps", title: "Capability Gaps", icon: <Target className="h-3.5 w-3.5" />, type: "text" as const },
  { field: "dealBreaker", title: "Deal Breaker", icon: <Shield className="h-3.5 w-3.5" />, type: "text" as const },
  { field: "geographyPreference", title: "Geography Preference", icon: <Globe className="h-3.5 w-3.5" />, type: "text" as const },
  // Shared / tag-based fields
  { field: "preferredPartnerTypes", title: "Preferred Partner Types", icon: <Building2 className="h-3.5 w-3.5" />, type: "tags" as const },
  { field: "desiredPartnerServices", title: "Desired Partner Services", icon: <Lightbulb className="h-3.5 w-3.5" />, type: "tags" as const },
  { field: "preferredPartnerSize", title: "Preferred Partner Size", icon: <Users className="h-3.5 w-3.5" />, type: "tags" as const },
  { field: "requiredPartnerIndustries", title: "Required Partner Industries", icon: <BarChart3 className="h-3.5 w-3.5" />, type: "tags" as const },
  { field: "preferredPartnerLocations", title: "Preferred Partner Locations", icon: <Globe className="h-3.5 w-3.5" />, type: "tags" as const },
  { field: "idealPartnerClientSize", title: "Ideal Partner Client Size", icon: <Users className="h-3.5 w-3.5" />, type: "text" as const },
  { field: "idealProjectSize", title: "Ideal Project Size", icon: <DollarSign className="h-3.5 w-3.5" />, type: "text" as const },
  { field: "typicalHourlyRates", title: "Typical Hourly Rates", icon: <DollarSign className="h-3.5 w-3.5" />, type: "text" as const },
  { field: "partnershipRole", title: "Partnership Role", icon: <Handshake className="h-3.5 w-3.5" />, type: "text" as const },
] as const;

const TAG_STYLE = "rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs text-cos-electric";

export function FirmPreferencesTab({ orgId }: { orgId: string }) {
  const [data, setData] = useState<PreferencesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editInputs, setEditInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  // Text field editing
  const [editingText, setEditingText] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/customers/${orgId}/profile`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getValue = (field: string): string | string[] => {
    return data?.preferences?.[field] ?? "";
  };

  const saveField = async (field: string, value: string | string[]) => {
    setSaving(field);
    try {
      await fetch(`/api/admin/customers/${orgId}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      fetchData();
    } finally {
      setSaving(null);
    }
  };

  const handleTagAdd = async (field: string, value: string) => {
    const current = asArray(getValue(field));
    if (current.includes(value.trim())) return;
    await saveField(field, [...current, value.trim()]);
    setEditInputs((prev) => ({ ...prev, [field]: "" }));
  };

  const handleTagRemove = async (field: string, value: string) => {
    const current = asArray(getValue(field));
    await saveField(field, current.filter((v) => v !== value));
  };

  const saveTextField = async (field: string) => {
    await saveField(field, textDraft);
    setEditingText(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-cos-slate-light" />
      </div>
    );
  }

  const hasAnyData = PREF_SECTIONS.some((s) => {
    const val = getValue(s.field);
    return Array.isArray(val) ? val.length > 0 : !!val;
  });

  return (
    <div className="space-y-4">
      {!hasAnyData && (
        <p className="py-4 text-center text-sm text-cos-slate-light italic">
          No partner preferences set yet
        </p>
      )}

      {PREF_SECTIONS.map(({ field, title, icon, type }) => {
        const val = getValue(field);

        if (type === "tags") {
          const tags = asArray(val);
          return (
            <EditableTagSection
              key={field}
              icon={icon}
              title={title}
              tags={tags}
              field={field}
              tagStyle={TAG_STYLE}
              loading={saving === field}
              editing={editingField === field}
              onEdit={() => setEditingField(editingField === field ? null : field)}
              onAdd={(v) => handleTagAdd(field, v)}
              onRemove={(v) => handleTagRemove(field, v)}
              editInput={editInputs[field] ?? ""}
              setEditInput={(v) => setEditInputs((prev) => ({ ...prev, [field]: v }))}
              emptyHint={`No ${title.toLowerCase()} set`}
            />
          );
        }

        // Text field
        const textVal = typeof val === "string" ? val : "";
        if (!textVal && editingText !== field) return null;

        return (
          <div key={field} className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-cos-slate-dim">{icon}</span>
              <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">{title}</p>
              {saving === field && <Loader2 className="ml-auto h-3 w-3 animate-spin text-cos-slate-dim" />}
            </div>
            {editingText === field ? (
              <div className="space-y-2">
                <textarea
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveTextField(field)}
                    className="rounded-cos-md bg-cos-electric px-3 py-1 text-xs font-medium text-white hover:bg-cos-electric/90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingText(null)}
                    className="rounded-cos-md px-3 py-1 text-xs text-cos-slate hover:text-cos-midnight"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p
                className="text-sm text-cos-midnight cursor-pointer hover:text-cos-electric"
                onClick={() => { setEditingText(field); setTextDraft(textVal); }}
              >
                {textVal}
              </p>
            )}
          </div>
        );
      })}

      {/* "Add preference" — show empty text sections that are hidden */}
      {PREF_SECTIONS.filter((s) => s.type === "text" && !getValue(s.field) && editingText !== s.field).length > 0 && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-cloud/30 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate-light">Add Preference</p>
          <div className="flex flex-wrap gap-1.5">
            {PREF_SECTIONS.filter((s) => s.type === "text" && !getValue(s.field) && editingText !== s.field).map((s) => (
              <button
                key={s.field}
                onClick={() => { setEditingText(s.field); setTextDraft(""); }}
                className="rounded-cos-pill border border-cos-border bg-white px-2.5 py-1 text-[10px] text-cos-slate hover:border-cos-electric hover:text-cos-electric"
              >
                + {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
