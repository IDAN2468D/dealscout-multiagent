import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBackendBaseUrl(): string {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:8020"
  ).replace(/\/$/, "");
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const targetPath = path.join("/");
  const search = request.nextUrl.search || "";
  const targetUrl = `${getBackendBaseUrl()}/api/v1/${targetPath}${search}`;

  const forwardHeaders = new Headers();
  const headerAllowlist = [
    "authorization",
    "cookie",
    "content-type",
    "accept",
    "x-requested-with",
  ];
  for (const key of headerAllowlist) {
    const val = request.headers.get(key);
    if (val) {
      forwardHeaders.set(key, val);
    }
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: bodyBuffer,
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    // Preserve Set-Cookie headers cleanly (refresh token HttpOnly cookie)
    const getSetCookie = (upstream.headers as unknown as { getSetCookie?: () => string[] })
      .getSetCookie;
    if (typeof getSetCookie === "function") {
      for (const sc of getSetCookie.call(upstream.headers)) {
        responseHeaders.append("set-cookie", sc);
      }
    } else {
      const sc = upstream.headers.get("set-cookie");
      if (sc) responseHeaders.set("set-cookie", sc);
    }

    const location = upstream.headers.get("location");
    if (location) {
      responseHeaders.set("location", location);
    }

    if (contentType && contentType.includes("text/event-stream")) {
      responseHeaders.set("cache-control", "no-cache, no-transform");
      responseHeaders.set("connection", "keep-alive");
      responseHeaders.set("x-accel-buffering", "no");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return Response.json(
      {
        detail: "Backend service unreachable from Next.js proxy",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
