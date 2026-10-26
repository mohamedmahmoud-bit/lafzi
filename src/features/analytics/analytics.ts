import "server-only";
import { getDb } from "@/db/client";
import { analyticsEvents } from "@/db/schema";
import { learningDay } from "@/lib/time";
import type { AnalyticsEventName } from "./events";

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  userId: string | null;
  properties: Record<string, unknown>;
  occurredAt: Date;
};

/** Implement this to plug in a provider (Amplitude, Segment, PostHog, Kinesis…). */
export interface AnalyticsSink {
  readonly id: string;
  track(event: AnalyticsEvent): Promise<void>;
}

/** Internal sink — powers the admin metrics (DAU, retention, Noon CTR…). */
const dbSink: AnalyticsSink = {
  id: "db",
  async track(e) {
    await getDb()
      .insert(analyticsEvents)
      .values({
        userId: e.userId,
        name: e.name,
        properties: e.properties,
        day: learningDay(e.occurredAt),
        occurredAt: e.occurredAt,
      });
  },
};

const consoleSink: AnalyticsSink = {
  id: "console",
  async track(e) {
    console.info(`[analytics] ${e.name}`, JSON.stringify({ userId: e.userId, ...e.properties }));
  },
};

const registry: Record<string, AnalyticsSink> = { db: dbSink, console: consoleSink };

function activeSinks(): AnalyticsSink[] {
  return (process.env.ANALYTICS_SINKS ?? "db")
    .split(",")
    .map((s) => registry[s.trim()])
    .filter(Boolean);
}

export const analytics = {
  /** Fire-and-forget safe: analytics failures never break the learning flow. */
  async track(
    name: AnalyticsEventName,
    properties: Record<string, unknown> = {},
    ctx: { userId?: string | null } = {},
  ): Promise<void> {
    const event: AnalyticsEvent = {
      name,
      userId: ctx.userId ?? null,
      properties,
      occurredAt: new Date(),
    };
    await Promise.all(
      activeSinks().map((s) =>
        s.track(event).catch((err) => console.error(`[analytics:${s.id}] failed`, err)),
      ),
    );
  },
  registerSink(sink: AnalyticsSink) {
    registry[sink.id] = sink;
  },
};
