"use client";

import { useState } from "react";
import {
  Briefcase,
  Loader2,
  CheckCircle2,
  Globe,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useFirmServices, type FirmService } from "@/hooks/use-firm-services";

export default function FirmOfferingPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { status: enrichmentStatus, result: enrichmentResult } = useEnrichment();
  const {
    services,
    total,
    hiddenCount,
    isLoading,
    toggleHidden,
    updateDescription,
    addService,
    deleteService,
  } = useFirmServices(activeOrg?.id);

  const [showHidden, setShowHidden] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setAdding(true);
    await addService(addName.trim(), addDescription.trim() || undefined);
    setAddName("");
    setAddDescription("");
    setAdding(false);
    setShowAddForm(false);
  }

  // Split visible / hidden
  const visibleServices = services.filter((s) => !s.isHidden);
  const hiddenServices = services.filter((s) => s.isHidden);

  // Fallback: if no firmServices yet but enrichment has string labels, show those
  const enrichmentServices = enrichmentResult?.extracted?.services ?? [];
  const hasFirmServices = total > 0;
  const isDeepCrawlPending = !hasFirmServices && enrichmentStatus === "done" && enrichmentServices.length > 0;

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Services & Solutions
          </h2>
          <p className="mt-1 text-xs text-cos-slate-dim">
            {hasFirmServices
              ? `Auto-discovered from ${enrichmentResult?.domain ?? "your website"}. Edit descriptions or hide services that aren't relevant.`
              : "Your service offerings will be populated automatically from your website."}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex shrink-0 items-center gap-1.5 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 px-3 py-1.5 text-xs font-semibold text-cos-electric transition-colors hover:bg-cos-electric/10"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Service
        </button>
      </div>

      {/* Add service form */}
      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 p-4 space-y-3"
        >
          <p className="text-xs font-semibold text-cos-electric">New Service</p>
          <input
            type="text"
            required
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Service name (e.g. Brand Strategy)"
            className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
            autoFocus
          />
          <textarea
            value={addDescription}
            onChange={(e) => setAddDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={adding || !addName.trim()}
              className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cos-electric/90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Add Service
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddName(""); setAddDescription(""); }}
              className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud-dim"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </form>
      )}

      {/* Loading states */}
      {(isLoading || enrichmentStatus === "loading") && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
          <p className="text-sm font-medium text-cos-electric">
            Scanning your website for services...
          </p>
        </div>
      )}

      {/* Deep crawl pending — show enrichment string labels as fallback */}
      {isDeepCrawlPending && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-cos-xl border border-cos-warm/20 bg-cos-warm/5 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-cos-warm" />
            <p className="text-sm font-medium text-cos-warm">
              Deep analysis in progress... {enrichmentServices.length} services detected so far
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {enrichmentServices.map((svc: string) => (
              <span
                key={svc}
                className="rounded-cos-pill bg-cos-midnight/5 px-2.5 py-1 text-xs text-cos-slate"
              >
                {svc}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Success banner */}
      {hasFirmServices && !isLoading && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-cos-signal" />
          <p className="text-sm font-medium text-cos-signal">
            {visibleServices.length} services auto-discovered
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
          </p>
        </div>
      )}

      {/* Source indicator */}
      {enrichmentResult?.domain && hasFirmServices && (
        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-border/50 bg-white/60 px-3 py-2">
          <Globe className="h-3.5 w-3.5 text-cos-slate-dim" />
          <p className="text-[11px] text-cos-slate-dim">
            Sourced from{" "}
            <span className="font-medium text-cos-midnight">{enrichmentResult.domain}</span>
          </p>
        </div>
      )}

      {/* Service cards */}
      {visibleServices.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          onToggleHidden={toggleHidden}
          onUpdateDescription={updateDescription}
          onDelete={deleteService}
        />
      ))}

      {/* Hidden services section */}
      {hiddenServices.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="flex items-center gap-2 text-xs font-medium text-cos-slate-dim transition-colors hover:text-cos-midnight"
          >
            {showHidden ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {hiddenServices.length} hidden service{hiddenServices.length === 1 ? "" : "s"}
          </button>

          {showHidden && (
            <div className="space-y-3 opacity-60">
              {hiddenServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onToggleHidden={toggleHidden}
                  onUpdateDescription={updateDescription}
                  onDelete={deleteService}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasFirmServices && !isDeepCrawlPending && !isLoading && enrichmentStatus !== "loading" && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 px-6 py-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-slate">
            No services found yet
          </p>
          <p className="mt-1 text-xs text-cos-slate-dim">
            Services will be auto-discovered from your website after onboarding completes.
            You can also ask Ossy to add services manually.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Service Card Component ──────────────────────────────

function ServiceCard({
  service,
  onToggleHidden,
  onUpdateDescription,
  onDelete,
}: {
  service: FirmService;
  onToggleHidden: (id: string) => Promise<void>;
  onUpdateDescription: (id: string, description: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(service.description ?? "");

  const handleSave = async () => {
    await onUpdateDescription(service.id, editValue.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(service.description ?? "");
    setIsEditing(false);
  };

  return (
    <div className={`rounded-cos-xl border bg-cos-surface-raised transition-all ${
      service.isHidden
        ? "border-cos-border/30"
        : "border-cos-border/60 hover:border-cos-electric/20"
    }`}>
      <div className="p-4">
        {/* Header: name + actions */}
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-md bg-cos-midnight/5">
            <Briefcase className="h-4 w-4 text-cos-midnight" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-cos-midnight">{service.name}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Edit button */}
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex h-7 w-7 items-center justify-center rounded-cos-md text-cos-slate-light transition-colors hover:bg-cos-cloud-dim hover:text-cos-midnight"
                title="Edit description"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Hide toggle (auto-discovered only) */}
            {service.sourceUrl !== null && (
              <button
                onClick={() => onToggleHidden(service.id)}
                className={`flex h-7 w-7 items-center justify-center rounded-cos-md transition-colors ${
                  service.isHidden
                    ? "text-cos-warm hover:bg-cos-warm/10"
                    : "text-cos-slate-light hover:bg-cos-cloud-dim hover:text-cos-midnight"
                }`}
                title={service.isHidden ? "Show service" : "Hide service"}
              >
                {service.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
            {/* Delete (manual services only) */}
            {service.sourceUrl === null && (
              <button
                onClick={() => onDelete(service.id)}
                className="flex h-7 w-7 items-center justify-center rounded-cos-md text-cos-slate-light transition-colors hover:bg-cos-ember/10 hover:text-cos-ember"
                title="Delete service"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Description — editable */}
        {isEditing ? (
          <div className="mt-2 ml-12">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
              rows={3}
              placeholder="Describe this service..."
              autoFocus
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                onClick={handleSave}
                className="flex items-center gap-1 rounded-cos-md bg-cos-electric px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-cos-electric/90"
              >
                <Check className="h-3 w-3" /> Save
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 rounded-cos-md border border-cos-border px-2.5 py-1 text-[10px] font-medium text-cos-slate transition-colors hover:bg-cos-cloud-dim"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        ) : service.description ? (
          <p className="mt-1.5 ml-12 text-xs leading-relaxed text-cos-slate">
            {service.description}
          </p>
        ) : null}

        {/* Sub-services tags */}
        {service.subServices && service.subServices.length > 0 && (
          <div className="mt-2 ml-12">
            <p className="mb-1 text-[10px] font-medium text-cos-slate-dim">
              Specific capabilities:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {service.subServices.map((sub) => (
                <span
                  key={sub}
                  className="rounded-cos-pill bg-cos-midnight/5 px-2 py-0.5 text-[10px] text-cos-slate"
                >
                  {sub}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Source link */}
        {service.sourceUrl && (
          <a
            href={service.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 ml-12 flex items-center gap-1 text-[10px] text-cos-electric transition-colors hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            More info →{" "}
            <span className="max-w-[200px] truncate">
              {service.sourcePageTitle || service.sourceUrl.replace(/^https?:\/\//, "")}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
