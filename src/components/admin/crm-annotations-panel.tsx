"use client";

import { useState, useEffect, useCallback } from "react";
import {
  StickyNote,
  Tag,
  Calendar,
  Save,
  Loader2,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Annotation {
  id: string;
  tags: string[];
  notes: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
}

interface CrmAnnotationsPanelProps {
  entityType: "company" | "person";
  entityId: string;
}

export default function CrmAnnotationsPanel({ entityType, entityId }: CrmAnnotationsPanelProps) {
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [lastContacted, setLastContacted] = useState("");
  const [dirty, setDirty] = useState(false);

  const fetchAnnotation = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/growth-ops/crm/annotations?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.annotation) {
        setAnnotation(data.annotation);
        setNotes(data.annotation.notes || "");
        setTags(data.annotation.tags || []);
        setNextFollowUp(data.annotation.nextFollowUpAt ? data.annotation.nextFollowUpAt.split("T")[0] : "");
        setLastContacted(data.annotation.lastContactedAt ? data.annotation.lastContactedAt.split("T")[0] : "");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchAnnotation();
  }, [fetchAnnotation]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/growth-ops/crm/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
          notes: notes || null,
          tags,
          nextFollowUpAt: nextFollowUp || null,
          lastContactedAt: lastContacted || null,
        }),
      });
      if (res.ok) {
        setDirty(false);
        await fetchAnnotation();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setDirty(true);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
    setDirty(true);
  }

  if (loading) {
    return (
      <div className="text-xs text-cos-slate-light flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading notes...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Notes */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <StickyNote className="h-3.5 w-3.5 text-cos-slate" />
          <span className="text-xs font-medium text-cos-slate-dim">Notes</span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
          placeholder="Add sales notes..."
          rows={3}
          className="w-full rounded-cos-md border border-cos-border bg-white px-3 py-2 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:outline-none focus:ring-2 focus:ring-cos-electric/30 resize-none"
        />
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Tag className="h-3.5 w-3.5 text-cos-slate" />
          <span className="text-xs font-medium text-cos-slate-dim">Tags</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-cos-electric/10 text-cos-electric px-2 py-0.5 text-xs"
            >
              {t}
              <button onClick={() => removeTag(t)} className="hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag..."
            className="flex-1 rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
          />
          <Button variant="ghost" size="sm" onClick={addTag} className="h-7 w-7 p-0">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="h-3.5 w-3.5 text-cos-slate" />
            <span className="text-xs font-medium text-cos-slate-dim">Last Contacted</span>
          </div>
          <input
            type="date"
            value={lastContacted}
            onChange={(e) => { setLastContacted(e.target.value); setDirty(true); }}
            className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
          />
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium text-cos-slate-dim">Next Follow-up</span>
          </div>
          <input
            type="date"
            value={nextFollowUp}
            onChange={(e) => { setNextFollowUp(e.target.value); setDirty(true); }}
            className="w-full rounded-cos-md border border-cos-border bg-white px-2 py-1 text-xs text-cos-midnight focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
          />
        </div>
      </div>

      {/* Save */}
      {dirty && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-cos-electric hover:bg-cos-electric/90 text-white"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          {saving ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  );
}
