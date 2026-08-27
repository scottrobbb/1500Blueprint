"use client";

import { useEffect } from "react";
import type {
  StudyActivityKind,
  StudyActivityMetadata,
} from "@/lib/home/continuation-policy";

export function ActivityBeacon({
  kind,
  resourceId,
  metadata,
}: {
  kind: StudyActivityKind;
  resourceId: string;
  metadata?: StudyActivityMetadata;
}) {
  const payload = JSON.stringify({ kind, resourceId, metadata });

  useEffect(() => {
    void fetch("/api/study-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [payload]);

  return null;
}
