"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut, useActiveOrganization } from "@/lib/auth-client";

const navItems = [
  { icon: MessageCircle, label: "Ossy", href: "/dashboard" },
  { icon: Search, label: "Discover", href: "/discover" },
  { icon: Building2, label: "My Firm", href: "/firm" },
  { icon: Users, label: "Network", href: "/network" },
  { icon: Handshake, label: "Partnerships", href: "/partnerships" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

interface NavBarProps {
  collapsed: boolean;
  onToggle: () => void;
  isGuest?: boolean;
  onRequestLogin?: () => void;
}

export function NavBar({ collapsed, onToggle, isGuest, onRequestLogin }: NavBarProps) {
  const pathname = usePathname();
  const { data: activeOrg } = useActiveOrganization();
  const [hovering, setHovering] = useState(false);

  const showLabels = !collapsed || hovering;

  // In guest mode, only show Ossy and a sign-in prompt
  const visibleItems = isGuest
    ? navItems.filter((item) => item.href === "/dashboard")
    : navItems;

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
      <nav className="flex-1 space-y-1 px-2 py-4">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed && !hovering ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-cos-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {showLabels && (
                <span className="truncate">{item.label}</span>
              )}
            </Link>
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
