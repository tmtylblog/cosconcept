"use client";

import { cn } from "@/lib/utils";

export type StatusVariant =
  | "success"
  | "warning"
  | "error"
  | "neutral"
  | "info";

const VARIANT_STYLES: Record<
  StatusVariant,
  { bg: string; text: string; dot: string }
> = {
  success: {
    bg: "bg-cos-signal/8",
    text: "text-cos-signal",
    dot: "bg-cos-signal",
  },
  warning: {
    bg: "bg-cos-warm/8",
    text: "text-cos-warm",
    dot: "bg-cos-warm",
  },
  error: {
    bg: "bg-cos-ember/8",
    text: "text-cos-ember",
    dot: "bg-cos-ember",
  },
  neutral: {
    bg: "bg-cos-slate/8",
    text: "text-cos-slate",
    dot: "bg-cos-slate",
  },
  info: {
    bg: "bg-cos-electric/8",
    text: "text-cos-electric",
    dot: "bg-cos-electric",
  },
};

interface StatusBadgeProps {
  label: string;
  variant?: StatusVariant;
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({
  label,
  variant = "neutral",
  showDot = true,
  className,
}: StatusBadgeProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-cos-pill px-2.5 py-1 text-xs font-medium",
        style.bg,
        style.text,
        className
      )}
    >
      {showDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      )}
      {label}
    </span>
  );
}

/** Map common status strings to variants */
export function statusToVariant(status: string): StatusVariant {
  switch (status.toLowerCase()) {
    case "accepted":
    case "active":
    case "ok":
    case "ready":
    case "completed":
    case "sent":
    case "approved":
    case "converted":
    case "expert":
    case "matched":
    case "intro_sent":
    case "won":
      return "success";
    case "requested":
    case "pending":
    case "connecting":
    case "paused":
    case "ambiguous":
    case "potential":
    case "negotiation":
    case "in_progress":
      return "warning";
    case "declined":
    case "error":
    case "failed":
    case "rejected":
    case "cancelled":
    case "lost":
    case "past_due":
    case "unpaid":
      return "error";
    case "suggested":
    case "inactive":
    case "draft":
    case "internal":
    case "not_expert":
    case "canceled":
      return "neutral";
    case "new":
    case "open":
    case "pro":
    case "enterprise":
    case "trialing":
      return "info";
    default:
      return "neutral";
  }
}
