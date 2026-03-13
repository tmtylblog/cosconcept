/**
 * POST /api/firm/case-studies/upload-token
 *
 * Generates a Vercel Blob client-side upload token for PDF uploads.
 *
 * Flow:
 * 1. Client calls this endpoint to get a short-lived client token.
 * 2. Client uploads the PDF directly to Vercel Blob (bypasses the 4.5MB API body limit).
 * 3. Client sends the resulting blob URL as fileStorageKey to POST /api/firm/case-studies.
 * 4. Inngest job downloads from Blob, extracts text, runs the full pipeline.
 *
 * Setup:
 *   - Enable Vercel Blob in Vercel dashboard → Storage → Create Blob store.
 *   - Set BLOB_READ_WRITE_TOKEN env var (Vercel injects this automatically).
 *   - Install: npm install @vercel/blob
 */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth guard
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Enforce PDF-only uploads server-side
        const lower = pathname.toLowerCase();
        if (!lower.endsWith(".pdf")) {
          throw new Error(
            "Only PDF files are supported. Export your file to PDF (File → Save As → PDF) then try again."
          );
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Optional: log or trigger processing here
        console.log("[BlobUpload] PDF uploaded successfully:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("[BlobUpload] handleUpload error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
