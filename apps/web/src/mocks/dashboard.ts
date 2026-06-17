export const mockDashboardKpis = {
  esgScore: { value: 78, delta: 4.2, target: 85, percentile: 82 },
  emissionsTotal: {
    value: 1_240_000, // tCO2e
    delta: -6.3,
    unit: "tCO2e",
    sparkline: [1_310, 1_298, 1_286, 1_274, 1_268, 1_252, 1_248, 1_244, 1_241, 1_240, 1_236, 1_240],
  },
  energyIntensity: {
    value: 0.084,
    delta: -3.4,
    unit: "MWh/kINR",
    sparkline: [0.092, 0.090, 0.089, 0.088, 0.087, 0.086, 0.085, 0.085, 0.084, 0.084, 0.084, 0.084],
  },
  dataCompleteness: { value: 0.91, delta: 4.1, target: 0.95 },
};

export const mockDashboardActivity = [
  { id: "act_01", at: "2026-06-16T08:42:00Z", actor: "Priya Iyer", action: "filed", target: "BRSR FY24-25" },
  { id: "act_02", at: "2026-06-16T07:18:00Z", actor: "Arjun Menon", action: "approved 18 extractions for", target: "BESCOM April 2025" },
  { id: "act_03", at: "2026-06-15T22:11:00Z", actor: "Kavita Rao", action: "uploaded", target: "Servotech_PCF_FY24-25.pdf" },
  { id: "act_04", at: "2026-06-15T18:01:00Z", actor: "Vikram Singh (KPMG)", action: "signed assurance opinion on", target: "SNAP-FY24-25-001" },
  { id: "act_05", at: "2026-06-15T16:33:00Z", actor: "Rohan Sharma", action: "ran calculation", target: "Scope 2 (Market-based)" },
  { id: "act_06", at: "2026-06-15T14:12:00Z", actor: "Copilot", action: "answered question on", target: "Energy spike Q1" },
];

export const mockDashboardAnomalies = [
  { id: "an_01", severity: "HIGH", title: "BLR HQ HVAC consumption +31% MoM", impact: "+82 tCO2e Scope 2", at: "2026-06-15T09:00:00Z" },
  { id: "an_02", severity: "MEDIUM", title: "KA-Wind aux-power abnormal draw", impact: "Likely SCADA classification error", at: "2026-06-14T11:00:00Z" },
  { id: "an_03", severity: "MEDIUM", title: "Resolve Energy questionnaire 22d overdue", impact: "Scope 3 Cat 1 PCF gap", at: "2026-06-12T08:00:00Z" },
  { id: "an_04", severity: "LOW", title: "Water meter offline (MH-SLR)", impact: "Discharge estimate fallback active", at: "2026-06-10T14:00:00Z" },
];
