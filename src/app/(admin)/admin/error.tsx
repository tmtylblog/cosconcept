"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12">
      <h2 className="font-heading text-xl font-bold text-cos-midnight">
        Something went wrong
      </h2>
      <p className="text-sm text-cos-slate">
        {error.message || "An unexpected error occurred in the admin panel."}
      </p>
      <button
        onClick={reset}
        className="rounded-cos-md bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover"
      >
        Try Again
      </button>
    </div>
  );
}
