-- JoloVocals schema. Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Each user can only see and change their own rows and files.

create table if not exists public.voices (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id      text not null,
  name    text not null,
  cat     text not null default 'Personal',
  pitch   integer not null default 150,
  gender  text check (gender in ('male', 'female')),
  dur     real not null default 0,
  created bigint not null,
  primary key (user_id, id)
);

-- For projects created before the gender column existed:
alter table public.voices add column if not exists gender text check (gender in ('male', 'female'));

create table if not exists public.recents (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id       text not null,
  kind     text not null check (kind in ('tts', 'v2v')),
  title    text not null,
  text     text,
  voice_id text,
  ts       bigint not null,
  dur      real not null default 0,
  primary key (user_id, id)
);

create index if not exists recents_user_ts on public.recents (user_id, ts desc);

alter table public.voices  enable row level security;
alter table public.recents enable row level security;

create policy "own voices"  on public.voices  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own recents" on public.recents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Private bucket for voice samples and converted audio, stored as <user id>/<file>.
insert into storage.buckets (id, name, public)
values ('voice-audio', 'voice-audio', false)
on conflict (id) do nothing;

create policy "own audio read"   on storage.objects for select to authenticated
  using (bucket_id = 'voice-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own audio insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own audio update" on storage.objects for update to authenticated
  using (bucket_id = 'voice-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own audio delete" on storage.objects for delete to authenticated
  using (bucket_id = 'voice-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
