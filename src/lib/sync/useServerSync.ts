"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { performInitialSync } from "./initialSync";
import { initSyncListeners, scheduleSync } from "./syncManager";

type UseServerSyncOptions = {
  enabled?: boolean;
  pollIntervalMs?: number;
};

export function useServerSync(options: UseServerSyncOptions = {}) {
  const { enabled = true, pollIntervalMs = 60000 } = options;
  const hasStartedRef = useRef(false);
  const initialSync = useMutation({
    mutationFn: performInitialSync,
  });

  useEffect(() => {
    if (!enabled || hasStartedRef.current) return;
    hasStartedRef.current = true;
    initSyncListeners();
    initialSync.mutate();
  }, [enabled, initialSync]);

  useQuery({
    queryKey: ["sync", "poll"],
    queryFn: () => scheduleSync({ reason: "react-query" }),
    enabled,
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return { initialSync };
}
