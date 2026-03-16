"use client";

import { useState, useEffect, useRef } from "react";
import {
  Building2,
  Globe,
  Users,
  MapPin,
  Calendar,
  Tag,
  Languages,
  BarChart3,
  Loader2,
  CheckCircle2,
  Pencil,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useFirmEdits } from "@/hooks/use-firm-edits";
import { useOssyContext } from "@/hooks/use-ossy-context";
import { emitOssyEvent } from "@/lib/ossy-events";
import { cn } from "@/lib/utils";
import {
  EditableTagSection,
  DataChip,
} from "@/components/firm/shared";

export default function FirmOverviewPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status, result } = useEnrichment();

  const company = result?.companyData;
  const classification = result?.classification;
  const extracted = result?.extracted;

  const {
    edits,
    editingSection,
    setEditingSection,
    editInput,
    setEditInput,
    addTag,
    removeTag,
    setFieldEdit,
    saving,
  } = useFirmEdits(status === "done" && !!result, {
    categories: classification?.categories,
    skills: classification?.skills,
    industries: classification?.industries,
    markets: classification?.markets,
    languages: classification?.languages,
    clients: extracted?.clients,
    aboutPitch: extracted?.aboutPitch,
  }, activeOrg?.id);

  const [showFullAbout, setShowFullAbout] = useState(false);

  // Prefer edits if non-empty, otherwise fall back to enrichment data.
  // Empty arrays from stale edits should not override fresh enrichment data.
  const categories = edits.categories?.length ? edits.categories : classification?.categories ?? [];
  const skills = edits.skills?.length ? edits.skills : classification?.skills ?? [];
  const industries = edits.industries?.length ? edits.industries : classification?.industries ?? [];
  const markets = edits.markets?.length ? edits.markets : classification?.markets ?? [];
  const languages = edits.languages?.length ? edits.languages : classification?.languages ?? [];
  const clients = edits.clients?.length ? edits.clients : extracted?.clients ?? [];
  const aboutPitch = edits.aboutPitch || extracted?.aboutPitch || "";

  // Calculate profile completeness
  const completenessItems = [
    !!company?.name,
    !!company?.industry,
    !!company?.size,
    !!company?.location,
    !!categories.length,
    !!skills.length,
    !!industries.length,
    !!markets.length,
    !!languages.length,
    !!clients.length,
    !!aboutPitch,
  ];
  const completedCount = completenessItems.filter(Boolean).length;
  const completeness = Math.round((completedCount / completenessItems.length) * 100);

  // ─── Ossy context: register page state ─────────────────────
  const { setPageContext } = useOssyContext();
  const prevCompletenessRef = useRef(0);

  useEffect(() => {
    setPageContext({
      page: "overview",
      completeness,
      filledFields: completedCount,
      totalFields: completenessItems.length,
      enrichmentStatus: status,
    });
    return () => setPageContext(null);
  }, [completeness, completedCount, completenessItems.length, status, setPageContext]);

  // Emit milestone events for profile completeness
  useEffect(() => {
    if (completeness > 0 && prevCompletenessRef.current < completeness) {
      // Emit at 50% and 100% milestones
      if (completeness >= 50 && prevCompletenessRef.current < 50) {
        emitOssyEvent({ type: "profile_completeness_milestone", percent: completeness });
      }
      if (completeness === 100 && prevCompletenessRef.current < 100) {
        emitOssyEvent({ type: "profile_completeness_milestone", percent: 100 });
      }
    }
    prevCompletenessRef.current = completeness;
  }, [completeness]);

  // Emit enrichment complete event
  useEffect(() => {
    if (status === "done") {
      emitOssyEvent({ type: "enrichment_stage_complete", stage: "firm_profile" });
    }
  }, [status]);

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Enrichment status banner */}
      {status === "loading" && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
          <p className="text-sm font-medium text-cos-electric">
            Researching your firm... This panel updates in real-time.
          </p>
        </div>
      )}

      {status === "done" && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-cos-signal" />
          <p className="text-sm font-medium text-cos-signal">
            Profile enriched — review and edit below
          </p>
        </div>
      )}

      {(status === "failed" || status === "error") && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-ember/20 bg-cos-ember/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-cos-ember" />
          <p className="text-sm font-medium text-cos-ember">
            Enrichment couldn&apos;t complete. Try refreshing, or tell Ossy your website URL.
          </p>
        </div>
      )}

      {/* Firm header card */}
      <div className="rounded-cos-2xl border border-cos-border bg-cos-surface-raised p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-cos-xl bg-cos-electric/10 text-cos-electric">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-base font-semibold text-cos-midnight truncate">
              {company?.name || activeOrg?.name || "Your Firm"}
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-cos-slate">
              <DataChip icon={<Globe className="h-3 w-3" />} value={result?.domain} placeholder="Website" />
              <DataChip icon={<MapPin className="h-3 w-3" />} value={company?.location} placeholder="Location" />
              <DataChip
                icon={<Users className="h-3 w-3" />}
                value={company?.employeeCount ? `${company.employeeCount.toLocaleString()} employees` : company?.size}
                placeholder="Size"
              />
              <DataChip icon={<Calendar className="h-3 w-3" />} value={company?.founded ? `Est. ${company.founded}` : undefined} placeholder="Founded" />
            </div>
          </div>
        </div>

        {/* About / Pitch — editable */}
        {aboutPitch ? (
          <div className="mt-3 border-t border-cos-border/50 pt-3">
            {editingSection === "about" ? (
              <div>
                <textarea
                  value={edits.aboutPitch ?? aboutPitch}
                  onChange={(e) => setFieldEdit("aboutPitch", e.target.value)}
                  className="w-full rounded-cos-md border border-cos-border bg-white p-2 text-xs leading-relaxed text-cos-slate-dim focus:border-cos-electric focus:outline-none"
                  rows={6}
                />
                <div className="mt-1 flex items-center gap-2">
                  <button onClick={() => setEditingSection(null)} className="text-[10px] text-cos-electric hover:underline">
                    Done
                  </button>
                  {saving && <Loader2 className="h-3 w-3 animate-spin text-cos-electric" />}
                  {!saving && edits.aboutPitch && <CheckCircle2 className="h-3 w-3 text-cos-signal" />}
                </div>
              </div>
            ) : (
              <div className="group relative">
                <p className={cn("text-xs leading-relaxed text-cos-slate-dim", !showFullAbout && "line-clamp-4")}>{aboutPitch}</p>
                {aboutPitch.length > 250 && (
                  <button
                    onClick={() => setShowFullAbout(!showFullAbout)}
                    className="mt-0.5 text-[10px] text-cos-electric hover:underline"
                  >
                    {showFullAbout ? "Show less" : "Show more"}
                  </button>
                )}
                <button
                  onClick={() => setEditingSection("about")}
                  className="absolute -top-1 right-0 rounded-cos-md p-1 text-cos-slate-light opacity-0 transition-opacity hover:text-cos-electric group-hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Profile completeness */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-cos-midnight">Profile Completeness</p>
          <span className={cn("text-xs font-semibold", completeness >= 70 ? "text-cos-signal" : completeness >= 30 ? "text-cos-electric" : "text-cos-slate-dim")}>
            {completeness}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-cos-full bg-cos-cloud-dim">
          <div className={cn("h-full rounded-cos-full transition-all duration-700", completeness >= 70 ? "bg-cos-signal" : "bg-cos-electric")} style={{ width: `${completeness}%` }} />
        </div>
        <p className="mt-1.5 text-[10px] text-cos-slate-dim">
          {completedCount} of {completenessItems.length} data points — name, industry, size, location, categories, skills, industries, markets, languages, clients, about
        </p>
      </div>

      {/* Firm Categories */}
      <EditableTagSection
        icon={<BarChart3 className="h-4 w-4" />}
        title="Firm Categories"
        tags={categories}
        field="categories"
        tagStyle="rounded-cos-pill bg-cos-electric/10 px-2.5 py-1 text-xs font-medium text-cos-electric"
        loading={status === "loading"}
        editing={editingSection === "categories"}
        onEdit={() => setEditingSection(editingSection === "categories" ? null : "categories")}
        onAdd={(v) => addTag("categories", v)}
        onRemove={(v) => removeTag("categories", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="Ossy will categorize your firm from your website"
      />

      {/* Skills */}
      <EditableTagSection
        icon={<Tag className="h-4 w-4" />}
        title="Skills"
        tags={skills}
        field="skills"
        tagStyle="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-xs text-cos-slate"
        loading={status === "loading"}
        editing={editingSection === "skills"}
        onEdit={() => setEditingSection(editingSection === "skills" ? null : "skills")}
        onAdd={(v) => addTag("skills", v)}
        onRemove={(v) => removeTag("skills", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="AI will tag skills from your content"
      />

      {/* Industries */}
      <EditableTagSection
        icon={<Building2 className="h-4 w-4" />}
        title="Industries"
        tags={industries}
        field="industries"
        tagStyle="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-xs text-cos-signal"
        loading={status === "loading"}
        editing={editingSection === "industries"}
        onEdit={() => setEditingSection(editingSection === "industries" ? null : "industries")}
        onAdd={(v) => addTag("industries", v)}
        onRemove={(v) => removeTag("industries", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="Verticals and industries you serve"
      />

      {/* Clients */}
      <EditableTagSection
        icon={<UserCheck className="h-4 w-4" />}
        title="Clients"
        tags={clients}
        field="clients"
        tagStyle="rounded-cos-pill border border-cos-border bg-white px-2 py-0.5 text-xs text-cos-midnight"
        loading={status === "loading"}
        editing={editingSection === "clients"}
        onEdit={() => setEditingSection(editingSection === "clients" ? null : "clients")}
        onAdd={(v) => addTag("clients", v)}
        onRemove={(v) => removeTag("clients", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="Client names from your website"
      />

      {/* Markets */}
      <EditableTagSection
        icon={<Globe className="h-4 w-4" />}
        title="Markets"
        tags={markets}
        field="markets"
        tagStyle="rounded-cos-pill bg-cos-cloud-dim px-2 py-0.5 text-xs text-cos-slate"
        loading={status === "loading"}
        editing={editingSection === "markets"}
        onEdit={() => setEditingSection(editingSection === "markets" ? null : "markets")}
        onAdd={(v) => addTag("markets", v)}
        onRemove={(v) => removeTag("markets", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="Countries and regions you operate in"
      />

      {/* Languages */}
      <EditableTagSection
        icon={<Languages className="h-4 w-4" />}
        title="Languages"
        tags={languages}
        field="languages"
        tagStyle="rounded-cos-pill bg-cos-cloud-dim px-2 py-0.5 text-xs text-cos-slate"
        loading={status === "loading"}
        editing={editingSection === "languages"}
        onEdit={() => setEditingSection(editingSection === "languages" ? null : "languages")}
        onAdd={(v) => addTag("languages", v)}
        onRemove={(v) => removeTag("languages", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="Business languages"
      />

      {/* AI Confidence */}
      {classification && classification.confidence > 0 && (
        <div className="rounded-cos-xl border border-cos-border/50 bg-cos-surface/50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-cos-slate-dim">AI Classification Confidence</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-cos-full bg-cos-cloud-dim">
              <div className="h-full rounded-cos-full bg-cos-electric transition-all duration-500" style={{ width: `${classification.confidence * 100}%` }} />
            </div>
            <span className="text-xs font-medium text-cos-slate">{Math.round(classification.confidence * 100)}%</span>
          </div>
          <p className="mt-1 text-[10px] text-cos-slate-dim">
            How confident the AI is in categorizing your firm based on your website content
          </p>
        </div>
      )}
    </div>
  );
}
