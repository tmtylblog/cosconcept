"use client";

// ── Avatar & AccountBadge ────────────────────────────────────────────────────
// Shared avatar helpers extracted from the LinkedIn inbox page.

// Tailwind JIT can't generate dynamic class names like `h-${size}`.
// Use inline styles for dimensions instead.
export function Avatar({
  src,
  name,
  size = 32,
  className: extraClass = "",
}: {
  src?: string | null;
  name?: string | null;
  /** Size in pixels (default 32) */
  size?: number;
  className?: string;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const fontSize = size <= 24 ? 9 : size <= 32 ? 11 : 13;
  if (src) {
    return (
      <div
        className={`rounded-full shrink-0 overflow-hidden ${extraClass}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name ?? ""} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`rounded-full shrink-0 overflow-hidden flex items-center justify-center font-semibold bg-cos-electric/15 text-cos-electric ${extraClass}`}
      style={{ width: size, height: size, fontSize }}
    >
      {initials}
    </div>
  );
}

/** Small colored dot/initials badge for identifying which account a conversation belongs to */
export function AccountBadge({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      className="inline-flex h-4 items-center rounded-full bg-cos-midnight/8 px-1.5 text-[9px] font-semibold text-cos-slate-dim leading-none"
    >
      {initials}
    </span>
  );
}
