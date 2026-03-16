"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutocompleteInputProps {
  label: string;
  placeholder?: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Returns matching suggestions for the query */
  fetchSuggestions: (query: string) => Promise<string[]>;
  /** Min chars before showing broader/fuzzy suggestions (default 1) */
  minCharsForResults?: number;
  maxItems?: number;
  /** Color theme for selected pills */
  color?: "signal" | "electric" | "midnight";
}

const COLOR_STYLES = {
  signal: "bg-cos-signal/8 text-cos-signal",
  electric: "bg-cos-electric/8 text-cos-electric",
  midnight: "bg-cos-midnight/5 text-cos-slate",
};

export function AutocompleteInput({
  label,
  placeholder,
  values,
  onChange,
  fetchSuggestions,
  minCharsForResults = 1,
  maxItems,
  color = "midnight",
}: AutocompleteInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIdx(-1);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.length < minCharsForResults) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const suggestions = await fetchSuggestions(value);
          // Filter out already-selected values
          const filtered = suggestions.filter((s) => !values.includes(s));
          setResults(filtered);
          setIsOpen(filtered.length > 0);
        } catch {
          setResults([]);
          setIsOpen(false);
        } finally {
          setLoading(false);
        }
      }, 150);
    },
    [fetchSuggestions, values, minCharsForResults]
  );

  const handleSelect = useCallback(
    (value: string) => {
      if (maxItems && values.length >= maxItems) return;
      if (!values.includes(value)) {
        onChange([...values, value]);
      }
      setQuery("");
      setResults([]);
      setIsOpen(false);
      inputRef.current?.focus();
    },
    [values, onChange, maxItems]
  );

  const handleRemove = useCallback(
    (value: string) => {
      onChange(values.filter((v) => v !== value));
    },
    [values, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && results[selectedIdx]) {
        handleSelect(results[selectedIdx]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "Backspace" && !query && values.length > 0) {
      handleRemove(values[values.length - 1]);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const atLimit = maxItems !== undefined && values.length >= maxItems;
  const pillStyle = COLOR_STYLES[color];

  return (
    <div ref={containerRef} className="relative">
      <p className="mb-1.5 text-[11px] font-medium text-cos-midnight">{label}</p>

      {/* Selected tags */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map((tag) => (
            <span
              key={tag}
              className={cn(
                "flex items-center gap-1 rounded-cos-pill px-2 py-0.5 text-[10px] font-medium",
                pillStyle
              )}
            >
              {tag}
              <button
                onClick={() => handleRemove(tag)}
                className="rounded-full p-0.5 hover:bg-black/10"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input with search */}
      {!atLimit && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-cos-slate-light" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= minCharsForResults && results.length > 0 && setIsOpen(true)}
            placeholder={placeholder ?? `Search ${label.toLowerCase()}...`}
            className="w-full rounded-cos-md border border-cos-border bg-white pl-7 pr-7 py-1 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-cos-electric" />
          )}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-cos-lg border border-cos-border bg-white shadow-lg">
          {results.map((item, idx) => (
            <button
              key={item}
              onClick={() => handleSelect(item)}
              className={cn(
                "flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors",
                idx === selectedIdx
                  ? "bg-cos-electric/10 text-cos-midnight"
                  : "text-cos-midnight hover:bg-cos-cloud/50"
              )}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
