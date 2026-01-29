"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { performInitialSync } from "./initialSync";
import { initSyncListeners, scheduleSync } from "./syncManager";
import { getSupabaseClient } from "../supabase/client";

type UseServerSyncOptions = {
  enabled?: boolean;
  pollIntervalMs?: number;
};

export function useServerSync(options: UseServerSyncOptions = {}) {
  const { enabled = true, pollIntervalMs = 60000 } = options;
  const hasStartedRef = useRef(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const initialSync = useMutation({
    mutationFn: performInitialSync,
    onError: (error) => {
      console.error("Initial sync failed", error);
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const client = getSupabaseClient();
    let active = true;
    const checkAuth = async () => {
      const { data, error } = await client.auth.getUser();
      if (!active) return;
      if (error) {
        console.warn("Supabase auth check failed", error);
        setIsAuthed(false);
        return;
      }
      setIsAuthed(!!data?.user);
    };

    checkAuth();
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsAuthed(!!session?.user);
    });

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isAuthed || hasStartedRef.current) return;
    hasStartedRef.current = true;
    initSyncListeners();
    initialSync.mutate();
  }, [enabled, isAuthed, initialSync]);

  useQuery({
    queryKey: ["sync", "poll"],
    queryFn: () => scheduleSync({ reason: "react-query" }),
    enabled: enabled && isAuthed,
    retry: false,
    refetchInterval: enabled ? pollIntervalMs : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return { initialSync };
}
