-- 내 Supabase 프로젝트의 SQL Editor에 통째로 붙여 넣고 Run 한 번만 누르면 된다.
-- 사진·투표·댓글을 담을 표 3개와 사진 파일 버킷 1개를 만든다.

-- ── 사진 작품 (관리 화면에서 바로 걸고 고친다) ──
create table if not exists expo_content (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table expo_content enable row level security;
drop policy if exists "누구나 보기" on expo_content;
create policy "누구나 보기" on expo_content for select to anon using (true);
drop policy if exists "작품 걸기" on expo_content;
create policy "작품 걸기" on expo_content for insert to anon with check (id like 'sky3-p-%');
drop policy if exists "작품 고치기" on expo_content;
create policy "작품 고치기" on expo_content for update to anon using (id like 'sky3-p-%');

-- ── 투표: 작품 하나에 같은 IP는 한 줄만 (기본키가 두 번째 줄을 막는다) ──
-- 쓰기는 사이트 서버(/api/vote)만 비밀 키로 한다. 방문자는 숫자만 볼 수 있다.
create table if not exists expo_votes (
  photo text not null,
  voter text not null,             -- IP를 비밀 소금과 섞어 만든 지문 (IP 원문은 저장하지 않음)
  created_at timestamptz not null default now(),
  primary key (photo, voter)
);
alter table expo_votes enable row level security;
create or replace view expo_vote_counts as
  select photo, count(*)::int as n from expo_votes group by photo;
grant select on expo_vote_counts to anon;

-- ── 댓글: 쓰기·지우기는 사이트 서버(/api/comment)만 한다 ──
create table if not exists expo_comments (
  id bigint generated always as identity primary key,
  photo text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table expo_comments enable row level security;
drop policy if exists "누구나 보기" on expo_comments;
create policy "누구나 보기" on expo_comments for select to anon using (true);
create index if not exists expo_comments_photo on expo_comments (photo, created_at);

-- ── 사진 파일 버킷 ──
insert into storage.buckets (id, name, public) values ('expo-photos', 'expo-photos', true)
  on conflict (id) do nothing;
drop policy if exists "사진 올리기" on storage.objects;
create policy "사진 올리기" on storage.objects for insert to anon with check (bucket_id = 'expo-photos');
