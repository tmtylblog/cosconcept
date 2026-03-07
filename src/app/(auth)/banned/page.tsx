"use client";

import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export default function BannedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cos-cloud">
      <div className="w-full max-w-sm space-y-6 rounded-cos-xl border border-cos-border bg-cos-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg
            className="h-8 w-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-bold text-cos-midnight">
            Account Suspended
          </h1>
          <p className="mt-2 text-sm text-cos-slate">
            Your account has been suspended. If you believe this is a mistake,
            please contact support at{" "}
            <a
              href="mailto:support@joincollectiveos.com"
              className="text-cos-electric hover:underline"
            >
              support@joincollectiveos.com
            </a>
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}
