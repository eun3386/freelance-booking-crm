-- 데모용 예약 데이터 (선택). 오늘 기준 -2일 ~ +6일에 24건 생성
with recursive n(i) as (select 0 union all select i + 1 from n where i < 23)
insert or ignore into bookings (id, branch_id, dept_id, date, time, name, phone, status)
select
  lower(hex(randomblob(16))),
  json_extract('["gangnam","haeundae","daegu"]', '$[' || (i % 3) || ']'),
  json_extract('["skin","body","consult"]', '$[' || ((i + 1) % 3) || ']'),
  date('now', ((i % 9) - 2) || ' day'),
  json_extract('["10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"]', '$[' || ((i * 3) % 14) || ']'),
  json_extract('["김서연","이도윤","박지우","최하준","정수아","한민재","오지안","윤서진"]', '$[' || (i % 8) || ']'),
  '0101234' || (1000 + i),
  json_extract('["confirmed","pending","confirmed","cancelled"]', '$[' || (i % 4) || ']')
from n;
