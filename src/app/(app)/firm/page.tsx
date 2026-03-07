"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Globe,
  Users,
  MapPin,
  Calendar,
  Briefcase,
  Tag,
  Languages,
  FileText,
  UserCheck,
  BarChart3,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Pencil,
  X,
  Plus,
  Presentation,
  HardDrive,
  Link2,
  Clock,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { cn } from "@/lib/utils";
import {
  CHAMELEON_CASE_STUDIES,
  CHAMELEON_EXPERTS,
} from "@/data/dummy/chameleon-collective";
import type { CaseStudy, Expert, ExpertSpecialistProfile } from "@/types/cos-data";

/** Local edit overrides — user edits take precedence over enrichment data */
interface FirmEdits {
  aboutPitch?: string;
  services?: string[];
  clients?: string[];
  categories?: string[];
  skills?: string[];
  industries?: string[];
  markets?: string[];
  languages?: string[];
}

export default function FirmPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status, result } = useEnrichment();
  const [edits, setEdits] = useState<FirmEdits>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");

  // Merge enrichment data with user edits (edits take precedence)
  const company = result?.companyData;
  const classification = result?.classification;
  const extracted = result?.extracted;

  const services = edits.services ?? extracted?.services ?? [];
  const clients = edits.clients ?? extracted?.clients ?? [];
  const categories = edits.categories ?? classification?.categories ?? [];
  const skills = edits.skills ?? classification?.skills ?? [];
  const industries = edits.industries ?? classification?.industries ?? [];
  const markets = edits.markets ?? classification?.markets ?? [];
  const languages = edits.languages ?? classification?.languages ?? [];
  const aboutPitch = edits.aboutPitch ?? extracted?.aboutPitch ?? "";

  // Sync enrichment data into edits when enrichment completes (if no user edits yet)
  useEffect(() => {
    if (status === "done" && result) {
      // Only set defaults for fields user hasn't edited
      setEdits((prev) => ({
        ...prev,
        services: prev.services ?? result.extracted?.services,
        clients: prev.clients ?? result.extracted?.clients,
        categories: prev.categories ?? result.classification?.categories,
        skills: prev.skills ?? result.classification?.skills,
        industries: prev.industries ?? result.classification?.industries,
        markets: prev.markets ?? result.classification?.markets,
        languages: prev.languages ?? result.classification?.languages,
        aboutPitch: prev.aboutPitch ?? result.extracted?.aboutPitch,
      }));
    }
  }, [status, result]);

  const addTag = useCallback(
    (field: keyof FirmEdits, value: string) => {
      if (!value.trim()) return;
      setEdits((prev) => {
        const existing = (prev[field] as string[]) ?? [];
        if (existing.includes(value.trim())) return prev;
        return { ...prev, [field]: [...existing, value.trim()] };
      });
      setEditInput("");
    },
    []
  );

  const removeTag = useCallback(
    (field: keyof FirmEdits, value: string) => {
      setEdits((prev) => {
        const existing = (prev[field] as string[]) ?? [];
        return { ...prev, [field]: existing.filter((v) => v !== value) };
      });
    },
    []
  );

  // Calculate profile completeness based on merged data
  const completenessItems = [
    !!company?.name,
    !!company?.industry,
    !!company?.size,
    !!company?.location,
    !!services.length,
    !!clients.length,
    !!categories.length,
    !!skills.length,
    !!industries.length,
    !!markets.length,
    !!languages.length,
    !!aboutPitch,
  ];
  const completedCount = completenessItems.filter(Boolean).length;
  const completeness = Math.round(
    (completedCount / completenessItems.length) * 100
  );

  return (
    <div className="cos-scrollbar space-y-4 overflow-y-auto p-5">
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
                  onChange={(e) => setEdits((p) => ({ ...p, aboutPitch: e.target.value }))}
                  className="w-full rounded-cos-md border border-cos-border bg-white p-2 text-xs leading-relaxed text-cos-slate-dim focus:border-cos-electric focus:outline-none"
                  rows={4}
                />
                <button onClick={() => setEditingSection(null)} className="mt-1 text-[10px] text-cos-electric hover:underline">
                  Done
                </button>
              </div>
            ) : (
              <div className="group relative">
                <p className="text-xs leading-relaxed text-cos-slate-dim line-clamp-4">{aboutPitch}</p>
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
      </div>

      {/* Firm Categories — editable tags */}
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

      {/* Services — editable list */}
      <EditableTagSection
        icon={<Briefcase className="h-4 w-4" />}
        title="Services & Solutions"
        tags={services}
        field="services"
        tagStyle="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-xs text-cos-slate"
        loading={status === "loading"}
        editing={editingSection === "services"}
        onEdit={() => setEditingSection(editingSection === "services" ? null : "services")}
        onAdd={(v) => addTag("services", v)}
        onRemove={(v) => removeTag("services", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="Detected from your website services page"
      />

      {/* Skills — editable tags */}
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

      {/* Industries — editable tags */}
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

      {/* Clients — editable tags */}
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

      {/* Case Studies — two tiers: ingested (COS analysis) and discovered (pending) */}
      <ProfileSection
        icon={<FileText className="h-4 w-4" />}
        title="Case Studies"
        count={CHAMELEON_CASE_STUDIES.length + (extracted?.caseStudyUrls?.length ?? 0)}
        loading={status === "loading"}
      >
        <div className="space-y-3">
          {/* Tier 1: Ingested case studies with COS analysis */}
          {CHAMELEON_CASE_STUDIES.filter((cs) => cs.cosAnalysis).map((cs) => (
            <CaseStudyCard key={cs.id} caseStudy={cs} />
          ))}

          {/* Tier 2: Discovered but pending ingestion */}
          {(() => {
            const pending = CHAMELEON_CASE_STUDIES.filter((cs) => !cs.cosAnalysis);
            const discoveredUrls = extracted?.caseStudyUrls ?? [];
            if (pending.length === 0 && discoveredUrls.length === 0) return null;
            return (
              <div className="border-t border-cos-border/50 pt-2">
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-cos-slate-dim">
                  <Clock className="mr-1 inline h-2.5 w-2.5" />
                  Pending ingestion ({pending.length + discoveredUrls.length})
                </p>
                <div className="space-y-1">
                  {pending.map((cs) => (
                    <a
                      key={cs.id}
                      href={cs.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-cos-md bg-cos-cloud-dim/50 px-2.5 py-1.5 transition-colors hover:bg-cos-cloud-dim"
                    >
                      <SourceTypeIcon sourceType={cs.sourceType} className="h-3 w-3 shrink-0 text-cos-slate-dim" />
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-cos-midnight">{cs.title}</p>
                      <ExternalLink className="h-3 w-3 shrink-0 text-cos-electric" />
                    </a>
                  ))}
                  {discoveredUrls.slice(0, 8).map((csUrl, i) => {
                    const shortUrl = csUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");
                    const title = shortUrl.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") ?? shortUrl;
                    return (
                      <a
                        key={`disc-${i}`}
                        href={csUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-cos-md bg-cos-cloud-dim/50 px-2.5 py-1.5 transition-colors hover:bg-cos-cloud-dim"
                      >
                        <Globe className="h-3 w-3 shrink-0 text-cos-slate-dim" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium capitalize text-cos-midnight">{title}</p>
                          <p className="truncate text-[10px] text-cos-slate-dim">{shortUrl}</p>
                        </div>
                        <ExternalLink className="h-3 w-3 shrink-0 text-cos-electric" />
                      </a>
                    );
                  })}
                  {discoveredUrls.length > 8 && (
                    <p className="text-[10px] text-cos-slate-dim">+{discoveredUrls.length - 8} more discovered</p>
                  )}
                </div>
              </div>
            );
          })()}

          {CHAMELEON_CASE_STUDIES.length === 0 && !extracted?.caseStudyUrls?.length && (
            <EmptyHint text="Case studies from your website and portfolio" />
          )}
        </div>
      </ProfileSection>

      {/* Markets — editable tags */}
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

      {/* Languages — editable tags */}
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

      {/* Experts / Team Members */}
      <ProfileSection
        icon={<Users className="h-4 w-4" />}
        title="Experts"
        count={CHAMELEON_EXPERTS.length}
        loading={status === "loading"}
      >
        {CHAMELEON_EXPERTS.length > 0 ? (
          <div className="space-y-2">
            {CHAMELEON_EXPERTS.map((expert) => (
              <ExpertCard key={expert.id} expert={expert} />
            ))}
            {/* Also show names detected from website that aren't matched to experts yet */}
            {extracted?.teamMembers?.length ? (
              <div className="border-t border-cos-border/50 pt-2">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-cos-slate-dim">
                  Detected from website (not yet matched)
                </p>
                <div className="flex flex-wrap gap-1">
                  {extracted.teamMembers.map((name) => (
                    <span key={name} className="rounded-cos-pill bg-cos-cloud-dim px-2 py-0.5 text-[10px] text-cos-slate-dim">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyHint text="Expert profiles from your team" />
        )}
      </ProfileSection>

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
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function ProfileSection({
  icon,
  title,
  count,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-cos-slate-dim">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">
          {title}
        </p>
        {count !== undefined && count > 0 && (
          <span className="rounded-cos-full bg-cos-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-cos-electric">
            {count}
          </span>
        )}
        {loading && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-cos-slate-dim" />
        )}
      </div>
      {children}
    </div>
  );
}

function EditableTagSection({
  icon,
  title,
  tags,
  field: _field,
  tagStyle,
  loading,
  editing,
  onEdit,
  onAdd,
  onRemove,
  editInput,
  setEditInput,
  emptyHint,
}: {
  icon: React.ReactNode;
  title: string;
  tags: string[];
  field: string;
  tagStyle: string;
  loading?: boolean;
  editing: boolean;
  onEdit: () => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  editInput: string;
  setEditInput: (v: string) => void;
  emptyHint: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-cos-slate-dim">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">
          {title}
        </p>
        {tags.length > 0 && (
          <span className="rounded-cos-full bg-cos-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-cos-electric">
            {tags.length}
          </span>
        )}
        {loading && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-cos-slate-dim" />
        )}
        {!loading && (
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
        )}
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

function DataChip({
  icon,
  value,
  placeholder,
}: {
  icon: React.ReactNode;
  value?: string | null;
  placeholder: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1",
        value ? "text-cos-slate" : "text-cos-slate-light"
      )}
    >
      {icon} {value || `${placeholder} not set`}
    </span>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="text-xs italic text-cos-slate-light">{text}</p>
  );
}

function CaseStudyCard({ caseStudy }: { caseStudy: CaseStudy }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = caseStudy.cosAnalysis;

  return (
    <div className="rounded-cos-lg border border-cos-border/60 bg-cos-surface-raised p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          <SourceTypeIcon sourceType={caseStudy.sourceType} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cos-slate-dim" />
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-cos-midnight leading-snug line-clamp-2">
              {caseStudy.title}
            </h4>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-cos-slate-dim">
              {analysis?.clientMentioned && (
                <>
                  <span>{analysis.clientMentioned}</span>
                  <span className="text-cos-border">|</span>
                </>
              )}
              {analysis?.industries.slice(0, 2).map((ind) => (
                <span key={ind}>{ind}</span>
              ))}
              {analysis && (
                <span className="ml-auto text-[9px] text-cos-signal">
                  {Math.round(analysis.confidence * 100)}% match
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && analysis && (
        <div className="mt-2 space-y-2 border-t border-cos-border/30 pt-2">
          <p className="text-[11px] leading-relaxed text-cos-slate-dim line-clamp-4">
            {analysis.summary}
          </p>

          {analysis.services.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Services</p>
              <div className="flex flex-wrap gap-1">
                {analysis.services.map((s) => (
                  <span key={s} className="rounded-cos-pill bg-cos-electric/8 px-2 py-0.5 text-[10px] text-cos-electric">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.skills.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Skills</p>
              <div className="flex flex-wrap gap-1">
                {analysis.skills.map((s) => (
                  <span key={s} className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.outcomes.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Outcomes</p>
              <ul className="space-y-0.5">
                {analysis.outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-1.5 text-[10px] text-cos-slate">
                    <CheckCircle2 className="mt-0.5 h-2.5 w-2.5 shrink-0 text-cos-signal" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Link back to original source */}
          <a
            href={caseStudy.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            View original
          </a>
        </div>
      )}
    </div>
  );
}

/** Icon for different case study source types */
function SourceTypeIcon({ sourceType, className }: { sourceType: string; className?: string }) {
  switch (sourceType) {
    case "google_slides":
      return <Presentation className={className} />;
    case "pdf":
      return <FileText className={className} />;
    case "google_drive":
      return <HardDrive className={className} />;
    case "website":
      return <Globe className={className} />;
    default:
      return <Link2 className={className} />;
  }
}

function ExpertCard({ expert }: { expert: Expert }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-cos-lg border border-cos-border/60 bg-cos-surface-raised p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2.5 text-left"
      >
        {/* Avatar */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cos-midnight/10 text-xs font-semibold text-cos-midnight">
          {expert.name.split(" ").map((n) => n[0]).join("")}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-cos-midnight truncate">{expert.name}</h4>
            <span
              className="shrink-0 rounded-cos-pill px-1.5 py-0.5 text-[9px] font-medium text-white"
              style={{ backgroundColor: expert.divisionColor }}
            >
              {expert.division}
            </span>
          </div>
          <p className="text-[10px] text-cos-slate-dim truncate">{expert.role}</p>
        </div>

        {/* Availability dot */}
        <div className="flex items-center gap-1 shrink-0">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            expert.availability === "Available" ? "bg-cos-signal" :
            expert.availability === "Part-time" ? "bg-yellow-400" : "bg-cos-slate-light"
          )} />
          <span className="text-[9px] text-cos-slate-dim">{expert.availability}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-cos-border/30 pt-2">
          {expert.bio && (
            <p className="text-[11px] leading-relaxed text-cos-slate-dim">{expert.bio}</p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-cos-slate-dim">
            {expert.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" /> {expert.location}
              </span>
            )}
            {expert.hourlyRate && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-2.5 w-2.5" /> ${expert.hourlyRate}/hr
              </span>
            )}
          </div>

          {expert.skills.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Skills</p>
              <div className="flex flex-wrap gap-1">
                {expert.skills.map((s) => (
                  <span key={s} className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {expert.industries.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate-dim">Industries</p>
              <div className="flex flex-wrap gap-1">
                {expert.industries.map((ind) => (
                  <span key={ind} className="rounded-cos-pill bg-cos-signal/8 px-2 py-0.5 text-[10px] text-cos-signal">
                    {ind}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Specialist Sub-Profiles */}
          {expert.specialistProfiles && expert.specialistProfiles.length > 0 && (
            <div className="border-t border-cos-border/30 pt-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cos-electric">
                Specialist Profiles ({expert.specialistProfiles.length})
              </p>
              <div className="space-y-1.5">
                {expert.specialistProfiles.map((sp) => (
                  <SpecialistProfileCard key={sp.id} profile={sp} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SpecialistProfileCard({ profile }: { profile: ExpertSpecialistProfile }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-cos-md border border-cos-electric/20 bg-cos-electric/3 p-2">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <p className="text-[11px] font-semibold text-cos-electric">{profile.title}</p>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          <p className="text-[10px] leading-relaxed text-cos-slate-dim">{profile.summary}</p>
          <div className="flex flex-wrap gap-1">
            {profile.services.map((s) => (
              <span key={s} className="rounded-cos-pill bg-cos-electric/10 px-1.5 py-0.5 text-[9px] font-medium text-cos-electric">
                {s}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {profile.skills.map((s) => (
              <span key={s} className="rounded-cos-pill bg-cos-midnight/5 px-1.5 py-0.5 text-[9px] text-cos-slate">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
