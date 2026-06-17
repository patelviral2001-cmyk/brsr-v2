"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function MetricEventForm() {
  const [value, setValue] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); toast.success("Metric event saved"); }}
    >
      <div>
        <Label>Metric</Label>
        <Select defaultValue="electricity.consumption.kwh">
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="electricity.consumption.kwh">electricity.consumption.kwh</SelectItem>
            <SelectItem value="diesel.consumption.l">diesel.consumption.l</SelectItem>
            <SelectItem value="water.withdrawal.kl">water.withdrawal.kl</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Value</Label>
        <Input className="mt-1.5 font-mono" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div>
        <Label>Period</Label>
        <Select defaultValue="FY24-25">
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="FY24-25">FY24-25</SelectItem>
            <SelectItem value="FY25-26">FY25-26 (Q1)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm">Save event</Button>
    </form>
  );
}
