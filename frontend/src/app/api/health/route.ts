export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const baseUrl = (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:8020"
  ).replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    const data = await res.json();
    return Response.json({ frontend: "healthy", backend: data }, { status: res.status });
  } catch {
    return Response.json(
      { frontend: "healthy", backend: { status: "unreachable" } },
      { status: 200 },
    );
  }
}
