"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface MonthYearPickerProps {
  value: string; // "YYYY-MM" or ""
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MonthYearPicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
}: MonthYearPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const currentYear = value ? parseInt(value.split("-")[0]) : new Date().getFullYear();
  const currentMonth = value ? parseInt(value.split("-")[1]) - 1 : -1;
  const [viewYear, setViewYear] = useState(currentYear);

  // Display text
  const displayText = value
    ? `${MONTHS[currentMonth]} ${currentYear}`
    : "";

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

  const handleSelect = (monthIdx: number) => {
    const mm = String(monthIdx + 1).padStart(2, "0");
    onChange(`${viewYear}-${mm}`);
    setIsOpen(false);
  };

  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-2 rounded-cos-md border border-cos-border bg-cos-cloud/30 px-2.5 py-1.5 text-xs text-left transition-colors",
          disabled ? "opacity-40 cursor-not-allowed" : "hover:border-cos-electric/40",
          displayText ? "text-cos-midnight" : "text-cos-slate-light"
        )}
      >
        <Calendar className="h-3 w-3 shrink-0 text-cos-slate-light" />
        <span className="flex-1">{displayText || placeholder}</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-cos-lg border border-cos-border bg-white p-3 shadow-lg">
          {/* Year nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              className="rounded p-0.5 text-cos-slate hover:bg-cos-cloud hover:text-cos-midnight transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-cos-midnight">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.min(y + 1, thisYear))}
              disabled={viewYear >= thisYear}
              className="rounded p-0.5 text-cos-slate hover:bg-cos-cloud hover:text-cos-midnight transition-colors disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((month, idx) => {
              const isFuture = viewYear > thisYear || (viewYear === thisYear && idx > thisMonth);
              const isSelected = viewYear === currentYear && idx === currentMonth;

              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => !isFuture && handleSelect(idx)}
                  disabled={isFuture}
                  className={cn(
                    "rounded-cos-md px-1 py-1.5 text-[10px] font-medium transition-colors",
                    isSelected
                      ? "bg-cos-electric text-white"
                      : isFuture
                        ? "text-cos-slate-light/40 cursor-not-allowed"
                        : "text-cos-midnight hover:bg-cos-electric/10"
                  )}
                >
                  {month}
                </button>
              );
            })}
          </div>

          {/* Clear */}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setIsOpen(false); }}
              className="mt-2 w-full rounded-cos-md py-1 text-[10px] text-cos-slate-dim hover:text-cos-ember transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
