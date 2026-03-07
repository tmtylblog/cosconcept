/**
 * POST /api/enrich/case-study
 *
 * Ingest a case study from URL, PDF upload, or raw text.
 * Queues an Inngest job for background processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { extractTextFromPdf } from "@/lib/enrichment/case-study-ingestor";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // Handle multipart/form-data (PDF upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const firmId = formData.get("firmId") as string;
      const file = formData.get("file") as File | null;

      if (!firmId || !file) {
        return NextResponse.json(
          { error: "firmId and file are required" },
          { status: 400 }
        );
      }

      const buffer = await file.arrayBuffer();
      const rawText = await extractTextFromPdf(buffer);

      if (rawText.length < 50) {
        return NextResponse.json(
          { error: "Could not extract sufficient text from PDF" },
          { status: 400 }
        );
      }

      await inngest.send({
        name: "enrich/case-study-ingest",
        data: {
          firmId,
          sourceType: "pdf",
          rawText,
          filename: file.name,
        },
      });

      return NextResponse.json({
        status: "queued",
        message: `Case study from ${file.name} queued for ingestion`,
        firmId,
      });
    }

    // Handle JSON body (URL or raw text)
    const body = await req.json();
    const { firmId, url, rawText, sourceType } = body;

    if (!firmId) {
      return NextResponse.json(
        { error: "firmId is required" },
        { status: 400 }
      );
    }

    if (!url && !rawText) {
      return NextResponse.json(
        { error: "Either url or rawText is required" },
        { status: 400 }
      );
    }

    await inngest.send({
      name: "enrich/case-study-ingest",
      data: {
        firmId,
        caseStudyUrl: url,
        sourceType: sourceType ?? (url ? "url" : "text"),
        rawText,
      },
    });

    return NextResponse.json({
      status: "queued",
      message: `Case study queued for ingestion`,
      firmId,
      url,
    });
  } catch (err) {
    console.error("[CaseStudy API] Error:", err);
    return NextResponse.json(
      { error: "Failed to queue case study ingestion" },
      { status: 500 }
    );
  }
}
