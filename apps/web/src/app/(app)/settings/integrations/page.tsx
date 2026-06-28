"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { toast } from "sonner";

const INTEGRATIONS = [
  { name: "SAP S/4HANA", category: "ERP", desc: "OData connector · AP, GL, master data", status: "CONNECTED", at: "2025-06-12" },
  { name: "Oracle Fusion ERP", category: "ERP", desc: "REST/SCIM · AP automation", status: "NOT_CONNECTED" },
  { name: "Tally Prime", category: "ERP", desc: "ODBC bridge for SME entities", status: "CONNECTED", at: "2025-08-20" },
  { name: "Workday HCM", category: "HR", desc: "Headcount, gender, training", status: "CONNECTED", at: "2025-09-01" },
  { name: "Power BI", category: "BI", desc: "Dataset publisher", status: "CONNECTED", at: "2025-10-04" },
  { name: "Snowflake", category: "Data", desc: "Reverse ETL with Fivetran", status: "NOT_CONNECTED" },
  { name: "Slack", category: "Collab", desc: "Alerts + Copilot mentions", status: "CONNECTED", at: "2025-11-12" },
  { name: "MS Teams", category: "Collab", desc: "Alerts + report sharing", status: "NOT_CONNECTED" },
];

export default function IntegrationsPage() {
  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Integrations" description="Connect ERP, HRMS, BI and collaboration tools" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((i) => (
          <Card key={i.name}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{i.name}</div>
                  <Badge variant="outline" size="sm">{i.category}</Badge>
                </div>
                <Badge variant={i.status === "CONNECTED" ? "success" : "outline"} size="sm">{i.status === "CONNECTED" ? "Connected" : "Disconnected"}</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">{i.desc}</p>
              <div className="mt-3">
                {i.status === "CONNECTED" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toast.info(`Configure ${i.name}`, {
                        description: "Connection settings open in a side panel in v2.1.",
                      })
                    }
                    aria-label={`Configure ${i.name}`}
                  >
                    Configure
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      toast.info(`Connect ${i.name}`, {
                        description: "Connection wizard ships in v2.1. Contact your CSM to enable now.",
                      })
                    }
                    aria-label={`Connect ${i.name}`}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
