-- BellaBlay Market production schema
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    lower(new.email) = lower('faustinaagyapoma3@gmail.com')
  )
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true);
$$;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  category text not null check (category in ('Fashion', 'Electronics', 'Home & Garden', 'Vehicles', 'Furniture', 'Services', 'Other')),
  price text not null check (char_length(price) between 1 and 30),
  location text not null check (char_length(location) between 2 and 50),
  description text not null check (char_length(description) between 5 and 280),
  specifications text not null check (char_length(specifications) between 2 and 280),
  status text not null default 'active' check (status in ('active', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe migration for projects where the listings table already exists.
alter table public.listings add column if not exists phone text;
alter table public.listings add column if not exists whatsapp text;

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  public_url text not null,
  storage_path text not null unique,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_comments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.listing_comments (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 220),
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_at timestamptz not null default now()
);

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

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists listings_created_at_idx on public.listings (created_at desc);
create index if not exists listing_media_listing_id_idx on public.listing_media (listing_id, position);
create index if not exists comments_listing_id_idx on public.listing_comments (listing_id, created_at desc);
create index if not exists inquiries_seller_id_idx on public.inquiries (seller_id, last_message_at desc);
create index if not exists messages_inquiry_id_idx on public.messages (inquiry_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-media', 'listing-media', true, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = 26214400;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_media enable row level security;
alter table public.listing_comments enable row level security;
alter table public.inquiries enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);

drop policy if exists "active listings are public" on public.listings;
create policy "active listings are public" on public.listings for select using (status = 'active' or seller_id = auth.uid() or public.is_admin());
drop policy if exists "users create own listings" on public.listings;
create policy "users create own listings" on public.listings for insert to authenticated with check (seller_id = auth.uid());
drop policy if exists "sellers and owner manage listings" on public.listings;
create policy "sellers and owner manage listings" on public.listings for update to authenticated using (seller_id = auth.uid() or public.is_admin()) with check (seller_id = auth.uid() or public.is_admin());
drop policy if exists "sellers and owner delete listings" on public.listings;
create policy "sellers and owner delete listings" on public.listings for delete to authenticated using (seller_id = auth.uid() or public.is_admin());

drop policy if exists "listing media follows visible listings" on public.listing_media;
create policy "listing media follows visible listings" on public.listing_media for select using (exists (select 1 from public.listings where listings.id = listing_media.listing_id and (listings.status = 'active' or listings.seller_id = auth.uid() or public.is_admin())));
drop policy if exists "users create own media" on public.listing_media;
create policy "users create own media" on public.listing_media for insert to authenticated with check (owner_id = auth.uid() and exists (select 1 from public.listings where listings.id = listing_media.listing_id and listings.seller_id = auth.uid()));
drop policy if exists "users remove own media" on public.listing_media;
create policy "users remove own media" on public.listing_media for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "comments follow visible listings" on public.listing_comments;
create policy "comments follow visible listings" on public.listing_comments for select using (status = 'active' and exists (select 1 from public.listings where listings.id = listing_comments.listing_id and listings.status = 'active') or public.is_admin() or author_id = auth.uid());
drop policy if exists "users add comments" on public.listing_comments;
drop policy if exists "customers add top-level comments" on public.listing_comments;
create policy "customers add top-level comments" on public.listing_comments for insert to authenticated with check (author_id = auth.uid() and parent_comment_id is null and exists (select 1 from public.listings where listings.id = listing_comments.listing_id and listings.status = 'active' and listings.seller_id <> auth.uid()));
drop policy if exists "sellers reply to customer comments" on public.listing_comments;
create policy "sellers reply to customer comments" on public.listing_comments for insert to authenticated with check (author_id = auth.uid() and parent_comment_id is not null and exists (select 1 from public.listings where listings.id = listing_comments.listing_id and listings.seller_id = auth.uid()) and exists (select 1 from public.listing_comments as parent_comment where parent_comment.id = listing_comments.parent_comment_id and parent_comment.listing_id = listing_comments.listing_id and parent_comment.author_id <> auth.uid()));
drop policy if exists "authors and owner manage comments" on public.listing_comments;
create policy "authors and owner manage comments" on public.listing_comments for update to authenticated using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());

drop policy if exists "participants and owner see inquiries" on public.inquiries;
create policy "participants and owner see inquiries" on public.inquiries for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
drop policy if exists "buyers start inquiries" on public.inquiries;
create policy "buyers start inquiries" on public.inquiries for insert to authenticated with check (buyer_id = auth.uid() and buyer_id <> seller_id and exists (select 1 from public.listings where listings.id = inquiries.listing_id and listings.seller_id = inquiries.seller_id and listings.status = 'active'));
drop policy if exists "participants update inquiries" on public.inquiries;
create policy "participants update inquiries" on public.inquiries for update to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()) with check (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

drop policy if exists "participants and owner see messages" on public.messages;
create policy "participants and owner see messages" on public.messages for select to authenticated using (exists (select 1 from public.inquiries where inquiries.id = messages.inquiry_id and (inquiries.buyer_id = auth.uid() or inquiries.seller_id = auth.uid() or public.is_admin())));
drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.inquiries where inquiries.id = messages.inquiry_id and (inquiries.buyer_id = auth.uid() or inquiries.seller_id = auth.uid())));

drop policy if exists "public reads listing media files" on storage.objects;
create policy "public reads listing media files" on storage.objects for select using (bucket_id = 'listing-media');
drop policy if exists "authenticated users upload own listing media" on storage.objects;
create policy "authenticated users upload own listing media" on storage.objects for insert to authenticated with check (bucket_id = 'listing-media' and owner_id = (select auth.uid())::text);
drop policy if exists "owners or admin remove listing media files" on storage.objects;
create policy "owners or admin remove listing media files" on storage.objects for delete to authenticated using (bucket_id = 'listing-media' and (owner_id = (select auth.uid())::text or public.is_admin()));

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
