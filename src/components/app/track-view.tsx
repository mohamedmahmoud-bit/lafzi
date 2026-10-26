"use client";

import { useEffect, useRef } from "react";
import { trackClientEvent } from "@/features/analytics/actions";

/** Reports that a CTA actually rendered for the student (denominator of the Noon CTR metric). */
export function TrackView({
  event,
  props,
}: {
  event: "noon_heatmap_cta_viewed";
  props?: Record<string, string>;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void trackClientEvent({ name: event, props });
  }, [event, props]);
  return null;
}
