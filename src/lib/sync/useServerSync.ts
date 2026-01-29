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
    onError: (error) => {
      console.error("Initial sync failed", error);
    },
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
    retry: false,
    refetchInterval: enabled ? pollIntervalMs : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return { initialSync };
}
