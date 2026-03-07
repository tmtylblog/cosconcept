"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  Users,
  User,
  Bell,
  Shield,
  ChevronRight,
} from "lucide-react";
import { useActiveOrganization } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const settingSections = [
  {
    icon: User,
    label: "Profile",
    description: "Your personal account details",
    href: "/settings/profile",
  },
  {
    icon: Users,
    label: "Team",
    description: "Manage members and roles",
    href: "/settings/team",
  },
  {
    icon: CreditCard,
    label: "Billing & Plans",
    description: "Subscription, invoices, and usage",
    href: "/settings/billing",
  },
  {
    icon: Bell,
    label: "Notifications",
    description: "Email and in-app notification preferences",
    href: "/settings/notifications",
  },
  {
    icon: Shield,
    label: "Security",
    description: "Password, two-factor, and API keys",
    href: "/settings/security",
  },
];

export default function SettingsPage() {
  const pathname = usePathname();
  const { data: activeOrg } = useActiveOrganization();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Settings
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Manage your account and organization
          {activeOrg?.name ? ` (${activeOrg.name})` : ""}.
        </p>
      </div>

      <div className="space-y-1">
        {settingSections.map((section) => {
          const isActive = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                "flex items-center gap-3 rounded-cos-xl px-4 py-3 transition-colors",
                isActive
                  ? "bg-cos-electric/10 text-cos-electric"
                  : "text-cos-midnight hover:bg-cos-cloud-dim"
              )}
            >
              <section.icon className="h-5 w-5 shrink-0 text-cos-slate" />
              <div className="flex-1">
                <p className="text-sm font-medium">{section.label}</p>
                <p className="text-xs text-cos-slate">{section.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-cos-slate-light" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
