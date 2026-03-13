"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export const ADMIN_PAGE_SIZE = 100;

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize = ADMIN_PAGE_SIZE,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
      <span className="text-xs text-cos-slate">
        Showing {start}&ndash;{end} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-xs text-cos-slate">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
