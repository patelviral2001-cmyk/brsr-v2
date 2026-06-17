import type { CopilotConversation } from "@/types";

export const mockCopilotConvos: CopilotConversation[] = [
  {
    id: "conv_001",
    title: "Scope 3 Cat 1 explanation",
    mode: "EXPLAINER",
    createdAt: "2026-06-16T08:42:00Z",
    updatedAt: "2026-06-16T08:48:00Z",
    messages: [
      { id: "m1", role: "user", content: "Explain Scope 3 Category 1 and where our risk is.", createdAt: "2026-06-16T08:42:00Z" },
      { id: "m2", role: "assistant", content: "Scope 3 Category 1 covers emissions from purchased goods and services — typically the largest Scope 3 bucket. For Imagine Powertree, Cat 1 was 487,200 tCO2e in FY24-25, dominated by GreenSteel Pvt (62%) and AcmeSemiconductors (18%). Methodology mix: 71% spend-based, 23% supplier-specific, 6% average-data. Recommended next step: extend supplier-specific coverage to top-10 vendors.", citations: [{ id: "calc_004", type: "calc_run", ref: "S3-C1-FY24-25", label: "Scope 3 Cat 1 calc" }], createdAt: "2026-06-16T08:43:30Z" },
    ],
  },
  {
    id: "conv_002",
    title: "Energy spike Q1",
    mode: "ANALYST",
    createdAt: "2026-06-15T14:11:00Z",
    updatedAt: "2026-06-15T14:18:00Z",
    messages: [
      { id: "m1", role: "user", content: "Why is energy up 18% this Q?", createdAt: "2026-06-15T14:11:00Z" },
      { id: "m2", role: "assistant", content: "Energy consumption is up 18% QoQ but largely volume-driven, not efficiency-driven. Production rose 22% (MH Solar 100MW commissioned). Intensity actually improved 3.4%. Watch Bengaluru HQ HVAC fault (WO-2026-118) and KA-Wind aux-power SCADA mis-classification.", citations: [{ id: "metric_001", type: "metric", ref: "energy.consumption.mwh", label: "Energy MWh metric" }], createdAt: "2026-06-15T14:12:30Z" },
    ],
  },
  {
    id: "conv_003",
    title: "Principle 6 narrative draft",
    mode: "WRITER",
    createdAt: "2026-06-14T10:30:00Z",
    updatedAt: "2026-06-14T10:40:00Z",
    messages: [
      { id: "m1", role: "user", content: "Draft the Principle 6 narrative for our BRSR.", createdAt: "2026-06-14T10:30:00Z" },
      { id: "m2", role: "assistant", content: "Draft: Imagine Powertree Group expanded renewable capacity by 100MW (Maharashtra Solar) and avoided 142,000 tCO2e versus the grid baseline. Water withdrawal was 1.84 ML, 87% from rainwater harvesting. Hazardous waste reduced 12% YoY through closed-loop battery refurbishment.", citations: [{ id: "brsr_p6_q1", type: "brsr_q", ref: "BRSR P6 Q1", label: "P6 Q1" }], createdAt: "2026-06-14T10:31:20Z" },
    ],
  },
];
