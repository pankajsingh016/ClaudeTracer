// Plans control how dollar amounts are scaled across the dashboard.

export type PlanKind = "metered" | "flat";
export type PlanGroup = "Individual" | "API" | "Enterprise" | "Other";

export interface Plan {
  id: string;
  name: string;
  group: PlanGroup;
  kind: PlanKind;
  factor?: number;
  monthly?: number;
  perSeat?: boolean;
  /** Show discount % input (Enterprise → Usage page style). */
  usesEnterpriseDiscount?: boolean;
  /** Show custom × multiplier input. */
  usesCustomFactor?: boolean;
  note: string;
}

export const PLANS: Plan[] = [
  // --- Individual ---
  {
    id: "api",
    name: "List API price",
    group: "Individual",
    kind: "metered",
    factor: 1,
    note: "Public pay-as-you-go rates (claude.com/pricing).",
  },
  {
    id: "pro",
    name: "Claude Pro",
    group: "Individual",
    kind: "flat",
    monthly: 20,
    note: "Flat $20/mo — usage-limited; marginal token cost is $0.",
  },
  {
    id: "max5",
    name: "Claude Max 5×",
    group: "Individual",
    kind: "flat",
    monthly: 100,
    note: "~5× Pro limits. Flat monthly.",
  },
  {
    id: "max20",
    name: "Claude Max 20×",
    group: "Individual",
    kind: "flat",
    monthly: 200,
    note: "~20× Pro limits. Flat monthly.",
  },

  // --- API ---
  {
    id: "api_priority",
    name: "API — Priority Tier",
    group: "API",
    kind: "metered",
    factor: 1,
    note: "Same token rates; committed TPM for production SLA.",
  },
  {
    id: "batch",
    name: "API — Batch (−50%)",
    group: "API",
    kind: "metered",
    factor: 0.5,
    note: "Async batch; auto-detected when service_tier is batch.",
  },
  {
    id: "aws_ccu",
    name: "Claude Platform on AWS",
    group: "API",
    kind: "metered",
    factor: 1,
    note: "100 CCU = $1. Discounts apply before CCU conversion.",
  },
  {
    id: "inference_us",
    name: "US-only inference (+10%)",
    group: "API",
    kind: "metered",
    factor: 1.1,
    note: "When inference_geo is us on supported models.",
  },
  {
    id: "bedrock_regional",
    name: "Bedrock / Vertex regional (+10%)",
    group: "API",
    kind: "metered",
    factor: 1.1,
    note: "Regional cloud endpoints (+10% premium).",
  },

  // --- Enterprise ---
  {
    id: "enterprise",
    name: "Enterprise — billed usage",
    group: "Enterprise",
    kind: "metered",
    usesEnterpriseDiscount: true,
    note: "Matches Claude Settings → Usage: list API cost minus your contract discount %.",
  },
  {
    id: "enterprise_seat",
    name: "Enterprise — seat fee",
    group: "Enterprise",
    kind: "flat",
    monthly: 20,
    perSeat: true,
    note: "~$20/seat/mo (separate from metered usage). Costs below still show token spend.",
  },
  {
    id: "team_std",
    name: "Team — standard seat",
    group: "Enterprise",
    kind: "flat",
    monthly: 25,
    perSeat: true,
    note: "$20/seat annual. Overage at API rates.",
  },
  {
    id: "team_prem",
    name: "Team — premium seat",
    group: "Enterprise",
    kind: "flat",
    monthly: 125,
    perSeat: true,
    note: "$100/seat annual. Higher included usage.",
  },

  // --- Other ---
  {
    id: "custom",
    name: "Custom multiplier",
    group: "Other",
    kind: "metered",
    usesCustomFactor: true,
    factor: 1,
    note: "Multiply list API cost by your own factor.",
  },
];

export const PLAN_GROUPS: PlanGroup[] = ["Individual", "API", "Enterprise", "Other"];

export const DEFAULT_ENTERPRISE_DISCOUNT_PCT = 30;

const LS_PLAN = "claude-dashboard.planId";
const LS_DISCOUNT = "claude-dashboard.enterpriseDiscountPct";
const LS_CUSTOM = "claude-dashboard.planCustomFactor";

export const planById = (id: string) =>
  PLANS.find((p) => p.id === id) ?? PLANS.find((p) => p.id === "enterprise")!;

export function loadPlanPrefs(): {
  planId: string;
  discountPct: number;
  customFactor: number;
} {
  const planId = localStorage.getItem(LS_PLAN) ?? "enterprise";
  const discountPct = parseFloat(
    localStorage.getItem(LS_DISCOUNT) ?? String(DEFAULT_ENTERPRISE_DISCOUNT_PCT)
  );
  const customFactor = parseFloat(localStorage.getItem(LS_CUSTOM) ?? "1");
  return {
    planId: planById(planId).id,
    discountPct: Number.isFinite(discountPct) ? discountPct : DEFAULT_ENTERPRISE_DISCOUNT_PCT,
    customFactor: Number.isFinite(customFactor) ? customFactor : 1,
  };
}

export function savePlanPrefs(planId: string, discountPct: number, customFactor: number) {
  localStorage.setItem(LS_PLAN, planId);
  localStorage.setItem(LS_DISCOUNT, String(discountPct));
  localStorage.setItem(LS_CUSTOM, String(customFactor));
}

export function planCostFactor(
  planId: string,
  discountPct: number,
  customFactor: number,
  serverDiscountMult?: number
): number {
  const p = planById(planId);
  if (p.usesEnterpriseDiscount) {
    if (serverDiscountMult != null && serverDiscountMult > 0 && serverDiscountMult < 1) {
      return serverDiscountMult;
    }
    const pct = Math.min(99, Math.max(0, discountPct));
    return 1 - pct / 100;
  }
  if (p.usesCustomFactor) return customFactor > 0 ? customFactor : 1;
  if (p.kind === "flat") return 1;
  return p.factor ?? 1;
}

export function planCostLabel(planId: string, discountPct: number, customFactor: number): string {
  const p = planById(planId);
  if (p.usesEnterpriseDiscount) return `Enterprise · ${discountPct}% off list`;
  if (p.usesCustomFactor) return `Custom × ${customFactor}`;
  if (p.kind === "flat") return `${p.name} (tokens at list API)`;
  return p.name;
}
