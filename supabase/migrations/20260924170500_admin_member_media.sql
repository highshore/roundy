begin;

drop policy if exists wis_photo_admin_read on storage.objects;
create policy wis_photo_admin_read on storage.objects for select to authenticated
using (bucket_id='wis-profile-photos' and (select public.wis_is_admin()));

commit;
