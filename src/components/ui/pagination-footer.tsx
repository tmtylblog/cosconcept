"use client";

import { useMemo } from "react";

const PAGE_SIZE = 100;

/**
 * Client-side pagination helper.
 * Returns the current page slice + total pages for a given array.
 */
export function usePaginated<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    return { pageItems, totalPages, total: items.length, safePage };
  }, [items, page, pageSize]);
}

/**
 * Pagination footer UI. Only renders when there are multiple pages.
 */
export function PaginationFooter({
  page,
  totalPages,
  total,
  pageSize = PAGE_SIZE,
  onPageChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-cos-slate">
        Showing {start}&ndash;{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          className="rounded-cos-md border border-cos-border bg-white px-2.5 py-1 text-xs font-medium text-cos-midnight hover:bg-cos-cloud disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="px-2 text-xs text-cos-slate">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className="rounded-cos-md border border-cos-border bg-white px-2.5 py-1 text-xs font-medium text-cos-midnight hover:bg-cos-cloud disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
