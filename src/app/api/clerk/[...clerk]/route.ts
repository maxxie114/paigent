import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: { clerk?: string[] } | Promise<{ clerk?: string[] }>;
};

const CLERK_BASE_URL = resolveClerkBaseUrl();

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: createCorsHeaders(req),
  });
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return proxyWithContext(req, context);
}

export async function HEAD(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return proxyWithContext(req, context);
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return proxyWithContext(req, context);
}

export async function PUT(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return proxyWithContext(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return proxyWithContext(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return proxyWithContext(req, context);
}

async function proxyWithContext(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const params = await context.params;
  const segments = params?.clerk ?? [];
  return proxyRequest(req, segments);
}

function resolveClerkBaseUrl(): string {
  const directUrl = process.env.CLERK_API_URL ?? process.env.NEXT_PUBLIC_CLERK_API_URL;
  if (directUrl) {
    return stripTrailingSlash(ensureHttps(directUrl));
  }

  const frontendApi =
    process.env.CLERK_FRONTEND_API ?? process.env.NEXT_PUBLIC_CLERK_FRONTEND_API;
  if (frontendApi) {
    return stripTrailingSlash(ensureHttps(frontendApi));
  }

  const publishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const derived = deriveDomainFromPublishableKey(publishableKey);
  if (derived) {
    return stripTrailingSlash(ensureHttps(derived));
  }

  throw new Error(
    "Unable to determine Clerk base URL. Set CLERK_API_URL or NEXT_PUBLIC_CLERK_FRONTEND_API."
  );
}

function deriveDomainFromPublishableKey(key: string | undefined | null): string | null {
  if (!key) {
    return null;
  }

  const parts = key.split("_");
  const candidate = parts.at(-1);
  if (!candidate) {
    return null;
  }

  try {
    const decoded = Buffer.from(candidate, "base64").toString("utf8");
    const sanitized = decoded.replace(/[$\"\s]/g, "");
    return sanitized || null;
  } catch {
    return null;
  }
}

function ensureHttps(input: string): string {
  if (input.startsWith("https://")) {
    return input;
  }
  if (input.startsWith("http://")) {
    return `https://${input.slice(7)}`;
  }
  return `https://${input}`;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function createCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? req.nextUrl.origin;
  const requestHeaders =
    req.headers.get("access-control-request-headers") ?? "authorization,content-type";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function proxyRequest(
  req: NextRequest,
  segments: string[] = []
): Promise<NextResponse> {
  const targetUrl = buildClerkUrl(req, segments);

  const headers = filterRequestHeaders(req.headers);
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (requestHasBody(req.method)) {
    init.body = req.body;
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, init);
  } catch {
    return NextResponse.json(
      { error: "Failed to contact Clerk API" },
      {
        status: 502,
        headers: createCorsHeaders(req),
      }
    );
  }

  const outgoingHeaders = mergeHeaders(response.headers, createCorsHeaders(req));

  return new NextResponse(response.body, {
    status: response.status,
    headers: outgoingHeaders,
  });
}

function buildClerkUrl(req: NextRequest, segments: string[]): string {
  const path = segments.length ? `/${segments.join("/")}` : "";
  return `${CLERK_BASE_URL}${path}${req.nextUrl.search}`;
}

function requestHasBody(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function filterRequestHeaders(source: Headers): Headers {
  const headers = new Headers();

  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (["connection", "content-length", "host", "origin", "referer", "accept-encoding"].includes(lower)) {
      return;
    }
    headers.set(key, value);
  });

  headers.set("User-Agent", source.get("user-agent") ?? "paigent-clerk-proxy");

  // Ensure downstream attribution by setting Origin/Referer to Clerk base domain.
  headers.set("Origin", CLERK_BASE_URL);
  headers.set("Referer", CLERK_BASE_URL);

  return headers;
}

function mergeHeaders(existing: Headers, additions: Record<string, string>): Headers {
  const merged = new Headers(existing);

  Object.entries(additions).forEach(([key, value]) => {
    if (key.toLowerCase() === "vary") {
      const current = merged.get("Vary");
      if (current) {
        const values = new Set(
          `${current},${value}`
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        );
        merged.set("Vary", Array.from(values).join(", "));
      } else {
        merged.set("Vary", value);
      }
      return;
    }

    merged.set(key, value);
  });

  return merged;
}
