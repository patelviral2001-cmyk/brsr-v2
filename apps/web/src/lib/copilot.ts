/**
 * Copilot streaming client. The browser cannot attach an Authorization
 * header to a real EventSource, so we POST through the Next API route
 * `/api/copilot/stream`, which forwards the session token to the backend
 * SSE endpoint and proxies the event-stream back to us.
 *
 * In DEMO_MODE the route synthesizes a fake response; we additionally
 * fall back to a built-in canned response if the fetch fails for any
 * reason, so the UI never gets stuck.
 */

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export interface CopilotStreamEvent {
  type: "token" | "citation" | "done" | "error";
  data: string;
  meta?: Record<string, unknown>;
}

export interface CopilotStreamOpts {
  prompt: string;
  conversationId?: string;
  mode?: "ANALYST" | "WRITER" | "EXPLAINER" | "BENCHMARKER";
  onEvent: (ev: CopilotStreamEvent) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

const RELAY_URL = "/api/copilot/stream";

export async function streamCopilot(opts: CopilotStreamOpts): Promise<void> {
  try {
    const res = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        prompt: opts.prompt,
        conversationId: opts.conversationId,
        mode: opts.mode ?? "ANALYST",
      }),
      signal: opts.signal,
    });

    if (!res.ok || !res.body) throw new Error(`Copilot HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const parsed = JSON.parse(line.slice(5).trim()) as CopilotStreamEvent;
          opts.onEvent(parsed);
          if (parsed.type === "done") {
            opts.onDone?.();
            return;
          }
        } catch {
          // skip malformed event
        }
      }
    }
    opts.onDone?.();
  } catch (err) {
    // Network or parse failure → synthesize on the client. In real prod
    // this is the last-ditch fallback (the relay already has its own).
    if (DEMO_MODE) {
      await simulateStream(opts);
      return;
    }
    opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    opts.onEvent({ type: "error", data: err instanceof Error ? err.message : "Stream failed" });
    opts.onDone?.();
  }
}

async function simulateStream(opts: CopilotStreamOpts) {
  const response = generateDemoResponse(opts.prompt, opts.mode ?? "ANALYST");
  const tokens = response.text.split(/(\s+)/);
  for (const tok of tokens) {
    if (opts.signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 18));
    opts.onEvent({ type: "token", data: tok });
  }
  for (const c of response.citations) {
    opts.onEvent({
      type: "citation",
      data: c.label,
      meta: { id: c.id, type: c.type, ref: c.ref },
    });
  }
  opts.onEvent({ type: "done", data: "" });
  opts.onDone?.();
}

function generateDemoResponse(
  prompt: string,
  mode: string,
): {
  text: string;
  citations: { id: string; type: string; ref: string; label: string }[];
} {
  const lower = prompt.toLowerCase();

  if (lower.includes("scope 3") || lower.includes("category 1")) {
    return {
      text:
        "Scope 3 Category 1 covers emissions from purchased goods and services — typically your largest Scope 3 bucket. " +
        "For Imagine Powertree Group, Cat 1 was 487,200 tCO2e in FY24-25, dominated by GreenSteel Pvt (62%) and AcmeSemiconductors (18%). " +
        "Methodology mix: 71% spend-based using EXIOBASE multipliers, 23% supplier-specific (verified PCFs), and 6% average-data. " +
        "Recommended next step: extend supplier-specific coverage to your top 10 vendors to compress estimation uncertainty by ~40%.",
      citations: [
        { id: "calc_s3_c1", type: "calc_run", ref: "S3-C1-FY24-25", label: "Scope 3 Cat 1 calc run" },
        { id: "sup_greensteel", type: "supplier", ref: "GreenSteel Pvt Ltd", label: "GreenSteel scorecard" },
        { id: "ghg_protocol", type: "framework", ref: "GHG Protocol Scope 3", label: "GHG Protocol Scope 3 Standard" },
      ],
    };
  }
  if (lower.includes("energy") && (lower.includes("up") || lower.includes("why"))) {
    return {
      text:
        "Energy consumption is up 18% QoQ, but this is largely volume-driven, not efficiency-driven. " +
        "Production output rose 22% in the same quarter (commissioning of MH Solar 100MW), and intensity (MWh / MW-installed) actually improved by 3.4%. " +
        "Two outliers worth attention: Bengaluru HQ saw a 31% jump (HVAC fault — work order WO-2026-118 open), and Karnataka Wind 80MW shows abnormal aux-power draw (likely SCADA mis-classification).",
      citations: [
        { id: "metric_energy_mwh", type: "metric", ref: "energy.consumption.mwh", label: "Energy MWh metric" },
        { id: "anomaly_hvac", type: "anomaly", ref: "ANOM-2026-44", label: "HVAC anomaly" },
      ],
    };
  }
  if (lower.includes("principle 6") || lower.includes("p6")) {
    return {
      text:
        "Principle 6 narrative — Environment Protection (FY24-25). " +
        "Imagine Powertree Group expanded renewable capacity by 100MW (Maharashtra Solar) and avoided 142,000 tCO2e versus the grid baseline. " +
        "Water withdrawal was 1.84 ML, 87% from rainwater harvesting at solar sites. Hazardous waste was reduced by 12% YoY through closed-loop battery refurbishment. " +
        "Scope 1 absolute fell 4% despite production growth; Scope 2 (market-based) fell 31% on REC procurement. " +
        "All FY24-25 SBTi near-term milestones are on track.",
      citations: [
        { id: "brsr_p6_q1", type: "brsr_q", ref: "BRSR P6 Q1", label: "BRSR P6 Question 1" },
        { id: "calc_avoided", type: "calc_run", ref: "AVOIDED-FY24-25", label: "Avoided emissions calc" },
      ],
    };
  }

  const modePrefix =
    mode === "WRITER" ? "Draft: " : mode === "EXPLAINER" ? "Here's the explainer: " : "";
  return {
    text:
      modePrefix +
      "Based on Imagine Powertree's FY24-25 data, your ESG posture is materially improving. Total emissions are 1.24 MtCO2e (Scope 1 + 2 + 3), down 6.3% YoY, with intensity improving 11.2%. " +
      "BRSR completion is at 80%, GRI 65%. The pinch point is Scope 3 Category 1 evidence quality — 71% is spend-based and could be tightened ahead of Big-4 assurance.",
    citations: [
      { id: "snap_fy24", type: "snapshot", ref: "SNAP-FY24-25-001", label: "FY24-25 snapshot" },
    ],
  };
}
