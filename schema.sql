-- Hooghly Service Hub V2 database schema
create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text,
  category text not null default 'Other Services',
  area text not null default 'Hooghly',
  address text,
  description text,
  phone text,
  email text,
  website text,
  latitude double precision,
  longitude double precision,
  source text not null default 'owner' check (source in ('osm','owner','admin')),
  source_id text,
  source_url text,
  source_updated_at timestamptz,
  osm_tags jsonb not null default '{}'::jsonb,
  owner_verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint business_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint business_longitude_range check (longitude is null or longitude between -180 and 180)
);

create unique index if not exists businesses_source_source_id_unique
  on public.businesses(source, source_id);
create index if not exists businesses_status_idx on public.businesses(status);
create index if not exists businesses_category_idx on public.businesses(category);
create index if not exists businesses_area_idx on public.businesses(area);
create index if not exists businesses_geo_idx on public.businesses(latitude, longitude);

create table if not exists public.import_jobs (
  id uuid primary key,
  status text not null check (status in ('queued','running','completed','failed')),
  started_by uuid references auth.users(id),
  scanned integer not null default 0,
  eligible integer not null default 0,
  inserted integer not null default 0,
  duplicates integer not null default 0,
  failed integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists import_jobs_created_at_idx on public.import_jobs(created_at desc);

alter table public.businesses enable row level security;
alter table public.import_jobs enable row level security;

-- Public users can see only approved records.
drop policy if exists "Public read approved businesses" on public.businesses;
create policy "Public read approved businesses" on public.businesses
  for select to anon, authenticated using (status = 'approved');

-- Anyone can submit a business, but it is always pending and owner_verified is forced false.
drop policy if exists "Public submit pending business" on public.businesses;
create policy "Public submit pending business" on public.businesses
  for insert to anon, authenticated
  with check (status = 'pending' and owner_verified = false and source = 'owner');

-- Admins can read and manage all business records. Role must be in app_metadata (not user_metadata).
drop policy if exists "Admin manage businesses" on public.businesses;
create policy "Admin manage businesses" on public.businesses
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Import jobs are accessible only to admins.
drop policy if exists "Admin manage import jobs" on public.import_jobs;
create policy "Admin manage import jobs" on public.import_jobs
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert on public.businesses to anon, authenticated;
grant update, delete, select, insert on public.businesses to authenticated;
grant all on public.import_jobs to authenticated;
