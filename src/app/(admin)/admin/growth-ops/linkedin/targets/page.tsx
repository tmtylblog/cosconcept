"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LinkedInTargetsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/growth-ops/linkedin/campaigns");
  }, [router]);
  return null;
}
