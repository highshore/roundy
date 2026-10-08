-- Copyright-safe, human-reviewed photo library for Roundy's existing marketing pipeline.
-- The old AI/uploaded paths continue to work unchanged.
alter table public.instagram_post_drafts
  drop constraint if exists instagram_post_drafts_visual_source_check;
alter table public.instagram_post_drafts
  add constraint instagram_post_drafts_visual_source_check
  check (visual_source in ('auto_ai','uploaded','none','pexels'));

create table if not exists public.marketing_photo_assets (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'pexels' check (provider = 'pexels'),
  provider_photo_id text not null check (provider_photo_id ~ '^[0-9]{1,20}$'),
  source_url text not null,
  image_url text not null,
  preview_url text not null,
  photographer text not null,
  photographer_url text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  topic_key text not null check (length(topic_key) between 2 and 80),
  license_name text not null default 'Pexels License',
  license_url text not null default 'https://www.pexels.com/license/',
  license_checked_at timestamptz not null default now(),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  storage_path text unique,
  content_sha256 text,
  perceptual_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_photo_id),
  constraint approved_marketing_photo_has_archive check (
    review_status <> 'approved' or
    (reviewed_at is not null and storage_path is not null and content_sha256 is not null and perceptual_hash is not null)
  )
);
create index if not exists marketing_photo_assets_topic_status_idx
  on public.marketing_photo_assets(topic_key,review_status,created_at desc);

create table if not exists public.marketing_draft_photos (
  draft_id uuid not null references public.instagram_post_drafts(id) on delete cascade,
  asset_id uuid not null references public.marketing_photo_assets(id) on delete restrict,
  slot integer not null check (slot between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (draft_id,slot),
  unique (draft_id,asset_id)
);
create index if not exists marketing_draft_photos_asset_recent_idx
  on public.marketing_draft_photos(asset_id,created_at desc);

alter table public.marketing_photo_assets enable row level security;
alter table public.marketing_draft_photos enable row level security;
revoke all on public.marketing_photo_assets from public,anon,authenticated;
revoke all on public.marketing_draft_photos from public,anon,authenticated;
grant all on public.marketing_photo_assets to service_role;
grant all on public.marketing_draft_photos to service_role;

-- Defense in depth: even if a caller bypasses the admin UI, a Pexels draft
-- cannot be approved/scheduled/published with unreviewed or missing photos.
create or replace function public.guard_marketing_stock_photo_publication()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  selected_count integer;
  invalid_count integer;
begin
  if new.visual_source = 'pexels'
     and new.status in ('approved','scheduled','publishing','published')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    select count(*),count(*) filter (
      where a.review_status <> 'approved' or a.storage_path is null
    ) into selected_count,invalid_count
    from public.marketing_draft_photos p
    join public.marketing_photo_assets a on a.id = p.asset_id
    where p.draft_id = new.id;
    if selected_count < 2 or selected_count > 3 or invalid_count <> 0
       or coalesce(array_length(new.images,1),0) < 2 then
      raise exception 'STOCK_PHOTOS_NOT_APPROVED_OR_RENDERED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_marketing_stock_photo_publication()
from public,anon,authenticated;
drop trigger if exists guard_marketing_stock_photo_publication on public.instagram_post_drafts;
create trigger guard_marketing_stock_photo_publication
before insert or update of status on public.instagram_post_drafts
for each row execute function public.guard_marketing_stock_photo_publication();

comment on table public.marketing_photo_assets is
'Pexels source/license evidence and single-approval immutable image archive. Only service-role admin API can access.';
comment on table public.marketing_draft_photos is
'Exactly assigned photo slots per Roundy marketing draft; reuse is tracked for 90-day cooldown.';
