# Migration 0007 — Time Entry Leases

Purpose: Add device lease fields to time entries for conflict-aware timers.

## Changes
### time_entries
- add `client_id` (text, not null)
- add `lease_expires_at` (timestamptz, null)
- add `lease_token` (uuid, null)

## Indexes
- time_entries_running_idx on (`user_id`, `ended_at`, `lease_expires_at`)

## Notes
- Lease duration is enforced in app logic (2 minutes default).
- Takeover updates `client_id` and `lease_expires_at`, optionally rotating `lease_token`.
