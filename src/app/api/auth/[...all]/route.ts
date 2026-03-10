import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Force dynamic — auth routes must not be prerendered at build time
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
