// Types for the multi-agent orchestrator.
//
// The orchestrator sits between the message router and the individual agents.
// It decides which agent should handle each incoming message based on intent
// detection, conversation history, and business configuration.

import type { BotType } from "../../bots/shared/config-types.ts";

/** The intent the orchestrator detects for an incoming message. */
export type Intent =
  | "general_question"
  | "product_question"
  | "sales"
  | "lead_qualification"
  | "appointment"
  | "support"
  | "order_problem"
  | "follow_up"
  | "product_recommendation"
  | "feedback"
  | "human_request"
  | "internal"
  | "unknown";

/** The result of routing a message. */
export type RouteDecision = {
  /** Which agent should handle this message. */
  agent: BotType;
  /** Why this agent was chosen. */
  reason: string;
  /** Confidence score 0-1. Below 0.5 triggers clarification or fallback. */
  confidence: number;
  /** Intent detected in the message. */
  intent: Intent;
  /** If confidence is low, what clarifying question to ask (or null). */
  clarificationQuestion?: string;
  /** Whether this should trigger a handoff from the current agent. */
  shouldHandoff?: boolean;
};

/** Context the orchestrator needs to make routing decisions. */
export type OrchestratorContext = {
  businessId: string;
  businessName: string | null;
  industry: string | null;
  about: string | null;
  timezone: string;
  /** Which agents are enabled for this business. */
  enabledAgents: BotType[];
  /** Which agent is currently handling this conversation (if any). */
  currentAgent: BotType | null;
  /** How many handoffs have already occurred. */
  handoffCount: number;
  /** The conversation history (last N turns). */
  recentHistory: { who: "customer" | "agent"; text: string }[];
  /** The latest message from the customer. */
  message: string;
  /** Customer name if available. */
  contactName: string | null;
  /** Business knowledge base. */
  knowledge: { question: string; answer: string }[];
  /** Whether the AI is configured. */
  isAiConfigured: boolean;
};
