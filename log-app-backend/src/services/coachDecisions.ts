import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";

/**
 * The coach's side of the conversation: what it advised, when to check back, and
 * how it turned out. Written automatically for each weekly verdict, by the coach
 * itself through the `record_decision` tool, and when it prepares a proposal.
 */

export type DecisionKind =
  | "verdict"
  | "advice"
  | "plan_change"
  | "set_change"
  | "meal_change"
  | "physique";

export interface CoachDecisionRow {
  id: string;
  kind: string;
  summary: string;
  topic: string | null;
  review_on: string | null;
  outcome: string | null;
  created_at: string;
}

export interface RecordDecisionInput {
  kind: DecisionKind;
  summary: string;
  detail?: unknown;
  topic?: string | null;
  /** Days until it should be reviewed; null for none, omitted for the default. */
  reviewInDays?: number | null;
  /** Id of an earlier decision this one closes. */
  resolves?: string | null;
  outcome?: string | null;
}

const MIN_REVIEW_DAYS = 1;
const MAX_REVIEW_DAYS = 56;
const DEFAULT_REVIEW_DAYS = 14;
const MAX_SUMMARY = 200;
const CONTEXT_LIMIT = 3;
const TOPICS = new Set(["diet", "training", "recovery", "other"]);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/** UTC midnight for an ISO date (or today). */
function utcMidnight(value?: string): Date {
  const base = value ? new Date(`${value}T00:00:00Z`) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

interface DecisionRecord {
  id: string;
  kind: string;
  summary: string;
  topic: string | null;
  reviewOn: Date | null;
  outcome: string | null;
  createdAt: Date;
}

function serialize(row: DecisionRecord): CoachDecisionRow {
  return {
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    topic: row.topic,
    review_on: row.reviewOn ? isoDate(row.reviewOn) : null,
    outcome: row.outcome,
    created_at: row.createdAt.toISOString(),
  };
}

export async function recordDecision(
  userId: string,
  input: RecordDecisionInput,
  today?: string,
): Promise<CoachDecisionRow> {
  const summary = input.summary.trim().slice(0, MAX_SUMMARY) || "Coach note";
  const topic = input.topic && TOPICS.has(input.topic) ? input.topic : null;
  const days = Math.max(
    MIN_REVIEW_DAYS,
    Math.min(MAX_REVIEW_DAYS, Math.round(input.reviewInDays ?? DEFAULT_REVIEW_DAYS)),
  );
  const reviewOn = input.reviewInDays === null ? null : addDays(utcMidnight(today), days);

  if (input.resolves) {
    await prisma.coachDecision.updateMany({
      where: { id: input.resolves, userId },
      data: { outcome: (input.outcome ?? "Reviewed").trim().slice(0, MAX_SUMMARY) },
    });
  }

  const row = await prisma.coachDecision.create({
    data: {
      userId,
      kind: input.kind,
      summary,
      detail: input.detail == null ? undefined : (input.detail as Prisma.InputJsonValue),
      topic,
      reviewOn,
    },
    select: {
      id: true,
      kind: true,
      summary: true,
      topic: true,
      reviewOn: true,
      outcome: true,
      createdAt: true,
    },
  });
  return serialize(row);
}

export async function listDecisions(userId: string, limit = 20): Promise<CoachDecisionRow[]> {
  const rows = await prisma.coachDecision.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(100, Math.round(limit))),
    select: {
      id: true,
      kind: true,
      summary: true,
      topic: true,
      reviewOn: true,
      outcome: true,
      createdAt: true,
    },
  });
  return rows.map(serialize);
}

export async function clearDecisions(userId: string): Promise<void> {
  await prisma.coachDecision.deleteMany({ where: { userId } });
}

/**
 * The DECISIONS block for the athlete context. Overdue items are called out so the
 * coach knows what to follow up on rather than re-advising from scratch.
 */
export async function decisionsContext(
  userId: string,
  today: string,
  limit = CONTEXT_LIMIT,
): Promise<string | null> {
  let rows: {
    summary: string;
    topic: string | null;
    reviewOn: Date | null;
    outcome: string | null;
    createdAt: Date;
  }[];
  try {
    rows = await prisma.coachDecision.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { summary: true, topic: true, reviewOn: true, outcome: true, createdAt: true },
    });
  } catch {
    // The ledger must never be able to break a coach turn.
    return null;
  }
  if (rows.length === 0) return null;

  const todayDate = utcMidnight(today);
  const parts = rows.map((row) => {
    const review = row.outcome
      ? `outcome: ${row.outcome}`
      : row.reviewOn == null
        ? null
        : row.reviewOn <= todayDate
          ? `review was due ${isoDate(row.reviewOn)} — follow up`
          : `review ${isoDate(row.reviewOn)}`;
    return [`${isoDate(row.createdAt)} — ${row.summary}`, row.topic, review]
      .filter(Boolean)
      .join(", ");
  });
  return `DECISIONS (most recent first): ${parts.join("; ")}`;
}

const PHYSIQUE_ASSESSMENT_MAX = 600;

/**
 * The latest body-photo read. The image is never stored, so this text is what
 * lets the coach compare check-ins months apart.
 */
export async function physiqueContext(userId: string): Promise<string | null> {
  let row: { summary: string; detail: unknown; createdAt: Date } | null = null;
  try {
    row = await prisma.coachDecision.findFirst({
      where: { userId, kind: "physique" },
      orderBy: { createdAt: "desc" },
      select: { summary: true, detail: true, createdAt: true },
    });
  } catch {
    return null;
  }
  if (!row) return null;

  const detail = (row.detail ?? {}) as { assessment?: unknown; recommendations?: unknown };
  const assessment = typeof detail.assessment === "string" ? detail.assessment.trim() : "";
  const body = assessment
    ? ` — ${
        assessment.length > PHYSIQUE_ASSESSMENT_MAX
          ? `${assessment.slice(0, PHYSIQUE_ASSESSMENT_MAX)}…`
          : assessment
      }`
    : "";
  // The weekly check-in's concrete priorities travel with the decision so the
  // chat coach can follow them up without re-reading the photo.
  const priorities = Array.isArray(detail.recommendations)
    ? detail.recommendations
        .flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const item = entry as Record<string, unknown>;
          return typeof item.action === "string" && item.action.trim()
            ? [`${typeof item.area === "string" ? `${item.area}: ` : ""}${item.action.trim()}`]
            : [];
        })
        .slice(0, 3)
    : [];
  const priorityLine =
    priorities.length > 0 ? ` — priorities: ${priorities.join("; ")}` : "";
  return `PHYSIQUE (last check-in ${isoDate(row.createdAt)}): ${row.summary}${body}${priorityLine}`;
}
