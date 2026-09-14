insert into storage.buckets (id, name, public, file_size_limit)
values
  ('attachments', 'attachments', false, 26214400),
  ('data-jobs', 'data-jobs', false, 262144000)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create policy attachments_storage_owner_select
on storage.objects for select to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_storage_owner_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_storage_owner_update
on storage.objects for update to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_storage_owner_delete
on storage.objects for delete to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy jobs_storage_owner_select
on storage.objects for select to authenticated
using (bucket_id = 'data-jobs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy jobs_storage_owner_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'data-jobs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy jobs_storage_owner_delete
on storage.objects for delete to authenticated
using (bucket_id = 'data-jobs' and (storage.foldername(name))[1] = (select auth.uid())::text);
