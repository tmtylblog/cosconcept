"use client";

import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  iconColor?: string;
  iconBg?: string;
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}

export function StatCard({
  icon,
  iconColor = "text-cos-electric",
  iconBg = "bg-cos-electric/10",
  label,
  value,
  sub,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-cos-xl border border-cos-border bg-cos-surface p-5 transition-shadow hover:shadow-sm",
        className
      )}
    >
      <div
        className={cn(
          "mb-3 inline-flex h-9 w-9 items-center justify-center rounded-cos-lg",
          iconBg,
          iconColor
        )}
      >
        {icon}
      </div>
      <p className="text-xs font-medium uppercase tracking-wider text-cos-slate">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight text-cos-midnight">
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-cos-slate-light">{sub}</p>
      )}
    </div>
  );
}
