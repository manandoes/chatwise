"use client";

// Business hours & the out-of-office auto-response.
//
// Off by default — every account answers around the clock until an owner
// deliberately narrows that (lib/business-hours.ts). Turning it on and
// leaving every day closed would mean the agent never replies at all, so the
// form doesn't try to stop that; the away message is what a customer sees
// either way, and it's always required once this is on.

import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WeekSchedule } from "@/lib/business-hours";

const DAYS: { key: keyof WeekSchedule; label: string }[] = [
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
  { key: "0", label: "Sunday" },
];

export function BusinessHoursForm({
  initialEnabled,
  initialSchedule,
  initialAwayMessage,
}: {
  initialEnabled: boolean;
  initialSchedule: WeekSchedule;
  initialAwayMessage: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [schedule, setSchedule] = useState<WeekSchedule>(initialSchedule);
  const [awayMessage, setAwayMessage] = useState(initialAwayMessage);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function toggleDay(day: keyof WeekSchedule) {
    setJustSaved(false);
    setSchedule((current) => {
      const existing = current[day];

      if (!existing || existing.closed) {
        return { ...current, [day]: { open: "09:00", close: "18:00" } };
      }

      return { ...current, [day]: { closed: true } };
    });
  }

  function setTime(day: keyof WeekSchedule, field: "open" | "close", value: string) {
    setJustSaved(false);
    setSchedule((current) => {
      const existing = current[day];

      if (!existing || existing.closed) return current;

      return { ...current, [day]: { ...existing, [field]: value } };
    });
  }

  async function save() {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/business-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, schedule, awayMessage }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "We couldn't save that.");
        return;
      }

      setJustSaved(true);
    } catch {
      setError("We couldn't reach ChatWise. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Business hours</CardTitle>
        <CardDescription>
          Narrow when your agent answers. Outside these hours, customers get
          your away message instead and the thread waits for you.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <label className="flex items-center gap-2 text-text-primary">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setJustSaved(false);
            }}
            className="size-4 rounded border-border"
          />
          Only answer during set hours
        </label>

        {enabled && (
          <>
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => {
                const day = schedule[key];
                const open = day && !day.closed;

                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-3 border-b border-border py-2 last:border-none"
                  >
                    <label className="flex w-32 shrink-0 items-center gap-2 text-small text-text-primary">
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => toggleDay(key)}
                        className="size-4 rounded border-border"
                      />
                      {label}
                    </label>

                    {open ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={day.open}
                          onChange={(event) => setTime(key, "open", event.target.value)}
                          className="w-32"
                        />
                        <span className="text-text-secondary">to</span>
                        <Input
                          type="time"
                          value={day.close}
                          onChange={(event) => setTime(key, "close", event.target.value)}
                          className="w-32"
                        />
                      </div>
                    ) : (
                      <span className="text-small text-text-secondary">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="away-message">What customers see outside these hours</Label>
              <Textarea
                id="away-message"
                rows={3}
                value={awayMessage}
                onChange={(event) => {
                  setAwayMessage(event.target.value);
                  setJustSaved(false);
                }}
              />
            </div>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={isSaving}>
            {isSaving && <LoaderCircle className="size-4 animate-spin" />}
            {isSaving ? "Saving…" : "Save"}
          </Button>

          {justSaved && !isSaving && (
            <p className="flex items-center gap-1.5 text-small text-primary">
              <Check className="size-4" />
              Saved
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
