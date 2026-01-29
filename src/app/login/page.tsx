"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithMagicLink,
  signInWithPassword,
  signUpWithPassword,
} from "../../lib/supabase/auth";
import styles from "./page.module.css";

function getBaseUrl() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (mode === "magic") return true;
    return password.trim().length >= 6;
  }, [email, mode, password]);

  const handleMagicLink = async (event: FormEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const redirectTo = `${getBaseUrl()}/`;
      await signInWithMagicLink({ email, redirectTo });
      setStatus("Magic link sent. Check your email.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send magic link";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handlePassword = async (event: FormEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await signInWithPassword({ email, password });
      router.push("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (event: FormEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await signUpWithPassword({ email, password });
      setStatus("Check your email to confirm your account.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.heading}>
          <h1>Anchored</h1>
          <p>Sign in to sync your workspace.</p>
        </div>

        <div className={styles.toggleRow}>
          <button
            type="button"
            className={`${styles.toggle} ${mode === "password" ? styles.toggleActive : ""}`}
            onClick={() => setMode("password")}
          >
            Email + Password
          </button>
          <button
            type="button"
            className={`${styles.toggle} ${mode === "magic" ? styles.toggleActive : ""}`}
            onClick={() => setMode("magic")}
          >
            Magic Link
          </button>
        </div>

        <form className={styles.form}>
          <label className={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className={styles.input}
            />
          </label>
          {mode === "password" ? (
            <label className={styles.label}>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className={styles.input}
              />
            </label>
          ) : null}

          {error ? <div className={styles.error}>{error}</div> : null}
          {status ? <div className={styles.status}>{status}</div> : null}

          {mode === "magic" ? (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={!canSubmit || busy}
              className={styles.primary}
            >
              {busy ? "Sending..." : "Send magic link"}
            </button>
          ) : (
            <div className={styles.actions}>
              <button
                type="button"
                onClick={handlePassword}
                disabled={!canSubmit || busy}
                className={styles.primary}
              >
                {busy ? "Signing in..." : "Sign in"}
              </button>
              <button
                type="button"
                onClick={handleSignUp}
                disabled={!canSubmit || busy}
                className={styles.secondary}
              >
                Create account
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
