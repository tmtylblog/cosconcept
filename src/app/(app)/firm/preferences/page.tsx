"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Briefcase,
  Building2,
  Users,
  MapPin,
  Target,
  BarChart3,
  DollarSign,
  Compass,
  Handshake,
  Pencil,
  CheckCircle2,
  X,
  Plus,
} from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { cn } from "@/lib/utils";
import { asArray, EmptyHint } from "@/components/firm/shared";

export default function FirmPreferencesPage() {
  const { data: profileData, hydrated: profileHydrated, updateField } = useProfile();
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");

  const addPrefTag = useCallback(
    async (field: string, value: string) => {
      if (!value.trim()) return;
      const existing = asArray((profileData as Record<string, unknown>)[field]);
      // Case-insensitive duplicate check
      if (existing.some((e) => e.toLowerCase() === value.trim().toLowerCase())) return;
      const updated = [...existing, value.trim()];
      updateField(field, updated);
      // Persist to server — revert on failure
      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value: updated }),
        });
        if (!res.ok) {
          console.error(`[Preferences] Failed to save ${field}`);
          updateField(field, existing); // revert
        }
      } catch {
        updateField(field, existing); // revert
      }
      setEditInput("");
    },
    [profileData, updateField]
  );

  const removePrefTag = useCallback(
    async (field: string, value: string) => {
      const existing = asArray((profileData as Record<string, unknown>)[field]);
      const updated = existing.filter((v) => v !== value);
      updateField(field, updated);
      try {
        const res = await fetch("/api/profile/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value: updated }),
        });
        if (!res.ok) {
          updateField(field, existing); // revert
        }
      } catch {
        updateField(field, existing); // revert
      }
    },
    [profileData, updateField]
  );

  if (!profileHydrated) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-cos-slate-dim">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Partner Preferences
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Your ideal partner criteria used for matching. Click edit to refine, or talk to Ossy.
        </p>
      </div>

      {/* Section divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-cos-border" />
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cos-electric">
          <Handshake className="h-3.5 w-3.5" />
          Matching Criteria
        </p>
        <div className="h-px flex-1 bg-cos-border" />
      </div>

      {/* Q1: Desired Partner Services */}
      <EditablePrefSection
        icon={<Briefcase className="h-4 w-4" />}
        title="Desired Partner Services"
        field="desiredPartnerServices"
        tags={asArray(profileData.desiredPartnerServices)}
        tagStyle="rounded-cos-pill bg-cos-electric/10 px-2.5 py-1 text-xs font-medium text-cos-electric"
        emptyHint="Services you want from partners — tell Ossy or click edit"
        editing={editingSection === "desiredPartnerServices"}
        onEdit={() => setEditingSection(editingSection === "desiredPartnerServices" ? null : "desiredPartnerServices")}
        onAdd={(v) => addPrefTag("desiredPartnerServices", v)}
        onRemove={(v) => removePrefTag("desiredPartnerServices", v)}
        editInput={editInput}
        setEditInput={setEditInput}
      />

      {/* Q2: Required Partner Industries */}
      <EditablePrefSection
        icon={<Building2 className="h-4 w-4" />}
        title="Required Partner Industries"
        field="requiredPartnerIndustries"
        tags={asArray(profileData.requiredPartnerIndustries)}
        tagStyle="rounded-cos-pill bg-cos-signal/10 px-2.5 py-1 text-xs font-medium text-cos-signal"
        emptyHint="Industry experience required for partner matches"
        editing={editingSection === "requiredPartnerIndustries"}
        onEdit={() => setEditingSection(editingSection === "requiredPartnerIndustries" ? null : "requiredPartnerIndustries")}
        onAdd={(v) => addPrefTag("requiredPartnerIndustries", v)}
        onRemove={(v) => removePrefTag("requiredPartnerIndustries", v)}
        editInput={editInput}
        setEditInput={setEditInput}
      />

      {/* Q3: Ideal Partner Client Size */}
      <EditablePrefSection
        icon={<Users className="h-4 w-4" />}
        title="Ideal Partner Client Size"
        field="idealPartnerClientSize"
        tags={asArray(profileData.idealPartnerClientSize)}
        tagStyle="rounded-cos-pill bg-cos-midnight/8 px-2.5 py-1 text-xs text-cos-slate"
        emptyHint="What size companies your ideal partners serve"
        editing={editingSection === "idealPartnerClientSize"}
        onEdit={() => setEditingSection(editingSection === "idealPartnerClientSize" ? null : "idealPartnerClientSize")}
        onAdd={(v) => addPrefTag("idealPartnerClientSize", v)}
        onRemove={(v) => removePrefTag("idealPartnerClientSize", v)}
        editInput={editInput}
        setEditInput={setEditInput}
      />

      {/* Q4: Partner Locations */}
      <EditablePrefSection
        icon={<MapPin className="h-4 w-4" />}
        title="Partner Locations"
        field="preferredPartnerLocations"
        tags={asArray(profileData.preferredPartnerLocations)}
        tagStyle="rounded-cos-pill bg-cos-cloud-dim px-2.5 py-1 text-xs text-cos-slate"
        emptyHint="Where partners should be located"
        editing={editingSection === "preferredPartnerLocations"}
        onEdit={() => setEditingSection(editingSection === "preferredPartnerLocations" ? null : "preferredPartnerLocations")}
        onAdd={(v) => addPrefTag("preferredPartnerLocations", v)}
        onRemove={(v) => removePrefTag("preferredPartnerLocations", v)}
        editInput={editInput}
        setEditInput={setEditInput}
      />

      {/* Q5: Partner Types */}
      <EditablePrefSection
        icon={<Target className="h-4 w-4" />}
        title="Partner Firm Types"
        field="preferredPartnerTypes"
        tags={asArray(profileData.preferredPartnerTypes)}
        tagStyle="rounded-cos-pill bg-cos-ember/8 px-2.5 py-1 text-xs font-medium text-cos-ember"
        emptyHint="Types of firms you want to partner with"
        editing={editingSection === "preferredPartnerTypes"}
        onEdit={() => setEditingSection(editingSection === "preferredPartnerTypes" ? null : "preferredPartnerTypes")}
        onAdd={(v) => addPrefTag("preferredPartnerTypes", v)}
        onRemove={(v) => removePrefTag("preferredPartnerTypes", v)}
        editInput={editInput}
        setEditInput={setEditInput}
      />

      {/* Q6: Partner Size */}
      <EditablePrefSection
        icon={<BarChart3 className="h-4 w-4" />}
        title="Preferred Partner Size"
        field="preferredPartnerSize"
        tags={asArray(profileData.preferredPartnerSize)}
        tagStyle="rounded-cos-pill bg-cos-signal/8 px-2.5 py-1 text-xs text-cos-midnight"
        emptyHint="Size of partner firms you prefer"
        editing={editingSection === "preferredPartnerSize"}
        onEdit={() => setEditingSection(editingSection === "preferredPartnerSize" ? null : "preferredPartnerSize")}
        onAdd={(v) => addPrefTag("preferredPartnerSize", v)}
        onRemove={(v) => removePrefTag("preferredPartnerSize", v)}
        editInput={editInput}
        setEditInput={setEditInput}
      />

      {/* Q7: Ideal Project Size */}
      <EditablePrefSection
        icon={<DollarSign className="h-4 w-4" />}
        title="Ideal Project Size"
        field="idealProjectSize"
        tags={asArray(profileData.idealProjectSize)}
        tagStyle="rounded-cos-pill bg-cos-warm/10 px-2.5 py-1 text-xs font-medium text-cos-warm"
        emptyHint="Typical project budgets for partner work"
        editing={editingSection === "idealProjectSize"}
        onEdit={() => setEditingSection(editingSection === "idealProjectSize" ? null : "idealProjectSize")}
        onAdd={(v) => addPrefTag("idealProjectSize", v)}
        onRemove={(v) => removePrefTag("idealProjectSize", v)}
        editInput={editInput}
        setEditInput={setEditInput}
      />

      {/* Q8: Typical Hourly Rates (single value) */}
      <EditableSinglePrefSection
        icon={<DollarSign className="h-4 w-4" />}
        title="Typical Hourly Rates"
        field="typicalHourlyRates"
        value={typeof profileData.typicalHourlyRates === "string" ? profileData.typicalHourlyRates : undefined}
        emptyHint="Hourly rate range for partner subcontractors"
        editing={editingSection === "typicalHourlyRates"}
        onEdit={() => setEditingSection(editingSection === "typicalHourlyRates" ? null : "typicalHourlyRates")}
        onSave={async (val) => {
          const prev = typeof profileData.typicalHourlyRates === "string" ? profileData.typicalHourlyRates : "";
          updateField("typicalHourlyRates", val);
          try {
            const res = await fetch("/api/profile/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ field: "typicalHourlyRates", value: val }),
            });
            if (!res.ok) { updateField("typicalHourlyRates", prev); return; }
          } catch { updateField("typicalHourlyRates", prev); return; }
          setEditingSection(null);
        }}
      />

      {/* Q9: Partnership Role (single value) */}
      <EditableSinglePrefSection
        icon={<Compass className="h-4 w-4" />}
        title="Partnership Role"
        field="partnershipRole"
        value={typeof profileData.partnershipRole === "string" ? profileData.partnershipRole : undefined}
        emptyHint="Whether you give work, receive work, or both"
        editing={editingSection === "partnershipRole"}
        onEdit={() => setEditingSection(editingSection === "partnershipRole" ? null : "partnershipRole")}
        onSave={async (val) => {
          const prev = typeof profileData.partnershipRole === "string" ? profileData.partnershipRole : "";
          updateField("partnershipRole", val);
          try {
            const res = await fetch("/api/profile/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ field: "partnershipRole", value: val }),
            });
            if (!res.ok) { updateField("partnershipRole", prev); return; }
          } catch { updateField("partnershipRole", prev); return; }
          setEditingSection(null);
        }}
      />
    </div>
  );
}

// ─── Editable Preference Tag Section ─────────────────────

function EditablePrefSection({
  icon,
  title,
  field,
  tags,
  tagStyle,
  emptyHint,
  editing,
  onEdit,
  onAdd,
  onRemove,
  editInput,
  setEditInput,
}: {
  icon: React.ReactNode;
  title: string;
  field: string;
  tags: string[];
  tagStyle: string;
  emptyHint: string;
  editing: boolean;
  onEdit: () => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  editInput: string;
  setEditInput: (v: string) => void;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-cos-slate-dim">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">{title}</p>
        {tags.length > 0 && (
          <span className="rounded-cos-full bg-cos-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-cos-electric">
            {tags.length}
          </span>
        )}
        <button
          onClick={onEdit}
          className="ml-auto rounded-cos-md p-1 text-cos-slate-light transition-colors hover:text-cos-electric"
          title={editing ? "Done editing" : "Edit"}
        >
          {editing ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Pencil className="h-3 w-3" />
          )}
        </button>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className={cn("flex items-center gap-1", tagStyle)}>
              {tag}
              {editing && (
                <button
                  onClick={() => onRemove(tag)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <EmptyHint text={emptyHint} />
      )}

      {editing && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editInput.trim()) {
                onAdd(editInput);
              }
            }}
            placeholder={`Add ${title.toLowerCase()}...`}
            className="flex-1 rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
          <button
            onClick={() => editInput.trim() && onAdd(editInput)}
            className="flex h-6 w-6 items-center justify-center rounded-cos-md bg-cos-electric/10 text-cos-electric hover:bg-cos-electric/20"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Editable Single Value Preference Section ────────────

function EditableSinglePrefSection({
  icon,
  title,
  field,
  value,
  emptyHint,
  editing,
  onEdit,
  onSave,
}: {
  icon: React.ReactNode;
  title: string;
  field: string;
  value?: string;
  emptyHint: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value ?? "");

  // Re-sync inputValue when prop changes (e.g., Ossy updates it via chat)
  useEffect(() => {
    if (!editing) setInputValue(value ?? "");
  }, [value, editing]);

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-cos-slate-dim">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">{title}</p>
        <button
          onClick={onEdit}
          className="ml-auto rounded-cos-md p-1 text-cos-slate-light transition-colors hover:text-cos-electric"
          title={editing ? "Cancel" : "Edit"}
        >
          {editing ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Pencil className="h-3 w-3" />
          )}
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputValue.trim()) {
                onSave(inputValue.trim());
              }
            }}
            placeholder={emptyHint}
            className="flex-1 rounded-cos-md border border-cos-border bg-white px-2 py-1.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            autoFocus
          />
          <button
            onClick={() => inputValue.trim() && onSave(inputValue.trim())}
            className="rounded-cos-md bg-cos-electric/10 px-3 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20"
          >
            Save
          </button>
        </div>
      ) : value ? (
        <p className="text-sm font-medium text-cos-midnight">{value}</p>
      ) : (
        <EmptyHint text={emptyHint} />
      )}
    </div>
  );
}
