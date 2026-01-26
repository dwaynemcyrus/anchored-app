# Hybrid Sync + Conflict Copy Checklist

Use this checklist to manually verify hybrid sync behavior without adding new test frameworks.

## Setup
- [ ] `.env.local` contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Supabase project has migration `supabase/migrations/0001_documents.sql` applied
- [ ] You are authenticated in the app (Supabase `auth.getUser()` returns a user)

## Local write + queue (online)
- [ ] Create a new note while online
  - Expect: note appears immediately in list
  - Expect: header shows “Syncing” then “Synced”
  - Supabase: `documents` row + `document_bodies` row exist
- [ ] Edit note body while online
  - Expect: local body updates immediately
  - Supabase: `document_bodies.content` updates

## Offline behavior
- [ ] Toggle browser offline (DevTools)
- [ ] Create a note while offline
  - Expect: note appears immediately
  - Expect: header shows “Offline” or “Queued · 1”
- [ ] Re-enable network
  - Expect: header shows “Syncing” then “Synced”
  - Supabase: new note + body appear

## Conflict handling
- [ ] Open the same note in two tabs
- [ ] Tab A: edit + save
- [ ] Tab B: edit older content + save without reloading
  - Expect: toast “Conflict detected. Created a conflict copy.”
  - Expect: new note titled “(Conflict copy)” appears
  - Supabase: conflict copy inserted as a new document

## Pull / remote changes
- [ ] Modify a document directly in Supabase (e.g., title)
- [ ] Reload app
  - Expect: local list updates with remote change

## Error path
- [ ] Temporarily revoke network or Supabase permissions
  - Expect: header shows “Sync error”
  - Expect: queue remains pending (no data loss)
