"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { NavBar } from "@/components/nav-bar";
import { ChatPanel } from "@/components/chat-panel";
import { SlidePanel } from "@/components/slide-panel";
import { LoginPanel } from "@/components/login-panel";
import { useSession } from "@/lib/auth-client";
import { ChevronLeft, Compass, Building2, Users, Handshake } from "lucide-react";

/**
 * Routes that open in the slide panel.
 * /dashboard keeps the panel closed (chat-only mode).
 */
const PANEL_ROUTES: Record<string, { title: string; width?: string }> = {
  "/discover": { title: "Discover", width: "w-[520px]" },
  "/firm": { title: "My Firm", width: "w-[520px]" },
  "/network": { title: "Network", width: "w-[520px]" },
  "/partnerships": { title: "Partnerships", width: "w-[520px]" },
  "/settings": { title: "Settings", width: "w-[520px]" },
};

function getPanelConfig(pathname: string) {
  for (const [route, config] of Object.entries(PANEL_ROUTES)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return config;
    }
  }
  return null;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isGuest = !session?.user;

  const [navCollapsed, setNavCollapsed] = useState(true);
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);

  const panelConfig = useMemo(() => getPanelConfig(pathname), [pathname]);
  const panelOpen = panelConfig !== null;

  const [manualClose, setManualClose] = useState(false);

  useEffect(() => {
    setManualClose(false);
  }, [pathname]);

  const showPanel = panelOpen && !manualClose && !isGuest;

  const handleRequestLogin = () => {
    setLoginPanelOpen(true);
  };

  const handleLoginSuccess = () => {
    window.location.reload();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
      {/* Left: Collapsible navigation */}
      <NavBar
        collapsed={navCollapsed}
        onToggle={() => setNavCollapsed(!navCollapsed)}
        isGuest={isGuest}
        onRequestLogin={handleRequestLogin}
      />

      {/* Center: Ossy chat — main stage */}
      <main className="flex min-w-0 flex-1 flex-col bg-cos-cloud/60">
        <ChatPanel
          isGuest={isGuest}
          onRequestLogin={handleRequestLogin}
        />
      </main>

      {/* Right: Hint bar — shows when no panel is open */}
      {!showPanel && !loginPanelOpen && !isGuest && (
        <aside className="flex w-12 shrink-0 flex-col items-center border-l border-cos-border/30 bg-cos-midnight/95 py-4">
          <div className="flex flex-col items-center gap-3">
            <RightBarIcon href="/discover" icon={<Compass className="h-4 w-4" />} label="Discover" />
            <RightBarIcon href="/firm" icon={<Building2 className="h-4 w-4" />} label="Firm" />
            <RightBarIcon href="/network" icon={<Users className="h-4 w-4" />} label="Network" />
            <RightBarIcon href="/partnerships" icon={<Handshake className="h-4 w-4" />} label="Partners" />
          </div>
          <div className="mt-auto">
            <ChevronLeft className="h-4 w-4 text-white/30" />
          </div>
        </aside>
      )}

      {/* Right: Login panel (guest) or module panel (authenticated) */}
      {loginPanelOpen && (
        <SlidePanel
          open={true}
          onClose={() => setLoginPanelOpen(false)}
          title="Welcome to Collective OS"
          width="w-[440px]"
        >
          <LoginPanel onSuccess={handleLoginSuccess} />
        </SlidePanel>
      )}

      {showPanel && !loginPanelOpen && (
        <SlidePanel
          open={showPanel}
          onClose={() => setManualClose(true)}
          title={panelConfig?.title}
          width={panelConfig?.width}
        >
          {children}
        </SlidePanel>
      )}
    </div>
  );
}

function RightBarIcon({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-cos-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
    >
      {icon}
    </a>
  );
}
