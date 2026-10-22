-- 기능 시험에 쓴 가짜 좋아요(없는 작품)를 지운다. 진짜 작품의 좋아요는 건드리지 않는다.
delete from expo_votes where photo like '%-dtest' or photo like '%-test';
