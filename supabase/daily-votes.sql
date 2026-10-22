-- 좋아요를 「같은 IP는 하루에 10개까지, 작품마다 하루 1번」으로 바꾼다. (setup.sql 다음에 한 번 실행, 여러 번 실행해도 괜찮음)
-- 날짜는 한국 시간 자정에 바뀐다.

-- 1) 투표 줄마다 날짜를 단다. 이미 있는 줄은 오늘 날짜가 된다.
alter table expo_votes add column if not exists day date not null default ((now() at time zone 'Asia/Seoul')::date);

-- 2) 같은 IP·같은 작품은 「하루에」 한 줄만 (전에는 평생 한 줄)
alter table expo_votes drop constraint if exists expo_votes_pkey;
alter table expo_votes add primary key (photo, voter, day);

-- 3) 같은 IP는 하루에 10줄까지. 동시에 여러 번 눌러도 넘지 않게 IP마다 차례로 센다.
create or replace function expo_votes_daily_cap() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.voter));
  if (select count(*) from expo_votes where voter = new.voter and day = new.day) >= 10 then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists expo_votes_daily_cap on expo_votes;
create trigger expo_votes_daily_cap before insert on expo_votes for each row execute function expo_votes_daily_cap();
