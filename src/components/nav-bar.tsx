"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Search,
  Building2,
  Users,
  Handshake,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  LogIn,
  ArrowLeftRight,
  ChevronDown,
  Briefcase,
  FileText,
  Sparkles,
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { cn } from "@/lib/utils";
import { signOut, useActiveOrganization } from "@/lib/auth-client";
import { emitCosSignal, HREF_TO_PAGE_MODE } from "@/lib/cos-signal";

interface NavChild {
  label: string;
  href: string;
  icon?: LucideIcon;
}

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  children?: NavChild[];
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
  { icon: Search, label: "Discover", href: "/discover" },
  {
    icon: Building2,
    label: "My Firm",
    href: "/firm",
    children: [
      { label: "Overview", href: "/firm" },
      { label: "Offering", href: "/firm/offering", icon: Briefcase },
      { label: "Experts", href: "/firm/experts", icon: Users },
      { label: "Experience", href: "/firm/experience", icon: FileText },
      { label: "Preferences", href: "/firm/preferences", icon: Handshake },
    ],
  },
  { icon: Users, label: "Network", href: "/network" },
  {
    icon: Handshake,
    label: "Partnerships",
    href: "/partnerships",
    children: [
      { label: "My Partnerships", href: "/partnerships" },
      { label: "Find Partners", href: "/partner-matching", icon: Sparkles },
    ],
  },
  { icon: Settings, label: "Settings", href: "/settings" },
];

interface NavBarProps {
  collapsed: boolean;
  onToggle: () => void;
  isGuest?: boolean;
  onRequestLogin?: () => void;
  /** Hide the Overview item (used post-onboarding since its content lives elsewhere) */
  hideOverview?: boolean;
}

export function NavBar({
  collapsed,
  onToggle,
  isGuest,
  onRequestLogin,
  hideOverview,
}: NavBarProps) {
  const pathname = usePathname();
  const { data: activeOrg } = useActiveOrganization();
  const [hovering, setHovering] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(["/firm"]));

  const showLabels = !collapsed || hovering;

  const { plan } = usePlan();
  const isFree = plan === "free";

  // In guest mode, only show Overview and a sign-in prompt.
  // Post-onboarding, hide Overview since its content lives in other sections.
  const baseItems = isGuest
    ? navItems.filter((item) => item.href === "/dashboard")
    : hideOverview
      ? navItems.filter((item) => item.href !== "/dashboard")
      : navItems;

  // Add "Upgrade" link after Settings if user is on free plan
  const visibleItems = isFree && !isGuest
    ? [...baseItems, { icon: Sparkles, label: "Upgrade", href: "/settings/billing" } as NavItem]
    : baseItems;

  const toggleMenu = (href: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  const isItemActive = (item: NavItem) => {
    if (item.children) {
      return pathname === item.href || pathname.startsWith(item.href + "/");
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  const isChildActive = (child: NavChild) => {
    // Exact match for /firm (Overview), prefix match for others
    if (child.href === "/firm") {
      return pathname === "/firm";
    }
    return pathname === child.href || pathname.startsWith(child.href + "/");
  };

  // Auto-expand menus when a child is active
  const isMenuExpanded = (item: NavItem) => {
    if (!item.children) return false;
    if (expandedMenus.has(item.href)) return true;
    // Auto-expand if any child route is active
    return item.children.some((child) => isChildActive(child));
  };

  return (
    <aside
      onMouseEnter={() => collapsed && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn(
        "flex flex-col bg-cos-midnight transition-all duration-300 ease-in-out",
        showLabels ? "w-56" : "w-16"
      )}
    >
      {/* Logo + Org */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-cos-lg">
          <Image
            src="/logo.png"
            alt="Collective OS"
            width={36}
            height={36}
            className="h-9 w-9 object-cover"
          />
        </div>
        {showLabels && (
          <div className="min-w-0 flex-1">
            <span className="block truncate font-heading text-sm font-semibold text-white">
              {activeOrg?.name ?? "Collective OS"}
            </span>
            {activeOrg && !isGuest && (
              <Link
                href="/org/select"
                className="flex items-center gap-1 text-[10px] text-white/50 hover:text-cos-signal"
              >
                <ArrowLeftRight className="h-2.5 w-2.5" />
                Switch org
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {visibleItems.map((item) => {
          const isActive = isItemActive(item);
          const hasChildren = !!item.children;
          const menuExpanded = isMenuExpanded(item);

          return (
            <div key={item.href}>
              {/* Parent item */}
              <div className="flex items-center">
                <Link
                  href={item.href}
                  onClick={() => {
                    const pageMode = HREF_TO_PAGE_MODE[item.href];
                    if (pageMode) emitCosSignal({ kind: "nav", page: pageMode });
                  }}
                  className={cn(
                    "flex flex-1 items-center gap-3 rounded-cos-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    item.label === "Upgrade"
                      ? "text-cos-electric hover:bg-cos-electric/15 hover:text-cos-electric"
                      : isActive
                        ? "bg-white/15 text-white"
                        : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                  title={collapsed && !hovering ? item.label : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {showLabels && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                </Link>
                {/* Expand/collapse chevron for items with children */}
                {hasChildren && showLabels && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      toggleMenu(item.href);
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cos-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        menuExpanded && "rotate-180"
                      )}
                    />
                  </button>
                )}
              </div>

              {/* Children sub-menu */}
              {hasChildren && menuExpanded && showLabels && (
                <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                  {item.children!.map((child) => {
                    const childActive = isChildActive(child);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => {
                          const pageMode = HREF_TO_PAGE_MODE[child.href];
                          if (pageMode) emitCosSignal({ kind: "nav", page: pageMode });
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-cos-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                          childActive
                            ? "bg-white/10 text-white"
                            : "text-white/40 hover:bg-white/5 hover:text-white/70"
                        )}
                      >
                        {/* Small dot indicator */}
                        <div
                          className={cn(
                            "h-1 w-1 shrink-0 rounded-full",
                            childActive ? "bg-cos-electric" : "bg-white/20"
                          )}
                        />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Guest sign-in prompt */}
        {isGuest && showLabels && (
          <div className="mt-6 rounded-cos-lg bg-white/10 px-3 py-3">
            <p className="text-xs text-white/70">
              Sign in to unlock all features
            </p>
            <button
              onClick={onRequestLogin}
              className="mt-2 w-full rounded-cos-pill bg-cos-electric px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cos-electric-hover"
            >
              Sign In
            </button>
          </div>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 rounded-cos-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          {collapsed ? (
            <ChevronsRight className="h-5 w-5 shrink-0" />
          ) : (
            <ChevronsLeft className="h-5 w-5 shrink-0" />
          )}
          {showLabels && <span className="truncate">Collapse</span>}
        </button>
        {isGuest ? (
          <button
            onClick={onRequestLogin}
            className="flex w-full items-center gap-3 rounded-cos-lg px-3 py-2.5 text-sm font-medium text-cos-electric transition-colors hover:bg-cos-electric/10"
          >
            <LogIn className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">Sign In</span>}
          </button>
        ) : (
          <button
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = "/login";
                  },
                },
              })
            }
            className="flex w-full items-center gap-3 rounded-cos-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">Sign Out</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
