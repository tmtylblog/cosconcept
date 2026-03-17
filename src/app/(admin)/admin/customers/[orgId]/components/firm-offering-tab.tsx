"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  ExternalLink,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { usePaginated, PaginationFooter } from "@/components/ui/pagination-footer";

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  sourcePageTitle: string | null;
  subServices: string[];
  isHidden: boolean;
  displayOrder: number;
  createdAt: string;
}

export function FirmOfferingTab({ orgId }: { orgId: string }) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(true);
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const [svcPage, setSvcPage] = useState(1);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchServices = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/customers/${orgId}/services`)
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const toggleHidden = async (svc: ServiceRow) => {
    setSaving(svc.id);
    try {
      await fetch(`/api/admin/customers/${orgId}/services`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: svc.id, isHidden: !svc.isHidden }),
      });
      fetchServices();
    } finally {
      setSaving(null);
    }
  };

  const saveDescription = async (svcId: string) => {
    setSaving(svcId);
    try {
      await fetch(`/api/admin/customers/${orgId}/services`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: svcId, description: descDraft }),
      });
      setEditingDesc(null);
      fetchServices();
    } finally {
      setSaving(null);
    }
  };

  const deleteService = async (svcId: string) => {
    setSaving(svcId);
    try {
      await fetch(`/api/admin/customers/${orgId}/services?id=${svcId}`, {
        method: "DELETE",
      });
      fetchServices();
    } finally {
      setSaving(null);
    }
  };

  const addService = async () => {
    if (!addName.trim()) return;
    setAdding(true);
    try {
      await fetch(`/api/admin/customers/${orgId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), description: addDesc.trim() || null }),
      });
      setAddName("");
      setAddDesc("");
      setShowAdd(false);
      fetchServices();
    } finally {
      setAdding(false);
    }
  };

  const visible = showHidden ? services : services.filter((s) => !s.isHidden);
  const hiddenCount = services.filter((s) => s.isHidden).length;
  const svcPag = usePaginated(visible, svcPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-cos-slate-light" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-cos-slate">
            {services.length} service{services.length !== 1 ? "s" : ""}
            {hiddenCount > 0 && ` (${hiddenCount} hidden)`}
          </span>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="text-[10px] text-cos-electric hover:underline"
            >
              {showHidden ? "Hide hidden" : "Show hidden"}
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 rounded-cos-md bg-cos-electric/10 px-2.5 py-1 text-xs font-medium text-cos-electric hover:bg-cos-electric/20"
        >
          <Plus className="h-3 w-3" /> Add Service
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-4 space-y-3">
          <input
            type="text"
            placeholder="Service name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-1.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={addDesc}
            onChange={(e) => setAddDesc(e.target.value)}
            className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-1.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={addService}
              disabled={adding || !addName.trim()}
              className="rounded-cos-md bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric/90 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-cos-md px-3 py-1.5 text-xs text-cos-slate hover:text-cos-midnight"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Service cards */}
      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-cos-slate-light italic">No services found</p>
      ) : (
        svcPag.pageItems.map((svc) => (
          <div
            key={svc.id}
            className={`rounded-cos-lg border p-4 ${svc.isHidden ? "border-cos-slate-light/30 bg-cos-cloud/30 opacity-60" : "border-cos-border bg-white"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cos-midnight">{svc.name}</p>
                {svc.sourcePageTitle && (
                  <p className="mt-0.5 text-[10px] text-cos-slate-light">{svc.sourcePageTitle}</p>
                )}

                {/* Description — inline edit */}
                {editingDesc === svc.id ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      className="flex-1 rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight focus:border-cos-electric focus:outline-none"
                      placeholder="Service description..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveDescription(svc.id);
                        if (e.key === "Escape") setEditingDesc(null);
                      }}
                    />
                    <button onClick={() => saveDescription(svc.id)} className="p-1 text-cos-signal hover:text-cos-signal/80">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditingDesc(null)} className="p-1 text-cos-slate-light hover:text-cos-midnight">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <p
                    className="mt-1 text-xs text-cos-slate cursor-pointer hover:text-cos-midnight group"
                    onClick={() => { setEditingDesc(svc.id); setDescDraft(svc.description ?? ""); }}
                  >
                    {svc.description || <span className="italic text-cos-slate-light">No description — click to add</span>}
                    <Pencil className="ml-1 inline h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                  </p>
                )}

                {svc.sourceUrl && (
                  <a href={svc.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] text-cos-electric hover:underline">
                    <ExternalLink className="h-2.5 w-2.5" /> Source
                  </a>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {saving === svc.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cos-slate-light" />
                ) : (
                  <>
                    <button
                      onClick={() => toggleHidden(svc)}
                      className="p-1 rounded-cos-md text-cos-slate-light hover:text-cos-midnight"
                      title={svc.isHidden ? "Unhide" : "Hide"}
                    >
                      {svc.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteService(svc.id)}
                      className="p-1 rounded-cos-md text-cos-slate-light hover:text-cos-ember"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))
      )}
      <PaginationFooter page={svcPag.safePage} totalPages={svcPag.totalPages} total={svcPag.total} onPageChange={setSvcPage} />
    </div>
  );
}
