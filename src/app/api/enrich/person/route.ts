import { NextResponse } from "next/server";
import { enrichPerson } from "@/lib/enrichment/pdl";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/enrich/person
 *
 * Enriches an individual using PDL — pulls job history, skills, education.
 * Used when an expert is added to the platform.
 *
 * Accepts: name + company, LinkedIn URL, or email.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      companyName?: string;
      companyWebsite?: string;
      linkedinUrl?: string;
      email?: string;
    };

    if (!body.name && !body.linkedinUrl && !body.email) {
      return NextResponse.json(
        { error: "At least name, linkedinUrl, or email is required" },
        { status: 400 }
      );
    }

    console.log(
      `[Enrich] Person enrichment: ${body.name || body.linkedinUrl || body.email}`
    );

    const person = await enrichPerson(body);

    if (!person) {
      return NextResponse.json(
        { error: "No match found for this person" },
        { status: 404 }
      );
    }

    console.log(
      `[Enrich] Person found: ${person.fullName}, ` +
        `${person.experience.length} jobs, ${person.skills.length} skills`
    );

    return NextResponse.json({
      person: {
        fullName: person.fullName,
        headline: person.headline,
        industry: person.industry,
        currentTitle: person.jobTitle,
        currentCompany: person.jobCompanyName,
        location: person.location?.name,
        linkedinUrl: person.linkedinUrl,
        skills: person.skills,
        experience: person.experience.map((exp) => ({
          company: exp.company.name,
          companyWebsite: exp.company.website,
          title: exp.title,
          startDate: exp.startDate,
          endDate: exp.endDate,
          isCurrent: exp.isCurrent,
          industry: exp.company.industry,
        })),
        education: person.education.map((edu) => ({
          school: edu.school.name,
          degrees: edu.degrees,
          majors: edu.majors,
        })),
      },
      likelihood: person.likelihood,
    });
  } catch (error) {
    console.error("[Enrich] Person enrichment error:", error);
    return NextResponse.json(
      { error: "Failed to enrich person data" },
      { status: 500 }
    );
  }
}
