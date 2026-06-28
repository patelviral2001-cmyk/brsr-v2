import type { FileObject, ExtractedField } from "@/types";

const sites = [
  { id: "node_site_blr_hq", name: "Bengaluru HQ" },
  { id: "node_site_tn_solar", name: "TN Solar 50MW" },
  { id: "node_site_ka_wind", name: "Karnataka Wind 80MW" },
  { id: "node_site_mh_solar", name: "Maharashtra Solar 100MW" },
  { id: "node_site_gj_wind", name: "Gujarat Wind 120MW" },
];

const fileSpecs: Omit<FileObject, "id" | "scopeNodeId" | "scopeNodeName" | "uploadedBy" | "uploadedAt" | "hash">[] = [
  { filename: "BESCOM_April2025_BLR-HQ.pdf", docType: "UTILITY_BILL", mimeType: "application/pdf", sizeBytes: 412_330, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 14, avgConfidence: 0.96, pageCount: 2, tags: ["electricity", "Q1-FY25-26"] },
  { filename: "TANGEDCO_April2025_TN-SLR.pdf", docType: "UTILITY_BILL", mimeType: "application/pdf", sizeBytes: 388_109, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 12, avgConfidence: 0.94, pageCount: 2, tags: ["electricity"] },
  { filename: "MahaDiscom_May2025_MH-SLR.pdf", docType: "UTILITY_BILL", mimeType: "application/pdf", sizeBytes: 401_220, status: "NEEDS_REVIEW", source: "EMAIL", extractedFieldCount: 11, avgConfidence: 0.78, pageCount: 3, tags: ["electricity"] },
  { filename: "HPCL_DieselReceipt_Apr2025_KA-WND.pdf", docType: "FUEL_RECEIPT", mimeType: "application/pdf", sizeBytes: 89_211, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 8, avgConfidence: 0.92, pageCount: 1 },
  { filename: "IOC_DG_Diesel_May2025_BLR.pdf", docType: "FUEL_RECEIPT", mimeType: "application/pdf", sizeBytes: 76_402, status: "EXTRACTED", source: "UPLOAD", extractedFieldCount: 7, avgConfidence: 0.88, pageCount: 1 },
  { filename: "Payroll_FY24-25_IPI.xlsx", docType: "PAYROLL", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 1_204_889, status: "APPROVED", source: "ERP", extractedFieldCount: 28, avgConfidence: 0.99, tags: ["confidential"] },
  { filename: "HR_Register_FY24-25.xlsx", docType: "HR_REGISTER", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 845_012, status: "APPROVED", source: "ERP", extractedFieldCount: 42, avgConfidence: 0.98 },
  { filename: "Whistleblower_Policy_v3.pdf", docType: "POLICY", mimeType: "application/pdf", sizeBytes: 224_109, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 6, avgConfidence: 0.91, pageCount: 8 },
  { filename: "AntiBribery_Policy_2025.pdf", docType: "POLICY", mimeType: "application/pdf", sizeBytes: 198_322, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 5, avgConfidence: 0.93, pageCount: 6 },
  { filename: "InternalAudit_Q4FY25.pdf", docType: "AUDIT_REPORT", mimeType: "application/pdf", sizeBytes: 2_240_119, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 31, avgConfidence: 0.89, pageCount: 42 },
  { filename: "Tata_SustainabilityReport_FY24-25.pdf", docType: "SUSTAINABILITY_REPORT", mimeType: "application/pdf", sizeBytes: 5_408_220, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 88, avgConfidence: 0.86, pageCount: 124, tags: ["peer-benchmark"] },
  { filename: "EnergyAudit_BLR-HQ_2025.pdf", docType: "ENERGY_AUDIT", mimeType: "application/pdf", sizeBytes: 1_840_018, status: "NEEDS_REVIEW", source: "UPLOAD", extractedFieldCount: 22, avgConfidence: 0.74, pageCount: 28 },
  { filename: "EnergyAudit_TN-SLR_2025.pdf", docType: "ENERGY_AUDIT", mimeType: "application/pdf", sizeBytes: 1_602_330, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 18, avgConfidence: 0.90, pageCount: 22 },
  { filename: "EffluentTest_MH-SLR_May25.pdf", docType: "EFFLUENT_TEST", mimeType: "application/pdf", sizeBytes: 218_009, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 14, avgConfidence: 0.95, pageCount: 4 },
  { filename: "EHS_LTIFR_FY24-25_All.xlsx", docType: "EHS_INCIDENT", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 412_009, status: "APPROVED", source: "ERP", extractedFieldCount: 16, avgConfidence: 0.97 },
  { filename: "CSR_AnnualReport_FY24-25.pdf", docType: "CSR_REPORT", mimeType: "application/pdf", sizeBytes: 3_220_018, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 24, avgConfidence: 0.91, pageCount: 38 },
  { filename: "Training_Logs_FY24-25.csv", docType: "TRAINING_LOG", mimeType: "text/csv", sizeBytes: 142_330, status: "APPROVED", source: "ERP", extractedFieldCount: 12, avgConfidence: 0.96 },
  { filename: "PR_Cert_BLR_OHSAS18001.pdf", docType: "PR_CERT", mimeType: "application/pdf", sizeBytes: 320_011, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 4, avgConfidence: 0.99, pageCount: 2 },
  { filename: "PR_Cert_ISO14001_Group.pdf", docType: "PR_CERT", mimeType: "application/pdf", sizeBytes: 298_021, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 4, avgConfidence: 0.99, pageCount: 2 },
  { filename: "GreenSteel_Invoice_Q1FY26.pdf", docType: "INVOICE", mimeType: "application/pdf", sizeBytes: 144_201, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 9, avgConfidence: 0.94, pageCount: 2 },
  { filename: "AcmeSemi_Invoice_Apr2025.pdf", docType: "INVOICE", mimeType: "application/pdf", sizeBytes: 132_009, status: "EXTRACTED", source: "API", extractedFieldCount: 9, avgConfidence: 0.91 },
  { filename: "Servotech_PCF_FY24-25.pdf", docType: "SUSTAINABILITY_REPORT", mimeType: "application/pdf", sizeBytes: 880_119, status: "NEEDS_REVIEW", source: "EMAIL", extractedFieldCount: 16, avgConfidence: 0.72, pageCount: 16, tags: ["supplier-PCF"] },
  { filename: "REC_PurchaseAgreement_Q1FY26.pdf", docType: "INVOICE", mimeType: "application/pdf", sizeBytes: 524_018, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 11, avgConfidence: 0.93, pageCount: 6 },
  { filename: "WaterBill_KA-WND_April25.pdf", docType: "UTILITY_BILL", mimeType: "application/pdf", sizeBytes: 88_201, status: "PROCESSING", source: "UPLOAD", extractedFieldCount: 0, avgConfidence: 0, pageCount: 1 },
  { filename: "WaterBill_GJ-WND_April25.pdf", docType: "UTILITY_BILL", mimeType: "application/pdf", sizeBytes: 92_120, status: "PROCESSING", source: "UPLOAD", extractedFieldCount: 0, avgConfidence: 0, pageCount: 1 },
  { filename: "TravelReport_Q1FY26_BLR.xlsx", docType: "OTHER", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 312_009, status: "APPROVED", source: "ERP", extractedFieldCount: 18, avgConfidence: 0.95 },
  { filename: "WasteManifest_MH-SLR_May25.pdf", docType: "OTHER", mimeType: "application/pdf", sizeBytes: 184_011, status: "EXTRACTED", source: "UPLOAD", extractedFieldCount: 12, avgConfidence: 0.88, pageCount: 3 },
  { filename: "Boardroom_Diversity_FY24-25.xlsx", docType: "HR_REGISTER", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 84_009, status: "APPROVED", source: "ERP", extractedFieldCount: 14, avgConfidence: 0.98 },
  { filename: "ScienceBased_Validation_SBTi.pdf", docType: "AUDIT_REPORT", mimeType: "application/pdf", sizeBytes: 1_220_111, status: "APPROVED", source: "UPLOAD", extractedFieldCount: 20, avgConfidence: 0.94, pageCount: 18 },
  { filename: "ResolveEnergy_PCF.pdf", docType: "SUSTAINABILITY_REPORT", mimeType: "application/pdf", sizeBytes: 720_002, status: "REJECTED", source: "EMAIL", extractedFieldCount: 8, avgConfidence: 0.42, pageCount: 12, tags: ["low-quality"] },
];

const uploaders = ["Arjun Menon", "Kavita Rao", "Rohan Sharma", "Priya Iyer"];

export const mockFiles: FileObject[] = fileSpecs.map((spec, i) => {
  const site = sites[i % sites.length];
  const dt = new Date(2026, 5, 16);
  dt.setHours(dt.getHours() - i * 7);
  return {
    id: `file_${String(i + 1).padStart(3, "0")}`,
    scopeNodeId: site.id,
    scopeNodeName: site.name,
    uploadedBy: uploaders[i % uploaders.length],
    uploadedAt: dt.toISOString(),
    hash: `sha256:${Math.random().toString(36).slice(2, 10).padEnd(64, "0")}`,
    ...spec,
  };
});

// Generate ~100 extracted fields across files
const fieldTemplates = [
  { key: "electricity.units_kwh", label: "Units Consumed", unit: "kWh", metric: "electricity.consumption.kwh" },
  { key: "electricity.demand_kva", label: "Maximum Demand", unit: "kVA" },
  { key: "electricity.cost_inr", label: "Total Amount", unit: "INR" },
  { key: "electricity.bill_period", label: "Billing Period", unit: "" },
  { key: "electricity.tariff", label: "Tariff Category", unit: "" },
  { key: "diesel.qty_l", label: "Diesel Quantity", unit: "L", metric: "diesel.consumption.l" },
  { key: "diesel.cost_inr", label: "Total Cost", unit: "INR" },
  { key: "payroll.fte_count", label: "FTE Count", unit: "" },
  { key: "payroll.female_count", label: "Female Employees", unit: "" },
  { key: "policy.published_at", label: "Policy Effective Date", unit: "" },
  { key: "audit.finding_count", label: "Audit Findings", unit: "" },
  { key: "effluent.ph", label: "pH Level", unit: "" },
  { key: "effluent.bod_mg_l", label: "BOD", unit: "mg/L" },
  { key: "effluent.cod_mg_l", label: "COD", unit: "mg/L" },
  { key: "ehs.ltifr", label: "LTIFR", unit: "per 1M hrs" },
  { key: "ehs.fatalities", label: "Fatalities", unit: "" },
  { key: "csr.spend_inr", label: "CSR Spend", unit: "INR" },
  { key: "training.hours", label: "Training Hours", unit: "hrs" },
  { key: "invoice.amount_inr", label: "Invoice Amount", unit: "INR" },
  { key: "invoice.vendor", label: "Vendor", unit: "" },
];

const sampleValues: Record<string, (string | number)[]> = {
  "electricity.units_kwh": [142_330, 88_201, 412_009, 38_220, 522_881, 199_011],
  "electricity.demand_kva": [488, 312, 1_020, 188],
  "electricity.cost_inr": [12_40_222, 7_28_119, 28_40_009, 3_42_222],
  "electricity.bill_period": ["Apr 2025", "May 2025", "Mar 2025"],
  "electricity.tariff": ["HT-2A Industrial", "HT-3 Commercial"],
  "diesel.qty_l": [882, 1204, 412, 720],
  "diesel.cost_inr": [82_400, 1_12_011, 38_222],
  "payroll.fte_count": [412, 2210, 38, 42, 52, 64],
  "payroll.female_count": [149, 821, 9, 13],
  "policy.published_at": ["2024-04-15", "2024-09-01", "2025-01-12"],
  "audit.finding_count": [4, 7, 11, 2],
  "effluent.ph": [7.2, 7.4, 6.9],
  "effluent.bod_mg_l": [12.4, 18.2, 9.1],
  "effluent.cod_mg_l": [88.2, 102.4, 64.1],
  "ehs.ltifr": [0.18, 0.31, 0.0],
  "ehs.fatalities": [0],
  "csr.spend_inr": [9_64_60_000],
  "training.hours": [28_440, 18_220, 4_120],
  "invoice.amount_inr": [88_40_222, 1_22_40_119, 38_20_009],
  "invoice.vendor": ["GreenSteel Pvt Ltd", "AcmeSemiconductors", "Servotech India"],
};

let fieldCounter = 0;
const allFields: ExtractedField[] = [];

for (const file of mockFiles) {
  if (file.status === "PROCESSING") continue;
  const fieldCount = Math.min(file.extractedFieldCount, 6);
  for (let i = 0; i < fieldCount; i++) {
    const tpl = fieldTemplates[(fieldCounter + i) % fieldTemplates.length];
    const values = sampleValues[tpl.key] ?? [42];
    const value = values[fieldCounter % values.length];
    const baseConf = file.avgConfidence;
    const conf = Math.max(0.4, Math.min(0.99, baseConf + (Math.random() - 0.5) * 0.12));
    const status: ExtractedField["status"] = conf < 0.8 ? "PENDING" : "APPROVED";
    allFields.push({
      id: `field_${String(fieldCounter + 1).padStart(4, "0")}`,
      fileId: file.id,
      fileName: file.filename,
      fieldKey: tpl.key,
      fieldLabel: tpl.label,
      value,
      unit: tpl.unit,
      confidence: Math.round(conf * 100) / 100,
      confidenceBreakdown: {
        ocrQuality: Math.round((baseConf + (Math.random() - 0.5) * 0.1) * 100) / 100,
        llmCertainty: Math.round((baseConf + (Math.random() - 0.5) * 0.1) * 100) / 100,
        schemaMatch: Math.round((baseConf + (Math.random() - 0.5) * 0.08) * 100) / 100,
        historicalAgreement: Math.round((baseConf - 0.05 + Math.random() * 0.1) * 100) / 100,
        crossReference: Math.round((baseConf - 0.08 + Math.random() * 0.12) * 100) / 100,
      },
      bbox: { page: 1, x: 0.1 + Math.random() * 0.5, y: 0.15 + Math.random() * 0.6, w: 0.18, h: 0.04 },
      status,
      pageNumber: 1,
      metricKey: tpl.metric,
      rawText: String(value),
    });
    fieldCounter++;
  }
}

export const mockExtractedFields: ExtractedField[] = allFields;
