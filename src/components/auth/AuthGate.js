"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAuthUser } from "../../lib/supabase/auth";
import styles from "./AuthGate.module.css";

const PUBLIC_ROUTES = new Set(["/login"]);

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      if (PUBLIC_ROUTES.has(pathname)) {
        setStatus("ready");
        return;
      }
      try {
        const user = await getAuthUser();
        if (!active) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        router.replace("/login");
      }
    }

    checkAuth();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (status !== "ready" && !PUBLIC_ROUTES.has(pathname)) {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>Checking session…</div>
      </div>
    );
  }

  return children;
}
