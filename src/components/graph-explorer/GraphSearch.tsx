"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { NODE_COLORS, NODE_LABELS } from "@/lib/graph/colors";
import type { SearchResult } from "@/lib/graph/types";

interface GraphSearchProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelect: (nodeId: string) => void;
}

export default function GraphSearch({ onSearch, onSelect }: GraphSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIdx(-1);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        const res = await onSearch(value);
        setResults(res);
        setIsOpen(res.length > 0);
        setLoading(false);
      }, 250);
    },
    [onSearch]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleSelect = (result: SearchResult) => {
    onSelect(result.id);
    setQuery(result.name);
    setIsOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate-light" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search nodes..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          className="w-full rounded-cos-lg border border-cos-border bg-white py-2 pl-9 pr-8 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-cos-slate-light hover:text-cos-midnight"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {loading && (
          <div className="absolute right-8 top-1/2 -translate-y-1/2">
            <div className="h-3 w-3 animate-spin rounded-full border border-cos-electric border-t-transparent" />
          </div>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-cos-lg border border-cos-border bg-white shadow-lg">
          {results.map((result, idx) => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                idx === selectedIdx
                  ? "bg-cos-electric/10 text-cos-midnight"
                  : "text-cos-midnight hover:bg-cos-cloud/50"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: NODE_COLORS[result.type] ?? "#9b9590",
                }}
              />
              <span className="min-w-0 flex-1 truncate">{result.name}</span>
              <span className="shrink-0 text-[10px] font-medium uppercase text-cos-slate-light">
                {NODE_LABELS[result.type] ?? result.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
