## Triage first (so you stop guessing)

**Goal:** isolate whether you have a *conflict model problem*, a *realtime/subscription problem*, or a *local-write queue problem*.

### 1) Identify the failure mode (pick the closest)

* **A. “Changes don’t show up on other devices”** → realtime/subscription or RLS not allowing changes through.
* **B. “Changes show up but then revert / duplicate / fork”** → conflict resolution + versioning problem.
* **C. “Offline edits never reconcile cleanly”** → local outbox + idempotency + ordering problem.
* **D. “Random missing fields / partial docs”** → row shape/schema merging + last-write-wins mistakes.

If you don’t know, instrument it (below) and the logs will tell you in 5 minutes.

---

## The most common root cause (and the fix)

### You’re likely missing a **single authoritative sync contract**

You need all of these, consistently:

1. **Stable IDs** (uuid) per doc
2. **Monotonic change markers** per doc (choose ONE):

   * `version` (int, increment on every write) **recommended**
   * or `updated_at` (server timestamp) *only if you never rely on client time*
3. **Idempotent writes** (same change applied twice results in same state)
4. **Conflict rule** (what wins when two devices edit same doc)
5. **Outbox** (local queue of pending writes, retryable)
6. **Single “pull” shape** (a canonical row you can hydrate from)

If any piece is missing, sync becomes “sometimes works”.

---

## Hard rule: Supabase cannot be your “near-instant, zero-glitch” source of truth *unless* you accept constraints

If you want *instant + reliable* across devices:

### Option 1 (recommended): **Local-first, server as sync hub**

* Write locally immediately (UI never waits)
* Push mutations to Supabase (outbox)
* Pull remote changes via realtime + periodic reconcile
* Handle conflicts deterministically (version)

This is how you get “feels instant” on the device and “eventually consistent” across devices without glitches.

### Option 2: **Server-first**

* Every edit hits Supabase first, UI waits/optimistically updates
* You must handle latency, retries, and “pending” UI states
* Offline becomes painful or impossible

Given you already built local-first behavior, trying to force server-first usually creates the glitches you’re describing.

---

## Minimal schema that stops most sync pain

In your `documents` table:

* `id uuid primary key`
* `body text`
* `title text`
* `deleted_at timestamptz null`
* `created_at timestamptz default now()`
* `updated_at timestamptz default now()`
* `version bigint default 0`  ✅ (increment on every update)
* `updated_by text` (device_id or user_id)
* `last_mutation_id uuid` ✅ (for idempotency)

Then enforce:

* Update uses a conditional: `WHERE id = $id AND version = $expectedVersion`
* On success: `version = version + 1`, set `last_mutation_id = $mutationId`

If update fails (0 rows updated): conflict. Then you pull latest, merge, retry.

This eliminates “revert” and “fork” behavior.

---

## Realtime: the easy-to-miss gotchas

1. **RLS can block realtime visibility.** If you can’t “see” changes you should, it’s often policy.
2. **Subscriptions should not re-apply your own local change blindly.**

   * If you push a mutation and then receive it back via realtime, dedupe using `last_mutation_id` or `updated_by`.
3. **Don’t rely on client timestamps** for ordering across devices.

---

## Instrumentation you should add today (no debate)

Create a `sync_log` table locally (IndexedDB) and log:

* `event`: local_write | enqueue | push_start | push_ok | push_fail | pull_start | pull_ok | apply_remote | conflict
* `doc_id`
* `mutation_id`
* `local_version_before/after`
* `remote_version_before/after` (when known)
* `error_code/message`
* `ts` (local)

Without this, you’re blind.

---

## What to do next (action list)

### Step 1: Force one write path

* UI edits → **local apply** → enqueue mutation
* Background worker pushes queue

### Step 2: Add version + mutation_id

* Implement optimistic concurrency (`version` check)
* Implement dedupe on inbound realtime

### Step 3: Add reconcile loop

* On app open, on reconnect, and every N minutes:

  * Pull remote docs changed since last cursor
  * Apply remote updates only if newer version

### Step 4: Test with a brutal scenario

* Device A offline edits doc X 5 times
* Device B online edits same doc 2 times
* Bring A online
* You should see either:

  * deterministic conflict resolution, or
  * explicit conflict state requiring manual merge
    Not silent corruption.

---

## If you answer one thing, answer this

When you say “struggling to sync,” which is happening?

* **Not showing up on other device**
* **Shows up then reverts**
* **Duplicates/forks**
* **Offline edits break**
* **Other (describe in 1 sentence)**

Even a single sentence will let me tell you the correct fix path.
