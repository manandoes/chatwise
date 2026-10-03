"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Agent {
  type: string;
  name: string;
  tagline: string;
  icon: string;
  enabled: boolean;
}

export function AIWorkforcePanel({ agents: initialAgents }: { agents: Agent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [saving, setSaving] = useState(false);

  const toggleAgent = async (type: string) => {
    const updated = agents.map((agent) =>
      agent.type === type ? { ...agent, enabled: !agent.enabled } : agent
    );
    setAgents(updated);

    // Optimistic UI update
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledAgents: updated.filter((a) => a.enabled).map((a) => a.type) }),
      });
      if (!res.ok) {
        // Revert on failure
        setAgents(initialAgents);
      }
    } catch {
      setAgents(initialAgents);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Workforce</CardTitle>
        <CardDescription>
          Enable or disable agents for your business. Each agent handles different types of conversations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <button
              key={agent.type}
              onClick={() => toggleAgent(agent.type)}
              disabled={saving}
              className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                agent.enabled
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/20 opacity-60"
              } hover:border-primary/50`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">{agent.name}</span>
                <span className={`text-xs ${agent.enabled ? "text-primary" : "text-muted-foreground"}`}>
                  {agent.enabled ? "✓ Active" : "Inactive"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{agent.tagline}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
