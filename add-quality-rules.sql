alter table public.listing_comments add column if not exists parent_comment_id uuid references public.listing_comments (id) on delete cascade;

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check check (status in ('draft', 'active', 'hidden', 'removed'));

create or replace function public.require_photo_before_activation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not exists (select 1 from public.listing_media where listing_id = new.id and kind = 'image') then
      raise exception 'At least one item photo is required before publishing a listing.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_requires_photo_on_activation on public.listings;
create trigger listing_requires_photo_on_activation
  before insert or update of status on public.listings
  for each row execute procedure public.require_photo_before_activation();

drop policy if exists "users add comments" on public.listing_comments;
drop policy if exists "customers add top-level comments" on public.listing_comments;
create policy "customers add top-level comments" on public.listing_comments for insert to authenticated with check (author_id = auth.uid() and parent_comment_id is null and exists (select 1 from public.listings where listings.id = listing_comments.listing_id and listings.status = 'active' and listings.seller_id <> auth.uid()));

drop policy if exists "sellers reply to customer comments" on public.listing_comments;
create policy "sellers reply to customer comments" on public.listing_comments for insert to authenticated with check (author_id = auth.uid() and parent_comment_id is not null and exists (select 1 from public.listings where listings.id = listing_comments.listing_id and listings.seller_id = auth.uid()) and exists (select 1 from public.listing_comments as parent_comment where parent_comment.id = listing_comments.parent_comment_id and parent_comment.listing_id = listing_comments.listing_id and parent_comment.author_id <> auth.uid()));
