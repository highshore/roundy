-- Every externally sourced image must retain its provider, creator and original
-- landing URL in the final Instagram caption, even for CC0/public-domain photos.
-- Additive defense in depth; neither assets nor prior approvals are rewritten.
begin;

create or replace function roundy_private.marketing_photo_caption_sources_valid(
  p_draft uuid,p_caption text
) returns boolean language sql stable security invoker set search_path='' as $$
 select not exists(
  select 1 from public.marketing_draft_photos assigned
  join public.marketing_photo_assets photo on photo.id=assigned.asset_id
  where assigned.draft_id=p_draft
   and (
    nullif(trim(photo.source_url),'') is null
    or nullif(trim(photo.photographer),'') is null
    or position(photo.source_url in coalesce(p_caption,''))=0
    or position(photo.photographer in coalesce(p_caption,''))=0
    or position((case photo.provider
      when 'pexels' then 'Pexels'
      when 'unsplash' then 'Unsplash'
      when 'pixabay' then 'Pixabay'
      when 'wikimedia' then 'Wikimedia Commons'
      when 'openverse' then 'Openverse (Wikimedia Commons)'
      else 'UNKNOWN PHOTO PROVIDER' end) in coalesce(p_caption,''))=0
    or (photo.attribution_required=true and (
      nullif(trim(photo.license_name),'') is null
      or nullif(trim(photo.license_url),'') is null
      or position(photo.license_name in coalesce(p_caption,''))=0
      or position(photo.license_url in coalesce(p_caption,''))=0
      or position('(cropped and text overlaid)' in coalesce(p_caption,''))=0
    ))
   )
 );
$$;
revoke all on function roundy_private.marketing_photo_caption_sources_valid(uuid,text)
 from public,anon,authenticated;
grant execute on function roundy_private.marketing_photo_caption_sources_valid(uuid,text)
 to service_role;

create or replace function roundy_private.guard_marketing_photo_caption_sources()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.visual_source in ('pexels','stock')
  and new.status in ('approved','scheduled','publishing','published')
  and not roundy_private.marketing_photo_caption_sources_valid(new.id,new.caption)
 then
  raise exception 'STOCK_SOURCE_CREDIT_REQUIRED: 발행 캡션에 사진별 원본 링크, 제공처 및 저작자를 포함하세요.';
 end if;
 return new;
end $$;
revoke all on function roundy_private.guard_marketing_photo_caption_sources()
 from public,anon,authenticated;
drop trigger if exists guard_marketing_photo_caption_sources on public.instagram_post_drafts;
create trigger guard_marketing_photo_caption_sources
 before insert or update of caption,status,visual_source on public.instagram_post_drafts
 for each row execute function roundy_private.guard_marketing_photo_caption_sources();

comment on function roundy_private.marketing_photo_caption_sources_valid(uuid,text) is
 'Fail-closed source credits for all approved external photos, including CC0/PDM. CC BY additionally requires license and edit notice.';
commit;
