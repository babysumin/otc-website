-- Supabase SQL Editor에서 이 파일 내용을 그대로 실행하세요.

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  join_date date,
  memo text,
  q1_paid boolean not null default false,
  q2_paid boolean not null default false,
  q3_paid boolean not null default false,
  q4_paid boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS 활성화 (일단 누구나 읽기/쓰기 가능하게 열어둠 - 나중에 로그인 붙이면 정책 강화 필요)
alter table members enable row level security;

create policy "allow all for now"
on members
for all
using (true)
with check (true);
