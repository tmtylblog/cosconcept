/**
 * Call Coaching Analyzer
 *
 * Analyzes call transcripts to provide coaching insights:
 * - Talking time ratio
 * - Value prop clarity
 * - Question quality
 * - Key topics covered
 * - Next steps established
 * - Action items extracted
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod/v4";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export interface CallCoachingAnalysis {
  talkingTimeRatio: {
    userPercent: number;
    otherPercent: number;
    assessment: string;
  };
  valueProposition: {
    clarity: number; // 0-1
    mentioned: boolean;
    feedback: string;
  };
  questionQuality: {
    discoveryQuestions: number;
    closedQuestions: number;
    score: number; // 0-1
    feedback: string;
  };
  topicsCovered: string[];
  nextSteps: {
    established: boolean;
    items: string[];
  };
  actionItems: {
    description: string;
    assignee: string;
    deadline?: string;
  }[];
  overallScore: number; // 0-100
  topRecommendation: string;
  partnerRecommendations: string[];
}

/**
 * Analyze a call transcript for coaching insights.
 */
export async function analyzeCall(
  transcript: string,
  context?: { firmName?: string; callType?: string }
): Promise<CallCoachingAnalysis> {
  const result = await generateObject({
    model: openrouter.chat("google/gemini-2.0-flash-001"),
    prompt: `Analyze this call transcript and provide coaching feedback for a professional services firm.

## TRANSCRIPT
${transcript.slice(0, 10000)}

## CONTEXT
${context?.firmName ? `Firm: ${context.firmName}` : ""}
${context?.callType ? `Call type: ${context.callType}` : ""}

## INSTRUCTIONS
Analyze the following dimensions:

1. **Talking Time**: Estimate % of time the caller vs. the other party spoke. Ideal is 40-60% caller.
2. **Value Proposition**: Did they clearly explain what they do and why it matters? Rate 0-1.
3. **Question Quality**: Count discovery questions (open-ended, probing) vs closed questions. More discovery = better.
4. **Topics Covered**: List the main topics discussed.
5. **Next Steps**: Were clear next steps established? What were they?
6. **Action Items**: Extract specific commitments ("I'll send you...", "We need to...").
7. **Partner Recommendations**: Based on topics discussed, what types of partners could help?

Be specific and actionable in feedback.`,
    schema: z.object({
      talkingTimeRatio: z.object({
        userPercent: z.number(),
        otherPercent: z.number(),
        assessment: z.string(),
      }),
      valueProposition: z.object({
        clarity: z.number(),
        mentioned: z.boolean(),
        feedback: z.string(),
      }),
      questionQuality: z.object({
        discoveryQuestions: z.number(),
        closedQuestions: z.number(),
        score: z.number(),
        feedback: z.string(),
      }),
      topicsCovered: z.array(z.string()),
      nextSteps: z.object({
        established: z.boolean(),
        items: z.array(z.string()),
      }),
      actionItems: z.array(
        z.object({
          description: z.string(),
          assignee: z.string(),
          deadline: z.string().optional(),
        })
      ),
      overallScore: z.number().describe("Overall call quality score 0-100"),
      topRecommendation: z.string().describe("The single most important thing to improve"),
      partnerRecommendations: z.array(z.string()).describe("Types of partners that could help based on call topics"),
    }),
    maxOutputTokens: 1536,
  });

  return result.object;
}
