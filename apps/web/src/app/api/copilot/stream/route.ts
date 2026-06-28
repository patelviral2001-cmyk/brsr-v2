/**
 * Server-side SSE relay. The browser cannot attach custom headers to an
 * EventSource, so we proxy `text/event-stream` from the backend through
 * this route after extracting the NextAuth session and forwarding the
 * bearer token. In demo mode we synthesize a fake stream so the UI
 * keeps working offline.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080/api/v1";

function buildBackendUrl(conversationId?: string): string {
  if (process.env.NEXT_PUBLIC_COPILOT_SSE_URL) {
    return process.env.NEXT_PUBLIC_COPILOT_SSE_URL;
  }
  if (conversationId) {
    return `${API_URL}/copilot/conversations/${conversationId}/messages`;
  }
  return `${API_URL}/copilot/stream`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const session = await auth();
  const token = session?.accessToken;
  const upstreamUrl = buildBackendUrl(body?.conversationId);

  if (DEMO_MODE) {
    return synthesized();
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!upstream.ok || !upstream.body) throw new Error("Upstream unavailable");
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return synthesized();
  }
}

function synthesized(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const text =
        "I'm running in offline-demo mode. Connect a backend to enable live Copilot.";
      for (const ch of text.split("")) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "token", data: ch })}\n\n`),
        );
        await new Promise((r) => setTimeout(r, 12));
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "done", data: "" })}\n\n`),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
