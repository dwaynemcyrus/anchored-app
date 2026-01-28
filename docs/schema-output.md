Ran this query to get the current schema...
```sql
select table_name, column_name, data_type,
  is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name in
  ('documents','document_bodies','time_entries','time_en
  try_events','activities')
  order by table_name, ordinal_position;
```
  Results...
```json
[
  {
    "table_name": "document_bodies",
    "column_name": "document_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "document_bodies",
    "column_name": "content",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "document_bodies",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "document_bodies",
    "column_name": "owner_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "document_bodies",
    "column_name": "client_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "document_bodies",
    "column_name": "synced_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "table_name": "documents",
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "subtype",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "status",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": "'active'::text"
  },
  {
    "table_name": "documents",
    "column_name": "frontmatter",
    "data_type": "jsonb",
    "is_nullable": "NO",
    "column_default": "'{}'::jsonb"
  },
  {
    "table_name": "documents",
    "column_name": "due_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "priority",
    "data_type": "integer",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "published_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "documents",
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "table_name": "documents",
    "column_name": "version",
    "data_type": "integer",
    "is_nullable": "NO",
    "column_default": "1"
  },
  {
    "table_name": "documents",
    "column_name": "owner_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "deleted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "client_id",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "table_name": "documents",
    "column_name": "synced_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  }
]
```

***

Ran this query (Indexes)to get the current schema...
```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in
('documents','document_bodies','time_entries','time_en
try_events','activities')
order by tablename, indexname;
```

Results...
```json
[
  {
    "tablename": "document_bodies",
    "indexname": "document_bodies_owner_idx",
    "indexdef": "CREATE INDEX document_bodies_owner_idx ON public.document_bodies USING btree (owner_id)"
  },
  {
    "tablename": "document_bodies",
    "indexname": "document_bodies_owner_synced_idx",
    "indexdef": "CREATE INDEX document_bodies_owner_synced_idx ON public.document_bodies USING btree (owner_id, synced_at)"
  },
  {
    "tablename": "document_bodies",
    "indexname": "document_bodies_pkey",
    "indexdef": "CREATE UNIQUE INDEX document_bodies_pkey ON public.document_bodies USING btree (document_id)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_owner_deleted_idx",
    "indexdef": "CREATE INDEX documents_owner_deleted_idx ON public.documents USING btree (owner_id, deleted_at)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_owner_synced_idx",
    "indexdef": "CREATE INDEX documents_owner_synced_idx ON public.documents USING btree (owner_id, synced_at)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_owner_updated_idx",
    "indexdef": "CREATE INDEX documents_owner_updated_idx ON public.documents USING btree (owner_id, updated_at)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_pkey",
    "indexdef": "CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_status_idx",
    "indexdef": "CREATE INDEX documents_status_idx ON public.documents USING btree (status)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_subtype_idx",
    "indexdef": "CREATE INDEX documents_subtype_idx ON public.documents USING btree (subtype)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_type_idx",
    "indexdef": "CREATE INDEX documents_type_idx ON public.documents USING btree (type)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_updated_at_idx",
    "indexdef": "CREATE INDEX documents_updated_at_idx ON public.documents USING btree (updated_at)"
  },
  {
    "tablename": "documents",
    "indexname": "documents_user_id_idx",
    "indexdef": "CREATE INDEX documents_user_id_idx ON public.documents USING btree (user_id)"
  }
]
```

***

Ran this query (RLS policies) to get the current schema...
```sql
  select tablename, policyname, permissive, roles, cmd,
  qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename in
  ('documents','document_bodies','time_entries','time_en
  try_events','activities')
  order by tablename, policyname;
```

Results...
```json
[
  {
    "tablename": "document_bodies",
    "policyname": "document_bodies_insert_own",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(owner_id = auth.uid())"
  },
  {
    "tablename": "document_bodies",
    "policyname": "document_bodies_select_own",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(owner_id = auth.uid())",
    "with_check": null
  },
  {
    "tablename": "document_bodies",
    "policyname": "document_bodies_update_own",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "(owner_id = auth.uid())",
    "with_check": "(owner_id = auth.uid())"
  },
  {
    "tablename": "documents",
    "policyname": "documents_insert_own",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "INSERT",
    "qual": null,
    "with_check": "(owner_id = auth.uid())"
  },
  {
    "tablename": "documents",
    "policyname": "documents_select_own",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "SELECT",
    "qual": "(owner_id = auth.uid())",
    "with_check": null
  },
  {
    "tablename": "documents",
    "policyname": "documents_update_own",
    "permissive": "PERMISSIVE",
    "roles": "{public}",
    "cmd": "UPDATE",
    "qual": "(owner_id = auth.uid())",
    "with_check": "(owner_id = auth.uid())"
  }
]
```