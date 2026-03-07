"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export function SlidePanel({
  open,
  onClose,
  title,
  children,
  width = "w-[420px]",
}: SlidePanelProps) {
  return (
    <>
      {/* Backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-cos-surface-overlay lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full flex-col border-l border-cos-border bg-cos-surface shadow-lg transition-transform duration-300 ease-in-out lg:relative lg:z-auto lg:shadow-none",
          width,
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex h-16 items-center justify-between border-b border-cos-border px-6">
            <h2 className="font-heading text-base font-semibold text-cos-midnight">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-cos-full text-cos-slate-dim transition-colors hover:bg-cos-cloud-dim hover:text-cos-midnight"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="cos-scrollbar flex-1 overflow-y-auto">
          {children}
        </div>
      </aside>
    </>
  );
}
