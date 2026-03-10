"use client";

import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Pencil,
  X,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Utility ─────────────────────────────────────────────

/** Normalize a preference value to a string array (handles string | string[] | undefined) */
export function asArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "string" && val) return [val];
  return [];
}

// ─── ProfileSection ──────────────────────────────────────

export function ProfileSection({
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

// ─── EditableTagSection ──────────────────────────────────

export function EditableTagSection({
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

// ─── PreferenceTagSection ────────────────────────────────

/** Read-only tag display for partner preferences */
export function PreferenceTagSection({
  icon,
  title,
  tags,
  tagStyle,
  emptyHint,
}: {
  icon: React.ReactNode;
  title: string;
  tags: string[];
  tagStyle: string;
  emptyHint: string;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-cos-slate-dim">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">{title}</p>
        <span className="rounded-cos-full bg-cos-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-cos-electric">
          {tags.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className={tagStyle}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

// ─── PreferenceSingleSection ─────────────────────────────

/** Read-only single value display for partner preferences */
export function PreferenceSingleSection({
  icon,
  title,
  value,
  emptyHint,
}: {
  icon: React.ReactNode;
  title: string;
  value?: string;
  emptyHint: string;
}) {
  if (!value) return null;
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-cos-slate-dim">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-cos-midnight">{title}</p>
      </div>
      <p className="text-sm font-medium text-cos-midnight">{value}</p>
    </div>
  );
}

// ─── DataChip ────────────────────────────────────────────

export function DataChip({
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

// ─── EmptyHint ───────────────────────────────────────────

export function EmptyHint({ text }: { text: string }) {
  return (
    <p className="text-xs italic text-cos-slate-light">{text}</p>
  );
}
