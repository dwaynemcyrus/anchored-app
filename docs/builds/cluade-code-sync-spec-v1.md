# PWA Sync System - Build Specification (Revised for Document-Based Architecture)

## Overview

Local-first sync system using a unified `documents` table with separate `document_bodies` table for content storage. All entities (notes, tasks, projects, habits, time entries) are documents with a `type` field. Optimized for instant UI updates with background sync.

-----

## Technology Stack

- **Local Storage**: Dexie.js (IndexedDB wrapper)
- **Backend**: Supabase (PostgreSQL + Realtime)
- **Editor**: CodeMirror (already implemented)
- **Deployment**: Vercel
- **Service Worker**: Workbox (for offline support)

-----

## Database Schema

### IndexedDB Schema (Dexie)

```typescript
// src/db/schema.ts
import Dexie, { Table } from 'dexie';

export type DocumentType = 'note' | 'task' | 'project' | 'habit' | 'time_entry';

export interface Document {
  id: string;
  type: DocumentType;
  title: string;
  
  // Task-specific fields
  completed?: boolean;
  completed_at?: string | null;
  due_date?: string | null;
  
  // Habit-specific fields
  completions?: string[]; // Array of ISO date strings
  
  // Time entry-specific fields
  task_id?: string | null;
  start_time?: string;
  end_time?: string | null;
  duration?: number | null; // seconds
  
  // Project-specific fields
  status?: 'active' | 'archived' | 'completed';
  
  // Metadata
  parent_id?: string | null; // For hierarchies (task in project, etc)
  tags?: string[];
  metadata?: Record<string, any>; // Flexible JSON for type-specific data
  
  updated_at: string; // ISO 8601
  synced_at: string | null;
  created_at: string;
  client_id: string;
  
  is_conflict?: boolean;
  original_id?: string;
}

export interface DocumentBody {
  document_id: string; // FK to Document
  content: string; // Markdown content
  updated_at: string;
  synced_at: string | null;
  client_id: string;
}

export interface SyncQueueItem {
  id?: number;
  table: 'documents' | 'document_bodies';
  record_id: string;
  operation: 'upsert' | 'delete';
  payload: any;
  timestamp: string;
  retry_count: number;
}

export class AppDatabase extends Dexie {
  documents!: Table<Document, string>;
  document_bodies!: Table<DocumentBody, string>;
  sync_queue!: Table<SyncQueueItem, number>;

  constructor() {
    super('MyOS');
    this.version(1).stores({
      documents: 'id, type, updated_at, synced_at, parent_id, created_at, is_conflict, [type+completed], [type+due_date], [type+status]',
      document_bodies: 'document_id, updated_at, synced_at',
      sync_queue: '++id, table, record_id, timestamp'
    });
  }
}

export const db = new AppDatabase();
```

### Supabase Schema (PostgreSQL)

```sql
-- migrations/001_document_based_schema.sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Documents table (unified for all document types)
create table documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('note', 'task', 'project', 'habit', 'time_entry')),
  title text not null default 'Untitled',
  
  -- Task-specific fields
  completed boolean,
  completed_at timestamptz,
  due_date timestamptz,
  
  -- Habit-specific fields
  completions jsonb default '[]'::jsonb,
  
  -- Time entry-specific fields
  task_id uuid references documents(id) on delete set null,
  start_time timestamptz,
  end_time timestamptz,
  duration integer, -- seconds
  
  -- Project-specific fields
  status text check (status in ('active', 'archived', 'completed')),
  
  -- Common fields
  parent_id uuid references documents(id) on delete cascade,
  tags text[] default array[]::text[],
  metadata jsonb default '{}'::jsonb,
  
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  client_id text,
  
  constraint documents_user_id_fkey foreign key (user_id) references auth.users(id)
);

-- Document bodies table (separate for content)
create table document_bodies (
  document_id uuid primary key references documents(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  client_id text
);

-- Indexes for performance
create index documents_user_type_idx on documents(user_id, type);
create index documents_user_updated_idx on documents(user_id, updated_at desc);
create index documents_type_completed_idx on documents(type, completed) where type = 'task';
create index documents_type_due_date_idx on documents(type, due_date) where type = 'task';
create index documents_type_status_idx on documents(type, status) where type = 'project';
create index documents_parent_idx on documents(parent_id) where parent_id is not null;
create index documents_task_id_idx on documents(task_id) where task_id is not null;
create index documents_start_time_idx on documents(start_time) where type = 'time_entry';
create index document_bodies_updated_idx on document_bodies(updated_at desc);

-- Enable Row Level Security
alter table documents enable row level security;
alter table document_bodies enable row level security;

-- RLS Policies for documents
create policy "Users can view their own documents"
  on documents for select
  using (auth.uid() = user_id);

create policy "Users can insert their own documents"
  on documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own documents"
  on documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own documents"
  on documents for delete
  using (auth.uid() = user_id);

-- RLS Policies for document_bodies (check via documents table)
create policy "Users can view their own document bodies"
  on document_bodies for select
  using (
    exists (
      select 1 from documents 
      where documents.id = document_bodies.document_id 
      and documents.user_id = auth.uid()
    )
  );

create policy "Users can insert their own document bodies"
  on document_bodies for insert
  with check (
    exists (
      select 1 from documents 
      where documents.id = document_bodies.document_id 
      and documents.user_id = auth.uid()
    )
  );

create policy "Users can update their own document bodies"
  on document_bodies for update
  using (
    exists (
      select 1 from documents 
      where documents.id = document_bodies.document_id 
      and documents.user_id = auth.uid()
    )
  );

create policy "Users can delete their own document bodies"
  on document_bodies for delete
  using (
    exists (
      select 1 from documents 
      where documents.id = document_bodies.document_id 
      and documents.user_id = auth.uid()
    )
  );

-- Functions to automatically update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_documents_updated_at before update on documents
  for each row execute function update_updated_at_column();

create trigger update_document_bodies_updated_at before update on document_bodies
  for each row execute function update_updated_at_column();

-- Function to automatically create document_body for notes/projects
create or replace function create_document_body_for_document()
returns trigger as $$
begin
  if new.type in ('note', 'project') then
    insert into document_bodies (document_id, content, client_id)
    values (new.id, '', new.client_id)
    on conflict (document_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger create_document_body_trigger after insert on documents
  for each row execute function create_document_body_for_document();
```

-----

## Core Sync Implementation

### 1. Client ID Generation (No Changes)

```typescript
// src/lib/clientId.ts

const CLIENT_ID_KEY = 'client_id';

export function getClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  
  return clientId;
}
```

### 2. Supabase Client Setup (No Changes)

```typescript
// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

export async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not authenticated');
  return data.user.id;
}
```

### 3. Sync Manager - Revised for Documents

```typescript
// src/lib/sync/syncManager.ts

import { db, Document, DocumentBody, DocumentType } from '@/db/schema';
import { supabase, getUserId } from '@/lib/supabase';
import { getClientId } from '@/lib/clientId';

type SyncableTable = 'documents' | 'document_bodies';

const CLIENT_ID = getClientId();

// Debounce map for each record
const debouncedSaves = new Map<string, NodeJS.Timeout>();

/**
 * Check if document type has body content
 */
function hasBody(type: DocumentType): boolean {
  return type === 'note' || type === 'project';
}

/**
 * Save document (metadata) and optionally body (content)
 */
export async function saveDocument(
  doc: Omit<Document, 'updated_at' | 'synced_at' | 'client_id' | 'created_at'>,
  content?: string // Only for notes/projects
): Promise<void> {
  const now = new Date().toISOString();
  
  // Get existing document to preserve created_at
  const existingDoc = await db.documents.get(doc.id);
  
  const fullDoc: Document = {
    ...doc,
    updated_at: now,
    synced_at: null,
    client_id: CLIENT_ID,
    created_at: existingDoc?.created_at || now
  };

  // Save document metadata
  await db.documents.put(fullDoc);

  // Save body if provided and document type has body
  if (content !== undefined && hasBody(doc.type)) {
    const body: DocumentBody = {
      document_id: doc.id,
      content,
      updated_at: now,
      synced_at: null,
      client_id: CLIENT_ID
    };
    await db.document_bodies.put(body);
  }

  // Debounce remote sync
  const key = `document:${doc.id}`;
  clearTimeout(debouncedSaves.get(key));
  
  debouncedSaves.set(key, setTimeout(async () => {
    await syncDocumentToSupabase(doc.id);
    debouncedSaves.delete(key);
  }, 800));
}

/**
 * Save only document body (for content updates)
 */
export async function saveDocumentBody(
  documentId: string,
  content: string
): Promise<void> {
  const now = new Date().toISOString();
  
  const body: DocumentBody = {
    document_id: documentId,
    content,
    updated_at: now,
    synced_at: null,
    client_id: CLIENT_ID
  };

  await db.document_bodies.put(body);

  // Debounce remote sync
  const key = `body:${documentId}`;
  clearTimeout(debouncedSaves.get(key));
  
  debouncedSaves.set(key, setTimeout(async () => {
    await syncBodyToSupabase(documentId);
    debouncedSaves.delete(key);
  }, 800));
}

/**
 * Sync document metadata to Supabase
 */
async function syncDocumentToSupabase(documentId: string): Promise<void> {
  const doc = await db.documents.get(documentId);
  if (!doc) return;

  try {
    const userId = await getUserId();
    const payload = {
      ...doc,
      user_id: userId
    };

    const { data, error } = await supabase
      .from('documents')
      .upsert(payload, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    // Check for conflicts
    if (new Date(data.updated_at) > new Date(doc.updated_at)) {
      await handleDocumentConflict(doc, data);
    } else {
      await db.documents.update(documentId, { 
        synced_at: new Date().toISOString() 
      });
    }
  } catch (error) {
    console.error(`Sync failed for document:${documentId}`, error);
    
    await db.sync_queue.add({
      table: 'documents',
      record_id: documentId,
      operation: 'upsert',
      payload: doc,
      timestamp: new Date().toISOString(),
      retry_count: 0
    });
  }
}

/**
 * Sync document body to Supabase
 */
async function syncBodyToSupabase(documentId: string): Promise<void> {
  const body = await db.document_bodies.get(documentId);
  if (!body) return;

  try {
    const { data, error } = await supabase
      .from('document_bodies')
      .upsert(body, {
        onConflict: 'document_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) throw error;

    // Check for conflicts
    if (new Date(data.updated_at) > new Date(body.updated_at)) {
      await handleBodyConflict(documentId, body, data);
    } else {
      await db.document_bodies.update(documentId, { 
        synced_at: new Date().toISOString() 
      });
    }
  } catch (error) {
    console.error(`Sync failed for body:${documentId}`, error);
    
    await db.sync_queue.add({
      table: 'document_bodies',
      record_id: documentId,
      operation: 'upsert',
      payload: body,
      timestamp: new Date().toISOString(),
      retry_count: 0
    });
  }
}

/**
 * Handle document metadata conflicts
 */
async function handleDocumentConflict(
  localDoc: Document,
  remoteDoc: Document
): Promise<void> {
  // For notes/projects with significant metadata, create conflict copy
  if (localDoc.type === 'note' || localDoc.type === 'project') {
    const conflictId = `${localDoc.id}_conflict_${Date.now()}`;
    await db.documents.add({
      ...localDoc,
      id: conflictId,
      is_conflict: true,
      original_id: localDoc.id,
      synced_at: new Date().toISOString()
    });
    
    // Also copy the body if it exists
    const localBody = await db.document_bodies.get(localDoc.id);
    if (localBody) {
      await db.document_bodies.add({
        document_id: conflictId,
        content: localBody.content,
        updated_at: localBody.updated_at,
        synced_at: new Date().toISOString(),
        client_id: localBody.client_id
      });
    }
    
    showConflictNotification('document', localDoc.id, conflictId);
  }
  
  // Accept remote version
  await db.documents.put({
    ...remoteDoc,
    synced_at: new Date().toISOString()
  });
}

/**
 * Handle document body conflicts
 */
async function handleBodyConflict(
  documentId: string,
  localBody: DocumentBody,
  remoteBody: DocumentBody
): Promise<void> {
  // Get document to create conflict copy
  const doc = await db.documents.get(documentId);
  if (!doc) return;
  
  // Create conflict document
  const conflictId = `${documentId}_conflict_${Date.now()}`;
  await db.documents.add({
    ...doc,
    id: conflictId,
    title: `${doc.title} (Conflict)`,
    is_conflict: true,
    original_id: documentId,
    synced_at: new Date().toISOString()
  });
  
  // Create conflict body
  await db.document_bodies.add({
    document_id: conflictId,
    content: localBody.content,
    updated_at: localBody.updated_at,
    synced_at: new Date().toISOString(),
    client_id: localBody.client_id
  });
  
  // Accept remote version
  await db.document_bodies.put({
    ...remoteBody,
    synced_at: new Date().toISOString()
  });
  
  showConflictNotification('body', documentId, conflictId);
}

/**
 * Delete document and its body
 */
export async function deleteDocument(documentId: string): Promise<void> {
  // Delete locally (cascades to body via IndexedDB logic if needed)
  await db.documents.delete(documentId);
  await db.document_bodies.delete(documentId);
  
  // Delete remotely
  try {
    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);
    
    if (docError) throw docError;
    
    // Body will cascade delete in Postgres
  } catch (error) {
    console.error(`Delete failed for document:${documentId}`, error);
    
    await db.sync_queue.add({
      table: 'documents',
      record_id: documentId,
      operation: 'delete',
      payload: null,
      timestamp: new Date().toISOString(),
      retry_count: 0
    });
  }
}

/**
 * Process sync queue (retry failed syncs)
 */
export async function processSyncQueue(): Promise<void> {
  const queueItems = await db.sync_queue
    .where('retry_count')
    .below(5)
    .toArray();
  
  for (const item of queueItems) {
    try {
      if (item.operation === 'upsert') {
        if (item.table === 'documents') {
          await syncDocumentToSupabase(item.record_id);
        } else if (item.table === 'document_bodies') {
          await syncBodyToSupabase(item.record_id);
        }
      } else if (item.operation === 'delete') {
        await supabase
          .from(item.table)
          .delete()
          .eq(item.table === 'documents' ? 'id' : 'document_id', item.record_id);
      }
      
      await db.sync_queue.delete(item.id!);
    } catch (error) {
      await db.sync_queue.update(item.id!, {
        retry_count: item.retry_count + 1
      });
    }
  }
}

// Notification helper
function showConflictNotification(type: string, originalId: string, conflictId: string): void {
  console.warn(`Conflict in ${type}. Original: ${originalId}, Conflict copy: ${conflictId}`);
  // TODO: Implement toast/notification
}
```

### 4. Realtime Sync Setup - Revised

```typescript
// src/lib/sync/realtimeSync.ts

import { RealtimeChannel } from '@supabase/supabase-js';
import { db, Document, DocumentBody } from '@/db/schema';
import { supabase, getUserId } from '@/lib/supabase';
import { getClientId } from '@/lib/clientId';

const CLIENT_ID = getClientId();
const channels: RealtimeChannel[] = [];

/**
 * Setup realtime subscriptions for documents and bodies
 */
export async function setupRealtimeSync(): Promise<void> {
  const userId = await getUserId();
  
  // Subscribe to documents table
  const documentsChannel = supabase
    .channel('documents-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'documents',
        filter: `user_id=eq.${userId}`
      },
      (payload) => handleDocumentChange(payload)
    )
    .subscribe();
  
  channels.push(documentsChannel);
  
  // Subscribe to document_bodies table
  const bodiesChannel = supabase
    .channel('document-bodies-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'document_bodies'
      },
      (payload) => handleBodyChange(payload)
    )
    .subscribe();
  
  channels.push(bodiesChannel);
}

/**
 * Handle incoming document changes
 */
async function handleDocumentChange(payload: any): Promise<void> {
  // Ignore changes from this client
  if (payload.new?.client_id === CLIENT_ID) {
    return;
  }
  
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  if (eventType === 'DELETE') {
    await db.documents.delete(oldRecord.id);
    await db.document_bodies.delete(oldRecord.id);
    notifyRecordDeleted('document', oldRecord.id);
  } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const localDoc = await db.documents.get(newRecord.id);
    
    // Check if local version is newer
    if (localDoc && localDoc.synced_at === null) {
      if (new Date(localDoc.updated_at) > new Date(newRecord.updated_at)) {
        return; // Keep local version
      }
    }
    
    // Accept remote version
    await db.documents.put({
      ...newRecord,
      synced_at: new Date().toISOString()
    });
    
    notifyRecordUpdated('document', newRecord.id);
  }
}

/**
 * Handle incoming body changes
 */
async function handleBodyChange(payload: any): Promise<void> {
  // Ignore changes from this client
  if (payload.new?.client_id === CLIENT_ID) {
    return;
  }
  
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  if (eventType === 'DELETE') {
    await db.document_bodies.delete(oldRecord.document_id);
    notifyRecordDeleted('body', oldRecord.document_id);
  } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const localBody = await db.document_bodies.get(newRecord.document_id);
    
    // Check if local version is newer
    if (localBody && localBody.synced_at === null) {
      if (new Date(localBody.updated_at) > new Date(newRecord.updated_at)) {
        return; // Keep local version
      }
    }
    
    // Accept remote version
    await db.document_bodies.put({
      ...newRecord,
      synced_at: new Date().toISOString()
    });
    
    notifyRecordUpdated('body', newRecord.document_id);
  }
}

/**
 * Cleanup realtime subscriptions
 */
export async function cleanupRealtimeSync(): Promise<void> {
  for (const channel of channels) {
    await supabase.removeChannel(channel);
  }
  channels.length = 0;
}

// Event emitters
function notifyRecordUpdated(type: string, recordId: string): void {
  window.dispatchEvent(new CustomEvent('record-updated', {
    detail: { type, recordId }
  }));
}

function notifyRecordDeleted(type: string, recordId: string): void {
  window.dispatchEvent(new CustomEvent('record-deleted', {
    detail: { type, recordId }
  }));
}
```

### 5. Initial Sync - Revised

```typescript
// src/lib/sync/initialSync.ts

import { db } from '@/db/schema';
import { supabase, getUserId } from '@/lib/supabase';

const LAST_SYNC_KEY = 'last_sync_time';

/**
 * Perform initial sync on app startup
 */
export async function performInitialSync(): Promise<void> {
  const lastSyncTime = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01';
  const userId = await getUserId();
  
  // Sync documents
  await syncDocuments(userId, lastSyncTime);
  
  // Sync document bodies
  await syncDocumentBodies(userId, lastSyncTime);
  
  // Push unsynced changes
  await pushUnsyncedDocuments();
  await pushUnsyncedBodies();
  
  // Update last sync time
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

/**
 * Sync documents from server
 */
async function syncDocuments(userId: string, lastSyncTime: string): Promise<void> {
  const { data: remoteDocuments, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', lastSyncTime)
    .order('updated_at', { ascending: true });
  
  if (error) {
    console.error('Error syncing documents:', error);
    return;
  }
  
  if (!remoteDocuments) return;
  
  for (const remoteDoc of remoteDocuments) {
    const localDoc = await db.documents.get(remoteDoc.id);
    
    if (!localDoc) {
      await db.documents.add({
        ...remoteDoc,
        synced_at: new Date().toISOString()
      });
    } else if (localDoc.synced_at === null) {
      if (new Date(remoteDoc.updated_at) > new Date(localDoc.updated_at)) {
        // Create conflict for notes/projects
        if (remoteDoc.type === 'note' || remoteDoc.type === 'project') {
          const conflictId = `${localDoc.id}_conflict_${Date.now()}`;
          await db.documents.add({
            ...localDoc,
            id: conflictId,
            is_conflict: true,
            original_id: localDoc.id,
            synced_at: new Date().toISOString()
          });
        }
        
        await db.documents.put({
          ...remoteDoc,
          synced_at: new Date().toISOString()
        });
      }
    } else if (new Date(remoteDoc.updated_at) > new Date(localDoc.updated_at)) {
      await db.documents.put({
        ...remoteDoc,
        synced_at: new Date().toISOString()
      });
    }
  }
}

/**
 * Sync document bodies from server
 */
async function syncDocumentBodies(userId: string, lastSyncTime: string): Promise<void> {
  // Get document IDs for this user first
  const { data: userDocs } = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId);
  
  if (!userDocs || userDocs.length === 0) return;
  
  const docIds = userDocs.map(d => d.id);
  
  // Fetch bodies that changed since last sync
  const { data: remoteBodies, error } = await supabase
    .from('document_bodies')
    .select('*')
    .in('document_id', docIds)
    .gt('updated_at', lastSyncTime)
    .order('updated_at', { ascending: true });
  
  if (error) {
    console.error('Error syncing document bodies:', error);
    return;
  }
  
  if (!remoteBodies) return;
  
  for (const remoteBody of remoteBodies) {
    const localBody = await db.document_bodies.get(remoteBody.document_id);
    
    if (!localBody) {
      await db.document_bodies.add({
        ...remoteBody,
        synced_at: new Date().toISOString()
      });
    } else if (localBody.synced_at === null) {
      if (new Date(remoteBody.updated_at) > new Date(localBody.updated_at)) {
        // Create conflict copy
        const doc = await db.documents.get(remoteBody.document_id);
        if (doc) {
          const conflictId = `${doc.id}_conflict_${Date.now()}`;
          await db.documents.add({
            ...doc,
            id: conflictId,
            is_conflict: true,
            original_id: doc.id,
            synced_at: new Date().toISOString()
          });
          await db.document_bodies.add({
            document_id: conflictId,
            content: localBody.content,
            updated_at: localBody.updated_at,
            synced_at: new Date().toISOString(),
            client_id: localBody.client_id
          });
        }
        
        await db.document_bodies.put({
          ...remoteBody,
          synced_at: new Date().toISOString()
        });
      }
    } else if (new Date(remoteBody.updated_at) > new Date(localBody.updated_at)) {
      await db.document_bodies.put({
        ...remoteBody,
        synced_at: new Date().toISOString()
      });
    }
  }
}

/**
 * Push unsynced documents to server
 */
async function pushUnsyncedDocuments(): Promise<void> {
  const unsyncedDocs = await db.documents
    .filter(doc => doc.synced_at === null)
    .toArray();
  
  const userId = await getUserId();
  
  for (const doc of unsyncedDocs) {
    try {
      const { error } = await supabase
        .from('documents')
        .upsert({
          ...doc,
          user_id: userId
        });
      
      if (error) throw error;
      
      await db.documents.update(doc.id, {
        synced_at: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Failed to push document:${doc.id}`, error);
    }
  }
}

/**
 * Push unsynced bodies to server
 */
async function pushUnsyncedBodies(): Promise<void> {
  const unsyncedBodies = await db.document_bodies
    .filter(body => body.synced_at === null)
    .toArray();
  
  for (const body of unsyncedBodies) {
    try {
      const { error } = await supabase
        .from('document_bodies')
        .upsert(body);
      
      if (error) throw error;
      
      await db.document_bodies.update(body.document_id, {
        synced_at: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Failed to push body:${body.document_id}`, error);
    }
  }
}
```

-----

## CodeMirror Integration - Revised

```typescript
// src/components/DocumentEditor.tsx

import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { db, Document, DocumentBody } from '@/db/schema';
import { saveDocument, saveDocumentBody } from '@/lib/sync/syncManager';

interface DocumentEditorProps {
  documentId: string;
}

export function DocumentEditor({ documentId }: DocumentEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [body, setBody] = useState<DocumentBody | null>(null);
  
  // Load document and body from IndexedDB
  useEffect(() => {
    async function loadDocument() {
      const loadedDoc = await db.documents.get(documentId);
      const loadedBody = await db.document_bodies.get(documentId);
      
      if (loadedDoc) {
        setDocument(loadedDoc);
        setBody(loadedBody || null);
      } else {
        // Create new document
        const newDoc: Omit<Document, 'updated_at' | 'synced_at' | 'client_id' | 'created_at'> = {
          id: documentId,
          type: 'note',
          title: 'Untitled'
        };
        await saveDocument(newDoc, '');
        setDocument(await db.documents.get(documentId));
        setBody(await db.document_bodies.get(documentId));
      }
    }
    
    loadDocument();
  }, [documentId]);
  
  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current || !document || !body || viewRef.current) return;
    
    const startState = EditorState.create({
      doc: body.content,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.updateListener.of(async (update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            
            // Save body only (document metadata unchanged)
            await saveDocumentBody(documentId, content);
          }
        })
      ]
    });
    
    const view = new EditorView({
      state: startState,
      parent: editorRef.current
    });
    
    viewRef.current = view;
    
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [document, body, documentId]);
  
  // Listen for external updates from realtime sync
  useEffect(() => {
    const handleUpdate = async (event: CustomEvent) => {
      const { type, recordId } = event.detail;
      
      if (type === 'body' && recordId === documentId && viewRef.current) {
        const updatedBody = await db.document_bodies.get(documentId);
        if (updatedBody) {
          const currentContent = viewRef.current.state.doc.toString();
          if (currentContent !== updatedBody.content) {
            viewRef.current.dispatch({
              changes: {
                from: 0,
                to: currentContent.length,
                insert: updatedBody.content
              }
            });
          }
          setBody(updatedBody);
        }
      }
      
      if (type === 'document' && recordId === documentId) {
        const updatedDoc = await db.documents.get(documentId);
        if (updatedDoc) {
          setDocument(updatedDoc);
        }
      }
    };
    
    window.addEventListener('record-updated', handleUpdate as EventListener);
    
    return () => {
      window.removeEventListener('record-updated', handleUpdate as EventListener);
    };
  }, [documentId]);
  
  if (!document || !body) return <div>Loading...</div>;
  
  return (
    <div className="document-editor">
      <input
        type="text"
        value={document.title}
        onChange={async (e) => {
          const newTitle = e.target.value;
          setDocument({ ...document, title: newTitle });
          
          // Save document metadata (body unchanged)
          await saveDocument({
            ...document,
            title: newTitle
          });
        }}
        className="document-title"
      />
      <div ref={editorRef} className="editor-container" />
    </div>
  );
}
```

-----

## Helper Functions for Document Types

```typescript
// src/lib/documents/helpers.ts

import { db, Document, DocumentType } from '@/db/schema';
import { saveDocument } from '@/lib/sync/syncManager';

/**
 * Create a new document of any type
 */
export async function createDocument(
  type: DocumentType,
  title: string,
  additionalFields?: Partial<Document>
): Promise<string> {
  const id = crypto.randomUUID();
  
  const doc: Omit<Document, 'updated_at' | 'synced_at' | 'client_id' | 'created_at'> = {
    id,
    type,
    title,
    ...additionalFields
  };
  
  // Create body for notes/projects
  const content = type === 'note' || type === 'project' ? '' : undefined;
  
  await saveDocument(doc, content);
  
  return id;
}

/**
 * Get documents by type
 */
export async function getDocumentsByType(
  type: DocumentType,
  filters?: Partial<Document>
): Promise<Document[]> {
  let query = db.documents.where({ type });
  
  if (filters) {
    return query.filter(doc => {
      return Object.entries(filters).every(([key, value]) => {
        return doc[key as keyof Document] === value;
      });
    }).toArray();
  }
  
  return query.toArray();
}

/**
 * Get incomplete tasks
 */
export async function getIncompleteTasks(): Promise<Document[]> {
  return db.documents
    .where({ type: 'task', completed: false })
    .sortBy('due_date');
}

/**
 * Get active projects
 */
export async function getActiveProjects(): Promise<Document[]> {
  return db.documents
    .where({ type: 'project', status: 'active' })
    .sortBy('title');
}

/**
 * Get recent notes
 */
export async function getRecentNotes(limit: number = 10): Promise<Document[]> {
  return db.documents
    .where('type')
    .equals('note')
    .reverse()
    .sortBy('updated_at')
    .then(docs => docs.slice(0, limit));
}

/**
 * Get time entries for date range
 */
export async function getTimeEntries(
  startDate: string,
  endDate: string
): Promise<Document[]> {
  return db.documents
    .where('type')
    .equals('time_entry')
    .and(doc => {
      return doc.start_time! >= startDate && doc.start_time! <= endDate;
    })
    .sortBy('start_time');
}

/**
 * Complete a task
 */
export async function completeTask(taskId: string): Promise<void> {
  const task = await db.documents.get(taskId);
  if (!task || task.type !== 'task') return;
  
  await saveDocument({
    ...task,
    completed: true,
    completed_at: new Date().toISOString()
  });
}

/**
 * Log habit completion
 */
export async function logHabitCompletion(
  habitId: string,
  date: string
): Promise<void> {
  const habit = await db.documents.get(habitId);
  if (!habit || habit.type !== 'habit') return;
  
  const completions = habit.completions || [];
  if (!completions.includes(date)) {
    completions.push(date);
    
    await saveDocument({
      ...habit,
      completions: completions.sort()
    });
  }
}

/**
 * Start time entry
 */
export async function startTimeEntry(
  title: string,
  taskId?: string
): Promise<string> {
  return createDocument('time_entry', title, {
    task_id: taskId || null,
    start_time: new Date().toISOString(),
    end_time: null,
    duration: null
  });
}

/**
 * Stop time entry
 */
export async function stopTimeEntry(entryId: string): Promise<void> {
  const entry = await db.documents.get(entryId);
  if (!entry || entry.type !== 'time_entry') return;
  
  const endTime = new Date();
  const startTime = new Date(entry.start_time!);
  const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
  
  await saveDocument({
    ...entry,
    end_time: endTime.toISOString(),
    duration
  });
}
```

-----

## Service Worker (Minimal Changes)

```typescript
// public/sw.ts

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.origin === 'https://your-supabase-url.supabase.co',
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10
  })
);

registerRoute(
  ({ request }) => request.destination === 'image' || 
                   request.destination === 'font' ||
                   request.destination === 'style',
  new CacheFirst({
    cacheName: 'static-assets'
  })
);

self.addEventListener('sync', async (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  const { db } = await import('./db/schema');
  const { supabase, getUserId } = await import('./lib/supabase');
  
  const queueItems = await db.sync_queue.toArray();
  const userId = await getUserId();
  
  for (const item of queueItems) {
    try {
      if (item.operation === 'upsert') {
        if (item.table === 'documents') {
          await supabase.from('documents').upsert({
            ...item.payload,
            user_id: userId
          });
        } else if (item.table === 'document_bodies') {
          await supabase.from('document_bodies').upsert(item.payload);
        }
      } else if (item.operation === 'delete') {
        const idField = item.table === 'documents' ? 'id' : 'document_id';
        await supabase.from(item.table).delete().eq(idField, item.record_id);
      }
      
      await db.sync_queue.delete(item.id!);
    } catch (error) {
      console.error('Background sync failed:', error);
    }
  }
}
```

-----

## Key Differences Summary

### Schema Changes

1. **Single `documents` table** with `type` field instead of separate tables
2. **Separate `document_bodies` table** for content (only for notes/projects)
3. **Type-specific fields** are nullable and only used by relevant types
4. **Hierarchies supported** via `parent_id` (tasks in projects, etc)

### Sync Logic Changes

1. **Two sync paths**: document metadata and document bodies
2. **Body sync only for notes/projects** (tasks/habits/time_entries have no body)
3. **Separate debounce timers** for documents vs bodies
4. **Conflict resolution** handles both document and body conflicts
5. **Cascade deletes** automatically handled by foreign keys

### Performance Benefits

1. **Smaller payloads**: Only sync body when content changes
2. **Faster queries**: Type-based indexes on single table
3. **Less realtime channels**: Only 2 channels instead of 4+
4. **Efficient updates**: Can update title without syncing entire content

### API Simplification

1. Single `saveDocument()` function for all types
2. Type-specific helpers built on top of generic functions
3. Queries can span multiple types or filter by one
4. Easier to add new document types in future

This architecture is more scalable and efficient for a unified document system!​​​​​​​​​​​​​​​​
