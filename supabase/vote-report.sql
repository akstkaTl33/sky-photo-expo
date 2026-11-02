-- 좋아요 살펴보기 (읽기만 함, 아무것도 바꾸지 않음)
-- 날짜별로: 좋아요 수, 누른 인터넷 연결(IP 지문) 수, 한 연결이 평균 몇 개 눌렀는지
select day as 날짜,
       count(*) as 좋아요,
       count(distinct voter) as 연결수,
       round(count(*)::numeric / count(distinct voter), 1) as 연결당_평균
from expo_votes
group by day
order by day;
