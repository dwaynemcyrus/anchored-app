Below is a **clean, canonical summary** of all the data types we’ve discussed, what they are for, and where they live. This is the map you keep returning to when you feel tempted to blur boundaries.

---

# Anchored OS — Data Model Summary

## 1. Documents (core identity & content)

**Purpose**
Anything you *read, write, link, search, tag, or archive*.

**Lives in**

* `documents`
* `document_bodies`

**Examples**

* Notes
* Tasks (as items)
* Projects
* Journals
* Essays
* Captures
* Reviews

**Key idea**

> One document = one logical thing.

### `documents` (metadata)

* `id`
* `user_id`
* `type` (note | task | project | capture)
* `subtype` (journal | essay | meeting | …)
* `title`
* `status` (active | done | archived | trash)
* `created_at`
* `updated_at`
* `version` (int, optimistic concurrency)
* tags live in `frontmatter.tags`
* optional promoted fields (due_at, priority, published_at, etc.)

### `document_bodies` (content)

* `document_id`
* `content` (markdown)
* `updated_at`

**Rule**

* Big markdown (≈3k+ words) always lives here
* Fetch only on open

---

## 2. Task Structure (task-only behavior)

Tasks stay in `documents`, but their **structure** lives elsewhere.

### Checklists

**Purpose:** subtasks within a task

**Lives in**

* `checklist_items`

Fields:

* `id`
* `user_id`
* `task_id → documents.id`
* `text`
* `is_done`
* `sort_order`
* timestamps

---

### Dependencies

**Purpose:** task → task relationships (blocked-by)

**Lives in**

* `task_dependencies`

Fields:

* `task_id`
* `depends_on_task_id`
* `user_id`
* optional `type`

---

## 3. Time Logs (behavior over time)

**Purpose**
Track how time is spent on things.

**Lives in**

* `time_entries`

**Examples**

* Stopwatch on tasks
* Deep work sessions
* Activity tracking

Fields:

* `id`
* `user_id`
* `entity_id` (task doc, project doc, habit, activity)
* `entity_type`
* `started_at`
* `ended_at`
* `duration_ms`
* optional `note`, `source`

**Rule**

* Append-only
* One running timer per user (v1)

---

## 4. Habits (repeating systems + logs)

**Purpose**
Track recurring behaviors with streaks and history.

### Habit definition

**Lives in**

* `habits`

Fields:

* `id`
* `user_id`
* `name`
* `status`
* `cadence`
* `target`
* `schedule` (jsonb)
* timestamps

### Habit logs

**Lives in**

* `habit_logs`

Fields:

* `habit_id`
* `date`
* `value`
* `is_complete`
* optional `note`

**Rule**

* Habits are **not documents**
* Notes *about* habits are documents

---

## 5. Subtypes & Custom Fields

**Purpose**
Different note collections with unique needs.

**Approach**

* `type` + `subtype`
* `meta jsonb` for rare/experimental fields
* Promote fields to real columns when frequently queried

Examples:

* Journal: mood, energy
* Essay: stage, canonical_slug, published_at

---

## 6. Activities (optional)

**Purpose**
Track time for non-document things.

**Lives in**

* `activities` (optional)
* referenced by `time_entries`

Examples:

* Reading
* Gym
* Deep Work

---

## The Golden Rules (pin this)

1. **Documents = things you think/write about**
2. **Tables = behavior, repetition, or relationships**
3. **Time-series data always gets its own table**
4. **JSON is for flexibility, columns are for importance**
5. **Split big markdown from metadata**
6. **One identity, many attachments**

---

## One-line mental model

> Documents are nouns.
> Tables are verbs and relationships.

This summary is now your architectural north star.
