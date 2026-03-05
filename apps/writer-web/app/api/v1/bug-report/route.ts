import { LinearClient } from "@linear/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type BugReportPayload = {
  title: string;
  description: string;
  priority: number;
  pageUrl: string;
  userAgent: string;
};

function getLinearClient(): LinearClient | null {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new LinearClient({ apiKey });
}

function getTeamId(): string | null {
  return process.env.LINEAR_TEAM_ID ?? null;
}

function validate(body: unknown): body is BugReportPayload {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const record = body as Record<string, unknown>;
  return (
    typeof record.title === "string" &&
    record.title.trim().length > 0 &&
    typeof record.description === "string" &&
    typeof record.priority === "number" &&
    [0, 1, 2, 3, 4].includes(record.priority) &&
    typeof record.pageUrl === "string" &&
    typeof record.userAgent === "string"
  );
}

function buildDescription(payload: BugReportPayload): string {
  const sections = [payload.description];

  sections.push("");
  sections.push("---");
  sections.push(`**Page:** ${payload.pageUrl}`);
  sections.push(`**User-Agent:** ${payload.userAgent}`);
  sections.push(`**Submitted:** ${new Date().toISOString()}`);

  return sections.join("\n");
}

export async function POST(request: Request): Promise<NextResponse> {
  const client = getLinearClient();
  if (!client) {
    return NextResponse.json(
      { error: "bug_reporting_not_configured", detail: "LINEAR_API_KEY is not set." },
      { status: 503 }
    );
  }

  const teamId = getTeamId();
  if (!teamId) {
    return NextResponse.json(
      { error: "bug_reporting_not_configured", detail: "LINEAR_TEAM_ID is not set." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", detail: "Request body is not valid JSON." },
      { status: 400 }
    );
  }

  if (!validate(body)) {
    return NextResponse.json(
      {
        error: "validation_error",
        detail: "Body must include title (non-empty string), description (string), priority (0-4), pageUrl (string), and userAgent (string)."
      },
      { status: 400 }
    );
  }

  try {
    const issuePayload = await client.createIssue({
      title: `[Bug] ${body.title}`,
      description: buildDescription(body),
      teamId,
      priority: body.priority
    });

    if (!issuePayload.success) {
      return NextResponse.json(
        { error: "linear_create_failed", detail: "Linear rejected the issue creation." },
        { status: 502 }
      );
    }

    const issue = await issuePayload.issue;

    return NextResponse.json({
      success: true,
      issueId: issue?.identifier ?? null,
      issueUrl: issue?.url ?? null
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "linear_api_error",
        detail: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 502 }
    );
  }
}
