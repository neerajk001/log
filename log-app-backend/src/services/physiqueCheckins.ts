import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import {
  analyzePhysiqueCheckin,
  buildAthleteContext,
  type PhysiqueRecommendation,
  type PhysiqueRecommendationArea,
} from "./coach";
import { recordDecision } from "./coachDecisions";
import {
  decryptImage,
  encryptImage,
  isPhysiqueEncryptionConfigured,
} from "./physiqueImage";
import { physiqueWeekStart } from "./physiqueWeeks";

export { physiqueWeekStart };

export interface PhysiqueCheckinRow {
  id: string;
  date: string;
  week_start_date: string;
  headline: string;
  assessment: string;
  recommendations: PhysiqueRecommendation[];
  previous_checkin_id: string | null;
  image_bytes: number;
  created_at: string;
  updated_at: string;
}

const checkinSelect = {
  id: true,
  date: true,
  weekStartDate: true,
  headline: true,
  assessment: true,
  recommendations: true,
  previousCheckinId: true,
  imageBytes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PhysiqueCheckinSelect;

type CheckinRecord = {
  id: string;
  date: Date;
  weekStartDate: Date;
  headline: string;
  assessment: string;
  recommendations: Prisma.JsonValue;
  previousCheckinId: string | null;
  imageBytes: number;
  createdAt: Date;
  updatedAt: Date;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function recommendationsOf(value: Prisma.JsonValue): PhysiqueRecommendation[] {
  if (!Array.isArray(value)) return [];
  const areas = new Set<PhysiqueRecommendationArea>(["training", "nutrition", "recovery"]);
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const area = item.area;
    if (typeof area !== "string" || !areas.has(area as PhysiqueRecommendationArea)) return [];
    if (typeof item.action !== "string" || !item.action.trim()) return [];
    return [
      {
        area: area as PhysiqueRecommendationArea,
        action: item.action,
        reason: typeof item.reason === "string" ? item.reason : "",
      },
    ];
  });
}

export function serializePhysiqueCheckin(row: CheckinRecord): PhysiqueCheckinRow {
  return {
    id: row.id,
    date: isoDate(row.date),
    week_start_date: isoDate(row.weekStartDate),
    headline: row.headline,
    assessment: row.assessment,
    recommendations: recommendationsOf(row.recommendations),
    previous_checkin_id: row.previousCheckinId,
    image_bytes: row.imageBytes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Newest first. Kept until the athlete deletes; no silent expiry. */
export async function listPhysiqueCheckins(userId: string): Promise<PhysiqueCheckinRow[]> {
  const rows = await prisma.physiqueCheckin.findMany({
    where: { userId },
    orderBy: { weekStartDate: "desc" },
    select: checkinSelect,
  });
  return rows.map(serializePhysiqueCheckin);
}

/**
 * One check-in per ISO week. Re-uploading within the same week replaces that
 * week's photo and read (the comparison is always week-vs-week). The previous
 * week's image is decrypted only for the model call; the new image is encrypted
 * before it touches the database. Nothing is stored if the analysis fails.
 */
export async function createPhysiqueCheckin(
  userId: string,
  input: {
    image: Buffer;
    mimeType: string;
    localDate?: string;
    consent: boolean;
  },
): Promise<PhysiqueCheckinRow> {
  if (!input.consent) {
    throw new AppError(
      400,
      "CONSENT_REQUIRED",
      "Confirm that the photo may be stored encrypted before saving it.",
    );
  }
  if (!isPhysiqueEncryptionConfigured()) {
    throw new AppError(
      503,
      "PHYSIQUE_UNAVAILABLE",
      "Weekly physique check-ins aren't available right now.",
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const date =
    input.localDate && isCalendarDate(input.localDate) ? input.localDate : today;
  const weekStart = physiqueWeekStart(date);
  const weekStartDate = new Date(`${weekStart}T00:00:00Z`);

  const [existing, previousRow, context] = await Promise.all([
    prisma.physiqueCheckin.findUnique({
      where: { userId_weekStartDate: { userId, weekStartDate } },
      select: { id: true },
    }),
    prisma.physiqueCheckin.findFirst({
      where: { userId, weekStartDate: { lt: weekStartDate } },
      orderBy: { weekStartDate: "desc" },
      select: {
        id: true,
        date: true,
        mimeType: true,
        imageCiphertext: true,
        imageIv: true,
        imageTag: true,
      },
    }),
    buildAthleteContext(userId, date),
  ]);

  const previous = previousRow
    ? {
        buffer: decryptImage({
          ciphertext: Buffer.from(previousRow.imageCiphertext),
          iv: Buffer.from(previousRow.imageIv),
          tag: Buffer.from(previousRow.imageTag),
        }),
        mimeType: previousRow.mimeType,
        date: isoDate(previousRow.date),
      }
    : null;

  const reading = await analyzePhysiqueCheckin(
    { buffer: input.image, mimeType: input.mimeType },
    previous,
    context,
  );

  const encrypted = encryptImage(input.image);
  const data = {
    date: new Date(`${date}T00:00:00Z`),
    weekStartDate,
    mimeType: input.mimeType,
    imageCiphertext: encrypted.ciphertext,
    imageIv: encrypted.iv,
    imageTag: encrypted.tag,
    imageBytes: input.image.length,
    headline: reading.headline,
    assessment: reading.assessment,
    recommendations: reading.recommendations as unknown as Prisma.InputJsonValue,
    previousCheckinId: previousRow?.id ?? null,
  };

  const row = existing
    ? await prisma.physiqueCheckin.update({
        where: { id: existing.id },
        data,
        select: checkinSelect,
      })
    : await prisma.physiqueCheckin.create({
        data: { userId, ...data },
        select: checkinSelect,
      });

  // Let the chat coach follow this up next week. A failure here must not lose
  // the check-in the athlete just saved.
  try {
    await recordDecision(
      userId,
      {
        kind: "physique",
        topic: "other",
        summary: reading.headline,
        detail: {
          assessment: reading.assessment,
          recommendations: reading.recommendations,
        },
        reviewInDays: 7,
      },
      date,
    );
  } catch {
    // best-effort
  }

  return serializePhysiqueCheckin(row);
}

/** The owner-only encrypted image, decrypted in memory for this response. */
export async function getPhysiqueCheckinImage(
  userId: string,
  id: string,
): Promise<{ buffer: Buffer; mimeType: string; updatedAt: string } | null> {
  const row = await prisma.physiqueCheckin.findFirst({
    where: { id, userId },
    select: {
      mimeType: true,
      imageCiphertext: true,
      imageIv: true,
      imageTag: true,
      updatedAt: true,
    },
  });
  if (!row) return null;
  return {
    buffer: decryptImage({
      ciphertext: Buffer.from(row.imageCiphertext),
      iv: Buffer.from(row.imageIv),
      tag: Buffer.from(row.imageTag),
    }),
    mimeType: row.mimeType,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deletePhysiqueCheckin(userId: string, id: string): Promise<boolean> {
  const result = await prisma.physiqueCheckin.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export async function deleteAllPhysiqueCheckins(userId: string): Promise<number> {
  const result = await prisma.physiqueCheckin.deleteMany({ where: { userId } });
  return result.count;
}
