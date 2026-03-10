"use client";

import {
  Briefcase,
  Loader2,
  CheckCircle2,
  Globe,
} from "lucide-react";
import { useEnrichment } from "@/hooks/use-enrichment";
import { useFirmEdits } from "@/hooks/use-firm-edits";
import { EditableTagSection, EmptyHint } from "@/components/firm/shared";

export default function FirmOfferingPage() {
  const { status, result } = useEnrichment();
  const extracted = result?.extracted;

  const {
    edits,
    editingSection,
    setEditingSection,
    editInput,
    setEditInput,
    addTag,
    removeTag,
  } = useFirmEdits(status === "done" && !!result, {
    services: extracted?.services,
  });

  const services = edits.services ?? extracted?.services ?? [];

  return (
    <div className="cos-scrollbar mx-auto max-w-3xl space-y-4 overflow-y-auto p-6">
      {/* Page header */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Services & Solutions
        </h2>
        <p className="mt-1 text-xs text-cos-slate-dim">
          Your service offerings detected from your website. Click edit to add, remove, or refine.
        </p>
      </div>

      {/* Status banner */}
      {status === "loading" && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
          <p className="text-sm font-medium text-cos-electric">
            Scanning your website for services...
          </p>
        </div>
      )}

      {status === "done" && services.length > 0 && (
        <div className="flex items-center gap-2 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-cos-signal" />
          <p className="text-sm font-medium text-cos-signal">
            {services.length} services detected from your website
          </p>
        </div>
      )}

      {/* Source indicator */}
      {result?.domain && (
        <div className="flex items-center gap-2 rounded-cos-lg border border-cos-border/50 bg-white/60 px-3 py-2">
          <Globe className="h-3.5 w-3.5 text-cos-slate-dim" />
          <p className="text-[11px] text-cos-slate-dim">
            Sourced from <span className="font-medium text-cos-midnight">{result.domain}</span>
          </p>
        </div>
      )}

      {/* Services & Solutions — main editable section */}
      <EditableTagSection
        icon={<Briefcase className="h-4 w-4" />}
        title="Services & Solutions"
        tags={services}
        field="services"
        tagStyle="rounded-cos-pill bg-cos-midnight/5 px-2.5 py-1 text-xs text-cos-slate"
        loading={status === "loading"}
        editing={editingSection === "services"}
        onEdit={() => setEditingSection(editingSection === "services" ? null : "services")}
        onAdd={(v) => addTag("services", v)}
        onRemove={(v) => removeTag("services", v)}
        editInput={editInput}
        setEditInput={setEditInput}
        emptyHint="No services detected yet. Add your key service offerings."
      />

      {/* Future: deeper service detail cards will go here */}
      {services.length === 0 && status !== "loading" && (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-cos-surface/50 px-6 py-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-slate">
            No services found yet
          </p>
          <p className="mt-1 text-xs text-cos-slate-dim">
            Tell Ossy about your services, or click edit above to add them manually.
          </p>
        </div>
      )}
    </div>
  );
}
