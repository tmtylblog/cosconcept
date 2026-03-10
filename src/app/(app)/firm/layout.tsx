"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Briefcase,
  Users,
  FileText,
  Handshake,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FirmSectionProvider, type FirmSection } from "@/hooks/use-firm-section";

const tabs = [
  { label: "Overview", href: "/firm", icon: Building2, section: "overview" as FirmSection },
  { label: "Offering", href: "/firm/offering", icon: Briefcase, section: "offering" as FirmSection },
  { label: "Experts", href: "/firm/experts", icon: Users, section: "experts" as FirmSection },
  { label: "Experience", href: "/firm/experience", icon: FileText, section: "experience" as FirmSection },
  { label: "Preferences", href: "/firm/preferences", icon: Handshake, section: "preferences" as FirmSection },
];

export default function FirmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Determine active section from pathname
  const activeSection: FirmSection =
    pathname === "/firm" ? "overview"
    : pathname === "/firm/offering" ? "offering"
    : pathname === "/firm/experts" ? "experts"
    : pathname === "/firm/experience" ? "experience"
    : pathname === "/firm/preferences" ? "preferences"
    : pathname.startsWith("/firm/case-studies") ? "experience"
    : "overview";

  return (
    <FirmSectionProvider value={activeSection}>
      <div className="flex h-full flex-col">
        {/* Horizontal tab nav */}
        <div className="shrink-0 border-b border-cos-border/50 bg-white/60 backdrop-blur-sm">
          <nav className="mx-auto flex max-w-3xl items-center gap-1 px-6 pt-4">
            {tabs.map((tab) => {
              const isActive = tab.section === activeSection;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-t-cos-lg px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "border-b-2 border-cos-electric bg-cos-electric/5 text-cos-electric"
                      : "text-cos-slate-dim hover:bg-cos-cloud-dim hover:text-cos-midnight"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </FirmSectionProvider>
  );
}
