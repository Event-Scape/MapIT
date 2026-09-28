-- Event PDF attachments. Run in Supabase SQL Editor after schema.sql.
-- Creates a public bucket and allows anon read/upload (demo; tighten for production).

insert into storage.buckets (id, name, public)
values ('event-files', 'event-files', true)
on conflict (id) do nothing;

drop policy if exists "event_files_select" on storage.objects;
create policy "event_files_select" on storage.objects for select using (bucket_id = 'event-files');

drop policy if exists "event_files_insert" on storage.objects;
create policy "event_files_insert" on storage.objects for insert with check (bucket_id = 'event-files');
