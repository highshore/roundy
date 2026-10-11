-- Admin-only, atomic assignments for a licensed-photo / AI mixed carousel.
-- No external Meta calls. Published/scheduled snapshots are never changed.
create or replace function public.set_marketing_draft_ai_slot(
 p_draft uuid,p_revision integer,p_ai_slot integer
) returns public.instagram_post_drafts
language plpgsql security definer set search_path=''
as $$
declare
 d public.instagram_post_drafts;
 n integer;
 policy jsonb;
 allowed integer[];
 current_assets uuid[];
 asset uuid;
 i integer:=1;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_draft for update;
 if not found or d.draft_role<>'candidate' or d.status<>'needs_approval'
   or d.imported_at is null or d.visual_source not in ('stock','pexels')
 then raise exception 'STOCK_DRAFT_NOT_EDITABLE'; end if;
 if d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs
    where draft_id=p_draft and status='running'
    and created_at>now()-interval '5 minutes')
 then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 n:=jsonb_array_length(coalesce(d.carousel_slides,'[]'::jsonb));
 policy:=d.content_document->'photo_sourcing';
 if n not in (3,5) or policy is null or
   coalesce((policy->>'min_real_photos')::integer,0)>3
 then raise exception 'STOCK_PHOTO_POLICY_UNSUPPORTED'; end if;
 if p_ai_slot is not null and (
   n<>5 or p_ai_slot<0 or p_ai_slot>=n-1
   or coalesce((policy->>'min_real_photos')::integer,0)>3
 ) then raise exception 'AI_IMAGE_SLOT_NOT_AVAILABLE'; end if;
 allowed:=array(select slot from generate_series(0,n-2) as slot
   where slot is distinct from p_ai_slot order by slot limit 3);
 if cardinality(allowed)<coalesce((policy->>'min_real_photos')::integer,2)
 then raise exception 'STOCK_PHOTO_MINIMUM_CANNOT_BE_MET'; end if;
 current_assets:=array(select asset_id from public.marketing_draft_photos
   where draft_id=p_draft order by slot);
 -- Reposition the selected, already reviewed images without reselecting at random.
 delete from public.marketing_draft_photos where draft_id=p_draft;
 foreach asset in array current_assets loop
   if i>cardinality(allowed) then exit; end if;
   insert into public.marketing_draft_photos(draft_id,slot,asset_id)
    values(p_draft,allowed[i],asset);
   i:=i+1;
 end loop;
 policy:=jsonb_set(jsonb_set(jsonb_set(policy,'{ai_image_slot}',coalesce(to_jsonb(p_ai_slot),'null'::jsonb),true),
   '{ai_thumbnail_enabled}',to_jsonb(p_ai_slot is not distinct from 0),true),
   '{requested_ai_thumbnail}',to_jsonb(p_ai_slot is not distinct from 0),true);
 update public.instagram_post_drafts set
   content_document=jsonb_set(d.content_document,'{photo_sourcing}',policy,true),
   images='{}'::text[],revision=d.revision+1,updated_at=now()
 where id=p_draft and revision=p_revision returning * into d;
 if not found then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 return d;
end;
$$;
revoke all on function public.set_marketing_draft_ai_slot(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.set_marketing_draft_ai_slot(uuid,integer,integer) to service_role;

create or replace function public.assign_marketing_approved_photo(
 p_draft uuid,p_revision integer,p_slot integer,p_asset uuid
) returns public.instagram_post_drafts
language plpgsql security definer set search_path=''
as $$
declare
 d public.instagram_post_drafts;
 a public.marketing_photo_assets;
 n integer;
 ai_slot integer;
 allowed integer[];
 old_asset uuid;
 linked_count integer;
begin
 perform pg_advisory_xact_lock(70361005);
 select * into d from public.instagram_post_drafts where id=p_draft for update;
 if not found or d.draft_role<>'candidate' or d.status<>'needs_approval'
  or d.imported_at is null or d.visual_source not in ('stock','pexels')
 then raise exception 'STOCK_DRAFT_NOT_EDITABLE'; end if;
 if d.revision<>p_revision then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 if exists(select 1 from public.marketing_generation_jobs where draft_id=p_draft
   and status='running' and created_at>now()-interval '5 minutes')
 then raise exception 'GENERATION_ALREADY_RUNNING'; end if;
 n:=jsonb_array_length(coalesce(d.carousel_slides,'[]'::jsonb));
 if n not in (3,5) or d.content_document->'photo_sourcing' is null
 then raise exception 'STOCK_PHOTO_POLICY_UNSUPPORTED'; end if;
 ai_slot:=case when d.content_document->'photo_sourcing' ? 'ai_image_slot'
  then (d.content_document->'photo_sourcing'->>'ai_image_slot')::integer
  when d.content_document->'photo_sourcing'->>'ai_thumbnail_enabled'='true' then 0
  else null end;
 allowed:=array(select slot from generate_series(0,n-2) as slot
   where slot is distinct from ai_slot order by slot limit 3);
 if p_slot is null or p_slot<>all(allowed)
 then raise exception 'PHOTO_SLOT_NOT_AVAILABLE'; end if;
 select * into a from public.marketing_photo_assets where id=p_asset for share;
 if not found or a.review_status<>'approved' or a.reviewed_at is null
   or a.reviewed_by is null or a.license_checked_at is null
   or a.storage_path is null or a.content_sha256 !~ '^[a-f0-9]{64}$'
   or not roundy_private.marketing_photo_rights_valid(a)
 then raise exception 'PHOTO_ASSET_NOT_APPROVED_FOR_REUSE'; end if;
 select asset_id into old_asset from public.marketing_draft_photos
   where draft_id=p_draft and slot=p_slot;
 if old_asset=p_asset then return d; end if;
 if exists(select 1 from public.marketing_draft_photos
   where draft_id=p_draft and asset_id=p_asset and slot<>p_slot)
 then raise exception 'PHOTO_ALREADY_USED_IN_THIS_CAROUSEL'; end if;
 insert into public.marketing_draft_photos(draft_id,asset_id,slot)
  values(p_draft,p_asset,p_slot)
  on conflict(draft_id,slot) do update set asset_id=excluded.asset_id;
 select count(*) into linked_count from public.marketing_draft_photos where draft_id=p_draft;
 if linked_count>3 then raise exception 'MAX_THREE_REVIEWED_PHOTOS'; end if;
 update public.instagram_post_drafts set
   images='{}'::text[],revision=d.revision+1,updated_at=now()
 where id=p_draft and revision=p_revision returning * into d;
 if not found then raise exception 'DRAFT_CHANGED_REFRESH_FIRST'; end if;
 return d;
end;
$$;
revoke all on function public.assign_marketing_approved_photo(uuid,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.assign_marketing_approved_photo(uuid,integer,integer,uuid) to service_role;
