"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X, ChevronDown, ArrowLeft, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { scoreSpecialistProfile, type ScoreResult } from "@/lib/expert/quality-score";
import { PdlExperiencePicker } from "./pdl-experience-picker";

interface PdlExperience {
  company: { name: string; website?: string | null; industry?: string | null };
  title: { name: string };
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  summary?: string;
}

interface WorkExample {
  title: string;
  subject: string;
  companyName: string;
  companyIndustry: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  isPdlSource: boolean;
  pdlExperienceIndex?: number;
  exampleType: "project" | "role";
}

const EMPTY_EXAMPLE: WorkExample = {
  title: "",
  subject: "",
  companyName: "",
  companyIndustry: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  isPdlSource: false,
  exampleType: "project",
};

interface EditorProps {
  expertId: string;
  /** Existing specialist profile to edit (null = creating new) */
  initialProfile?: {
    id?: string;
    title?: string | null;
    bodyDescription?: string | null;
    skills?: string[] | null;
    industries?: string[] | null;
    services?: string[] | null;
    examples?: WorkExample[];
  } | null;
  pdlExperiences?: PdlExperience[];
  onSave?: (spId: string) => void;
  onCancel?: () => void;
}

export function SpecialistProfileEditor({
  expertId,
  initialProfile,
  pdlExperiences = [],
  onSave,
  onCancel,
}: EditorProps) {
  const [title, setTitle] = useState(initialProfile?.title ?? "");
  const [bodyDescription, setBodyDescription] = useState(
    initialProfile?.bodyDescription ?? ""
  );
  const [skills, setSkills] = useState<string[]>(initialProfile?.skills ?? []);
  const [industries, setIndustries] = useState<string[]>(
    initialProfile?.industries ?? []
  );
  const [services, setServices] = useState<string[]>(
    initialProfile?.services ?? []
  );
  const [examples, setExamples] = useState<WorkExample[]>(
    initialProfile?.examples?.length
      ? initialProfile.examples
      : [{ ...EMPTY_EXAMPLE }]
  );

  const [tagInputs, setTagInputs] = useState({
    skills: "",
    industries: "",
    services: "",
  });

  const [score, setScore] = useState<ScoreResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPdlPicker, setShowPdlPicker] = useState(false);
  const [pickerTargetIdx, setPickerTargetIdx] = useState<number>(0);

  // Recompute score whenever inputs change
  useEffect(() => {
    const result = scoreSpecialistProfile({
      title,
      bodyDescription,
      industries,
      examples,
    });
    setScore(result);
  }, [title, bodyDescription, industries, examples]);

  const addTag = useCallback(
    (field: "skills" | "industries" | "services", value: string) => {
      if (!value.trim()) return;
      const setter =
        field === "skills"
          ? setSkills
          : field === "industries"
            ? setIndustries
            : setServices;
      setter((prev) => {
        if (prev.includes(value.trim())) return prev;
        return [...prev, value.trim()];
      });
      setTagInputs((prev) => ({ ...prev, [field]: "" }));
    },
    []
  );

  const removeTag = useCallback(
    (field: "skills" | "industries" | "services", value: string) => {
      const setter =
        field === "skills"
          ? setSkills
          : field === "industries"
            ? setIndustries
            : setServices;
      setter((prev) => prev.filter((v) => v !== value));
    },
    []
  );

  const updateExample = useCallback(
    (idx: number, patch: Partial<WorkExample>) => {
      setExamples((prev) =>
        prev.map((ex, i) => (i === idx ? { ...ex, ...patch } : ex))
      );
    },
    []
  );

  const addExample = useCallback(() => {
    setExamples((prev) => [...prev, { ...EMPTY_EXAMPLE }]);
  }, []);

  const removeExample = useCallback((idx: number) => {
    setExamples((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handlePdlSelect = useCallback(
    (ex: PdlExperience, pdlIdx: number) => {
      updateExample(pickerTargetIdx, {
        title: ex.title.name,
        companyName: ex.company.name,
        companyIndustry: ex.company.industry ?? "",
        startDate: ex.startDate ?? "",
        endDate: ex.endDate ?? "",
        isCurrent: ex.isCurrent ?? false,
        isPdlSource: true,
        pdlExperienceIndex: pdlIdx,
        exampleType: "role",
      });
    },
    [pickerTargetIdx, updateExample]
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const isEditing = !!initialProfile?.id;
      const url = isEditing
        ? `/api/experts/${expertId}/specialist-profiles/${initialProfile!.id}`
        : `/api/experts/${expertId}/specialist-profiles`;
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          bodyDescription,
          skills,
          industries,
          services,
          examples,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }

      const data = await res.json();
      const spId = isEditing ? initialProfile!.id! : data.specialistProfile?.id;
      onSave?.(spId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const statusColor =
    score?.status === "strong"
      ? "text-cos-signal"
      : score?.status === "partial"
        ? "text-cos-electric"
        : score?.status === "weak"
          ? "text-cos-warm"
          : "text-cos-slate-dim";

  const barWidth = score ? `${score.score}%` : "0%";
  const barColor =
    score?.status === "strong"
      ? "bg-cos-signal"
      : score?.status === "partial"
        ? "bg-cos-electric"
        : "bg-cos-warm";

  return (
    <div className="cos-scrollbar mx-auto max-w-2xl space-y-4 overflow-y-auto p-6">
      {/* Back / cancel */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-cos-slate-dim hover:text-cos-midnight transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to profile
        </button>
      )}

      <h2 className="font-heading text-lg font-semibold text-cos-midnight">
        {initialProfile?.id ? "Edit Specialist Profile" : "New Specialist Profile"}
      </h2>

      {/* ─── Title ─────────────────────────────────────── */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-cos-midnight">
            Specialist Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fractional CMO for B2B SaaS"
            className="mt-1.5 w-full rounded-cos-md border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
        </label>

        {/* ─── Description ─ */}
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cos-midnight">
              Description
            </span>
            <span className="text-[10px] text-cos-slate-dim">
              {bodyDescription.length} chars
              {bodyDescription.length < 100 ? ` (need ${100 - bodyDescription.length} more)` : ""}
            </span>
          </div>
          <textarea
            value={bodyDescription}
            onChange={(e) => setBodyDescription(e.target.value)}
            rows={5}
            placeholder="Describe this specific expertise niche. What kinds of clients do you help? What outcomes do you deliver? (150–500 words ideal)"
            className="mt-1.5 w-full resize-none rounded-cos-md border border-cos-border bg-white px-3 py-2 text-sm leading-relaxed text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
        </label>

        {/* ─── Taxonomy tags ─ */}
        <TagInput
          label="Skills"
          tags={skills}
          inputValue={tagInputs.skills}
          onInputChange={(v) => setTagInputs((p) => ({ ...p, skills: v }))}
          onAdd={() => addTag("skills", tagInputs.skills)}
          onRemove={(v) => removeTag("skills", v)}
          tagStyle="bg-cos-midnight/5 text-cos-slate"
        />

        <TagInput
          label="Industries"
          tags={industries}
          inputValue={tagInputs.industries}
          onInputChange={(v) => setTagInputs((p) => ({ ...p, industries: v }))}
          onAdd={() => addTag("industries", tagInputs.industries)}
          onRemove={(v) => removeTag("industries", v)}
          tagStyle="bg-cos-signal/8 text-cos-signal"
        />

        <TagInput
          label="Services"
          tags={services}
          inputValue={tagInputs.services}
          onInputChange={(v) => setTagInputs((p) => ({ ...p, services: v }))}
          onAdd={() => addTag("services", tagInputs.services)}
          onRemove={(v) => removeTag("services", v)}
          tagStyle="bg-cos-electric/8 text-cos-electric"
        />
      </div>

      {/* ─── Work Examples ─────────────────────────────── */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-cos-midnight">Work Examples</p>
          <span className="text-[10px] text-cos-slate-dim">{examples.length}/3 examples</span>
        </div>

        {examples.map((ex, idx) => (
          <ExampleForm
            key={idx}
            index={idx}
            example={ex}
            onChange={(patch) => updateExample(idx, patch)}
            onRemove={examples.length > 1 ? () => removeExample(idx) : undefined}
            onPickFromPdl={
              pdlExperiences.length > 0
                ? () => {
                    setPickerTargetIdx(idx);
                    setShowPdlPicker(true);
                  }
                : undefined
            }
          />
        ))}

        {examples.length < 3 && (
          <button
            onClick={addExample}
            className="flex w-full items-center justify-center gap-1.5 rounded-cos-lg border border-dashed border-cos-border py-2.5 text-xs font-medium text-cos-slate-dim transition-colors hover:border-cos-electric/40 hover:text-cos-electric"
          >
            <Plus className="h-3.5 w-3.5" />
            Add example
          </button>
        )}
      </div>

      {/* ─── Quality Score ─────────────────────────────── */}
      {score && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-cos-midnight">Quality Score</p>
            <span className={cn("text-sm font-bold", statusColor)}>
              {score.score}/100 · {score.status.toUpperCase()}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-cos-full bg-cos-cloud-dim overflow-hidden">
            <div
              className={cn("h-full rounded-cos-full transition-all duration-500", barColor)}
              style={{ width: barWidth }}
            />
          </div>

          {/* Breakdown chips */}
          <div className="flex flex-wrap gap-1 pt-1">
            <ScoreChip
              label="Title"
              pts={score.breakdown.title}
              max={15}
            />
            <ScoreChip label="Description" pts={score.breakdown.bodyLength + score.breakdown.bodyDepth} max={25} />
            <ScoreChip label="Examples" pts={score.breakdown.example1 + score.breakdown.example2 + score.breakdown.example3} max={30} />
            <ScoreChip label="Completeness" pts={score.breakdown.exampleCompleteness} max={15} />
            <ScoreChip label="Coherence" pts={score.breakdown.coherence} max={15} />
          </div>

          {/* Hints */}
          {score.hints.length > 0 && (
            <div className="space-y-1 pt-1">
              {score.hints.map((hint, i) => (
                <p key={i} className="flex items-start gap-1.5 text-[11px] text-cos-slate-dim">
                  <span className="mt-0.5 shrink-0 text-cos-warm">→</span>
                  {hint}
                </p>
              ))}
            </div>
          )}

          {score.status === "strong" && (
            <p className="text-[11px] text-cos-signal font-medium">
              This profile will auto-publish and appear in search results.
            </p>
          )}
        </div>
      )}

      {/* ─── Error / Save ──────────────────────────────── */}
      {error && (
        <p className="rounded-cos-md bg-cos-ember/8 border border-cos-ember/20 px-3 py-2 text-xs text-cos-ember">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-cos-lg bg-cos-electric px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cos-electric/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save profile"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-cos-slate-dim hover:text-cos-midnight transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* PDL picker slide-over */}
      {showPdlPicker && (
        <PdlExperiencePicker
          experiences={pdlExperiences}
          onSelect={handlePdlSelect}
          onClose={() => setShowPdlPicker(false)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function TagInput({
  label,
  tags,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  tagStyle,
}: {
  label: string;
  tags: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (v: string) => void;
  tagStyle: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-cos-midnight">{label}</p>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              "flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
              tagStyle
            )}
          >
            {tag}
            <button
              onClick={() => onRemove(tag)}
              className="rounded-full p-0.5 hover:bg-black/10"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={`Add ${label.toLowerCase()}...`}
          className="flex-1 rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
        />
        <button
          onClick={onAdd}
          disabled={!inputValue.trim()}
          className="flex h-6 w-6 items-center justify-center rounded-cos-md bg-cos-electric/10 text-cos-electric hover:bg-cos-electric/20 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function ExampleForm({
  index,
  example,
  onChange,
  onRemove,
  onPickFromPdl,
}: {
  index: number;
  example: WorkExample;
  onChange: (patch: Partial<WorkExample>) => void;
  onRemove?: () => void;
  onPickFromPdl?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-cos-lg border border-cos-border/60 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cos-electric/10 text-[10px] font-semibold text-cos-electric">
          {index + 1}
        </span>
        <p className="flex-1 truncate text-xs font-medium text-cos-midnight">
          {example.title || `Example ${index + 1}`}
        </p>
        <div className="flex items-center gap-1.5">
          {onPickFromPdl && (
            <button
              onClick={(e) => { e.stopPropagation(); onPickFromPdl(); }}
              className="rounded-cos-pill border border-cos-border px-2 py-0.5 text-[9px] text-cos-slate-dim hover:border-cos-electric/40 hover:text-cos-electric transition-colors"
            >
              Pull from PDL ↓
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="rounded-cos-md p-0.5 text-cos-slate-light hover:text-cos-ember transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-cos-slate-light transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-cos-border/30 px-3 pb-3 pt-2.5 space-y-2">
          <input
            type="text"
            value={example.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder='Title — e.g. "Rebuilt GTM for Series B Fintech" or "VP Marketing"'
            className="w-full rounded-cos-md border border-cos-border bg-cos-cloud/30 px-2.5 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
          <textarea
            value={example.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            rows={3}
            placeholder="What did you do and what was the outcome? (2–3 sentences)"
            className="w-full resize-none rounded-cos-md border border-cos-border bg-cos-cloud/30 px-2.5 py-1.5 text-xs leading-relaxed text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={example.companyName}
              onChange={(e) => onChange({ companyName: e.target.value })}
              placeholder="Company"
              className="flex-1 rounded-cos-md border border-cos-border bg-cos-cloud/30 px-2.5 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
            <input
              type="text"
              value={example.companyIndustry}
              onChange={(e) => onChange({ companyIndustry: e.target.value })}
              placeholder="Industry"
              className="flex-1 rounded-cos-md border border-cos-border bg-cos-cloud/30 px-2.5 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={example.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              placeholder="Start (YYYY-MM)"
              className="flex-1 rounded-cos-md border border-cos-border bg-cos-cloud/30 px-2.5 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
            />
            <input
              type="text"
              value={example.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              placeholder="End (or leave blank)"
              disabled={example.isCurrent}
              className="flex-1 rounded-cos-md border border-cos-border bg-cos-cloud/30 px-2.5 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none disabled:opacity-40"
            />
            <label className="flex items-center gap-1 text-[10px] text-cos-slate-dim cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={example.isCurrent}
                onChange={(e) =>
                  onChange({ isCurrent: e.target.checked, endDate: "" })
                }
                className="rounded"
              />
              Current
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreChip({ label, pts, max }: { label: string; pts: number; max: number }) {
  const full = pts >= max;
  return (
    <span
      className={cn(
        "rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
        full
          ? "bg-cos-signal/10 text-cos-signal"
          : pts > 0
            ? "bg-cos-electric/10 text-cos-electric"
            : "bg-cos-cloud-dim text-cos-slate-dim"
      )}
    >
      {full ? "✓ " : pts > 0 ? "◑ " : "○ "}
      {label} ({pts}/{max})
    </span>
  );
}
