import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  addManualApplication,
  EXTERNAL_DISCOVERY_SOURCES,
  MANUAL_APPLICATION_STATUSES,
} from "@/lib/applications/manual";
import { errorResponse, isSameOriginRequest, json } from "@/lib/http";

export const dynamic = "force-dynamic";

const manualApplicationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(160),
  applyUrl: z.url().refine((value) => /^https?:\/\//i.test(value), {
    message: "job URL must use http or https",
  }),
  location: z.string().trim().max(200).optional().default(""),
  country: z.enum(["US", "CA", "OTHER"]).optional(),
  applicationStatus: z.enum(MANUAL_APPLICATION_STATUSES).default("applied"),
  externalSource: z.enum(EXTERNAL_DISCOVERY_SOURCES).optional().default("other"),
  appliedDate: z.iso.date(),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("cross-origin request denied", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid JSON body", 400);
  }

  const parsed = manualApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "invalid application", 400);
  }

  try {
    const result = await addManualApplication({
      title: parsed.data.title,
      company: parsed.data.company,
      applyUrl: parsed.data.applyUrl,
      location: parsed.data.location,
      country: parsed.data.country,
      applicationStatus: parsed.data.applicationStatus,
      externalSource: parsed.data.externalSource,
      // Noon UTC avoids a date-only value rendering as the previous day in
      // North American time zones.
      appliedAt: new Date(`${parsed.data.appliedDate}T12:00:00.000Z`),
    });
    return json(
      {
        ...result,
        application: {
          ...result.application,
          appliedAt: result.application.appliedAt?.toISOString() ?? null,
          closedAt: result.application.closedAt?.toISOString() ?? null,
        },
      },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return errorResponse(error, 500);
  }
}
