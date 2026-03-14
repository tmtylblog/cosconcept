"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";

// ── Predefined Tags ──────────────────────────────────────────────────────────

const PREDEFINED_TAGS = [
  { value: "needs follow up", color: "bg-amber-100 text-amber-700" },
  { value: "long term", color: "bg-blue-100 text-blue-700" },
  { value: "unresponsive", color: "bg-gray-100 text-gray-600" },
  { value: "hot lead", color: "bg-red-100 text-red-700" },
  { value: "referred", color: "bg-green-100 text-green-700" },
  { value: "cold", color: "bg-slate-100 text-slate-600" },
] as const;

function getTagColor(tag: string): string {
  const found = PREDEFINED_TAGS.find((t) => t.value === tag);
  return found?.color ?? "bg-cos-cloud text-cos-slate-dim";
}

// ── Component ────────────────────────────────────────────────────────────────

interface TagEditorProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onTagsChange }: TagEditorProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showDropdown]);

  function removeTag(tag: string) {
    onTagsChange(tags.filter((t) => t !== tag));
  }

  function addTag(tag: string) {
    if (!tags.includes(tag)) {
      onTagsChange([...tags, tag]);
    }
    setShowDropdown(false);
  }

  const availableTags = PREDEFINED_TAGS.filter(
    (t) => !tags.includes(t.value),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${getTagColor(tag)}`}
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="hover:opacity-70 transition-opacity"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      {/* Add tag button */}
      {availableTags.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-cos-border text-cos-slate hover:border-cos-electric hover:text-cos-electric transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>

          {showDropdown && (
            <div className="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded-cos-lg border border-cos-border bg-white shadow-lg py-1">
              {availableTags.map((t) => (
                <button
                  key={t.value}
                  onClick={() => addTag(t.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-cos-cloud transition-colors"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${t.color.split(" ")[0]}`}
                  />
                  <span className="text-cos-midnight">{t.value}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
