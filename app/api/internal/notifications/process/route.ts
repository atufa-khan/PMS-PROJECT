import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/config/env";
import { isInternalJobAuthorized } from "@/lib/workflows/job-auth";
import { runNotificationProcessor } from "@/lib/workflows/notification-runtime";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Unauthorized. Provide the internal job secret."
    },
    { status: 401 }
  );
}

async function handleRequest(request: NextRequest) {
  if (!env.INTERNAL_JOB_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_JOB_SECRET is not configured."
      },
      { status: 503 }
    );
  }

  const authorized = isInternalJobAuthorized({
    expectedSecret: env.INTERNAL_JOB_SECRET,
    headerSecret: request.headers.get("x-pms-job-secret"),
    authorizationHeader: request.headers.get("authorization"),
    querySecret: request.nextUrl.searchParams.get("secret")
  });

  if (!authorized) {
    return unauthorizedResponse();
  }

  try {
    const result = await runNotificationProcessor({
      actorProfileId: null,
      trigger: "internal_api"
    });

    return NextResponse.json({
      ok: true,
      trigger: "internal_api",
      processedAt: new Date().toISOString(),
      result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to process notifications."
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
