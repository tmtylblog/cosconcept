"use client";

import { DiscoverStream } from "@/components/discover/discover-stream";
import { DiscoverStreamProvider } from "@/hooks/use-discover-stream";

export default function DiscoverPage() {
  return (
    <DiscoverStreamProvider>
      <DiscoverStream />
    </DiscoverStreamProvider>
  );
}
