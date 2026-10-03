// The orchestrator that routes messages to the right agent.
//
// This sits between the message router and the individual agents. It:
// 1. Detects the intent of the incoming message
// 2. Selects the best agent from the enabled set
// 3. Handles handoffs between agents
// 4. Falls back gracefully when confidence is low
//
// The orchestrator does NOT generate responses itself — it only routes.
// It uses lightweight keyword/phrase matching for fast decisions, with an
// LLM-backed confidence check as a secondary path.

import type { BotType } from "../../bots/shared/config-types.ts";
import type { OrchestratorContext, RouteDecision } from "./types.ts";
import { db } from "../db.ts";

// ─── Simple keyword-based routing (fast, deterministic) ──────────────────────

type RoutingRule = {
  keywords: string[];
  intents: string[];
  preferredAgent: BotType;
};

const INTENT_RULES: RoutingRule[] = [
  {
    keywords: ["hours", "open", "close", "timing", "when", "schedule", "location", "where", "address"],
    intents: ["general_question"],
    preferredAgent: "RECEPTIONIST",
  },
  {
    keywords: ["book", "appointment", "meeting", "schedule", "consultation", "call", "demo"],
    intents: ["appointment"],
    preferredAgent: "APPOINTMENT",
  },
  {
    keywords: ["buy", "order", "price", "cost", "quote", "purchase", "deal", "offer", "discount"],
    intents: ["sales"],
    preferredAgent: "SALES",
  },
  {
    keywords: ["problem", "issue", "complaint", "refund", "return", "broken", "wrong", "missing"],
    intents: ["support", "order_problem"],
    preferredAgent: "SUPPORT",
  },
  {
    keywords: ["recommend", "suggest", "looking for", "need a", "what should i get"],
    intents: ["product_recommendation"],
    preferredAgent: "PERSONAL_SHOPPER",
  },
  {
    keywords: ["feedback", "review", "rate", "satisfied", "unhappy", "bad experience"],
    intents: ["feedback"],
    preferredAgent: "FEEDBACK",
  },
  {
    keywords: ["human", "person", "talk to", "speak to", "agent", "representative", "real person"],
    intents: ["human_request"],
    preferredAgent: "RECEPTIONIST",
  },
];

/**
 * Routes an inbound message to the appropriate agent.
 *
 * Uses keyword matching for fast deterministic routing.
 */
export async function routeMessage(context: OrchestratorContext): Promise<RouteDecision> {
  const { message, enabledAgents, currentAgent, handoffCount } = context;
  const messageLower = message.toLowerCase().trim();

  // Fast path: keyword matching
  let bestMatch: RoutingRule | null = null;
  let matchScore = 0;

  for (const rule of INTENT_RULES) {
    const hits = rule.keywords.filter((kw) => messageLower.includes(kw)).length;
    if (hits > matchScore) {
      matchScore = hits;
      bestMatch = rule;
    }
  }

  // If no keyword match, default to Receptionist
  if (!bestMatch) {
    return {
      agent: "RECEPTIONIST",
      reason: "No specific intent detected; routing to receptionist",
      confidence: 0.6,
      intent: "unknown",
    };
  }

  // Check if the preferred agent is enabled
  const preferredAgent = bestMatch.preferredAgent;
  const isPreferredEnabled = enabledAgents.includes(preferredAgent);

  if (!isPreferredEnabled) {
    return {
      agent: "RECEPTIONIST",
      reason: `Preferred agent ${preferredAgent} is not enabled; falling back to receptionist`,
      confidence: 0.5,
      intent: bestMatch.intents[0] as import("./types.ts").Intent,
    };
  }

  // Calculate confidence
  let confidence = 0.7 + matchScore * 0.05;
  if (currentAgent === preferredAgent) {
    confidence = Math.min(0.95, confidence + 0.15);
  }
  if (handoffCount >= 3) {
    confidence = Math.min(confidence, 0.6);
  }

  // Low confidence: ask for clarification
  if (confidence < 0.5) {
    return {
      agent: "RECEPTIONIST",
      reason: "Low confidence in intent detection",
      confidence: 0.4,
      intent: "unknown",
      clarificationQuestion: "Could you clarify what you need help with?",
    };
  }

  // Human request always escalates
  if (bestMatch.intents.includes("human_request")) {
    return {
      agent: currentAgent ?? "RECEPTIONIST",
      reason: "Customer requested a human",
      confidence: 0.95,
      intent: "human_request",
      shouldHandoff: true,
    };
  }

  // Determine if handoff is needed
  const shouldHandoff = currentAgent !== null && currentAgent !== preferredAgent;

  return {
    agent: preferredAgent,
    reason: `Detected intent: ${bestMatch.intents.join(", ")}`,
    confidence,
    intent: bestMatch.intents[0] as import("./types.ts").Intent,
    shouldHandoff: shouldHandoff ? true : undefined,
  };
}

/**
 * Reads the enabled agents from the business's agent instance.
 */
export async function readEnabledAgents(businessId: string): Promise<BotType[]> {
  const agent = await db.agentInstance.findUnique({
    where: { businessId },
    select: { enabledAgents: true, activeBotType: true, botType: true },
  });

  if (!agent) return ["RECEPTIONIST"];

  const enabled = agent.enabledAgents as BotType[] | null;
  if (enabled && Array.isArray(enabled) && enabled.length > 0) {
    return enabled;
  }

  return [(agent.activeBotType ?? agent.botType) as BotType];
}
