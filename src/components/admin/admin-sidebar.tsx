"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, ChevronDown, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_SECTIONS, ADMIN_TOP_LINKS } from "./sidebar-config";

const LS_COLLAPSED_KEY = "cos-admin-sidebar-collapsed";
const LS_SECTIONS_KEY = "cos-admin-sections";

interface AdminSidebarProps {
  permissions: string[];
  userName?: string;
}

export default function AdminSidebar({ permissions }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sectionState, setSectionState] = useState<Record<string, boolean>>({});

  // Read localStorage on mount
  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem(LS_COLLAPSED_KEY);
      if (savedCollapsed === "true") setCollapsed(true);
      const savedSections = localStorage.getItem(LS_SECTIONS_KEY);
      if (savedSections) setSectionState(JSON.parse(savedSections));
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  // Persist collapse state
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Persist section state
  const toggleSection = useCallback((key: string) => {
    setSectionState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(LS_SECTIONS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Filter sections by permissions
  const visibleSections = ADMIN_NAV_SECTIONS.filter((s) => permissions.includes(s.key));
  const visibleTopLinks = ADMIN_TOP_LINKS.filter((l) => permissions.includes(l.permissionKey));

  // Check if a link is active
  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  // Auto-expand section if it contains the active link
  function isSectionExpanded(key: string): boolean {
    // If user explicitly collapsed it, respect that
    if (sectionState[key] === true) return false;
    // Otherwise default to expanded
    return true;
  }

  // Prevent flash — hide until localStorage is read
  if (!mounted) {
    return (
      <aside className="w-60 shrink-0 border-r border-cos-border bg-cos-surface flex flex-col" />
    );
  }

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-cos-border bg-cos-surface flex flex-col transition-all duration-200 overflow-hidden",
        collapsed ? "w-12" : "w-60"
      )}
    >
      {/* Brand header */}
      <div className={cn("pt-5 pb-3", collapsed ? "px-2" : "px-5")}>
        <Link href="/admin" className="flex items-center gap-2.5">
          <Image
            src="/cos-logo.png"
            alt="Collective OS"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-cos-lg"
          />
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-heading text-sm font-bold text-cos-midnight tracking-tight whitespace-nowrap">
                COS Admin
              </p>
              <p className="text-[10px] text-cos-slate-light font-medium whitespace-nowrap">
                Collective OS
              </p>
            </div>
          )}
        </Link>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-cos-border to-transparent" />

      {/* Navigation */}
      <nav className={cn("flex-1 pt-3 space-y-0.5 overflow-y-auto", collapsed ? "px-1" : "px-3")}>
        {/* Top-level links */}
        {visibleTopLinks.map((link) => {
          const active = isActive(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-cos-md px-3 py-2 text-sm transition-all duration-200",
                collapsed && "justify-center px-0",
                active
                  ? "bg-cos-electric/10 text-cos-electric font-semibold shadow-sm"
                  : "text-cos-slate-dim hover:bg-cos-electric/5 hover:text-cos-electric"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-cos-electric" : "text-cos-slate group-hover:text-cos-electric")} />
              {!collapsed && <span className="font-medium whitespace-nowrap">{link.label}</span>}
            </Link>
          );
        })}

        {/* Sections */}
        {visibleSections.map((section) => {
          const expanded = isSectionExpanded(section.key);
          const SectionIcon = section.icon;
          const hasActiveChild = section.items.some((item) => isActive(item.href));

          return (
            <div key={section.key} className="mt-3">
              {/* Section header */}
              {collapsed ? (
                // Collapsed: show section icon only
                <div
                  title={section.label}
                  className={cn(
                    "flex items-center justify-center rounded-cos-md py-2 cursor-pointer transition-colors",
                    hasActiveChild ? "text-cos-electric" : "text-cos-slate hover:text-cos-electric"
                  )}
                  onClick={toggleCollapsed}
                >
                  <SectionIcon className="h-4 w-4" />
                </div>
              ) : (
                // Expanded: clickable section header
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between px-3 mb-1 group"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-cos-slate-light group-hover:text-cos-slate">
                    {section.label}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-cos-slate-light transition-transform",
                      !expanded && "-rotate-90"
                    )}
                  />
                </button>
              )}

              {/* Section items (expanded sidebar only) */}
              {!collapsed && expanded && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-cos-md px-3 py-2 text-sm transition-all duration-200 overflow-hidden",
                          active
                            ? "bg-cos-electric/10 text-cos-electric font-semibold"
                            : item.accent
                              ? "text-cos-electric font-semibold hover:bg-cos-electric/10"
                              : "text-cos-slate-dim hover:bg-cos-electric/5 hover:text-cos-electric"
                        )}
                      >
                        {active && <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-cos-electric" />}
                        <Icon className={cn(
                          "h-4 w-4 shrink-0 transition-all duration-200",
                          active || item.accent ? "text-cos-electric" : "text-cos-slate group-hover:text-cos-electric group-hover:scale-110"
                        )} />
                        <span className="font-medium whitespace-nowrap">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="h-px bg-gradient-to-r from-transparent via-cos-border to-transparent" />

      {/* Footer */}
      <div className={cn("py-3", collapsed ? "px-1" : "px-5")}>
        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "flex items-center gap-2 rounded-cos-md py-2 text-xs text-cos-slate transition-colors hover:text-cos-electric w-full",
            collapsed ? "justify-center px-0" : "px-0"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              <span className="font-medium">Collapse</span>
            </>
          )}
        </button>

        {/* Back to app */}
        {!collapsed && (
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 mt-1 py-2 text-xs text-cos-slate transition-colors hover:text-cos-electric"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to App
          </Link>
        )}

        {collapsed && (
          <Link
            href="/dashboard"
            title="Back to App"
            className="flex items-center justify-center py-2 text-cos-slate hover:text-cos-electric transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        )}

        {!collapsed && (
          <div className="flex justify-end mt-1">
            <span className="text-[10px] text-cos-slate/40 select-none">v0.1</span>
          </div>
        )}
      </div>
    </aside>
  );
}
