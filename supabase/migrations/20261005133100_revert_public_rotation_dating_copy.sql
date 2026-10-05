-- Revert the unintended public/event wording change from 20261005133000.
-- Instagram marketing keeps "로테이션 소개팅 / Rotation Dating"; website/event records remain unchanged.
update public.events set
 title='(Test) 1:1 Rotation Meetup',
 title_ko='(테스트) 글로벌 로테이션 소개팅',
 description='Meet new people through a series of relaxed 1:1 conversations. Rotate between participants every 15 minutes, enjoy real face-to-face connections, and see who you naturally click with.',
 description_ko='여러 참가자와 1:1로 대화하며 자연스럽게 새로운 사람을 만나보세요. 15분 마다 상대를 바꾸며 부담 없이 대화하고, 나와 잘 맞는 사람을 찾아가는 로테이션 밋업입니다.',
 updated_at=now()
where id='d98f53a5-f0b7-4ac2-bf3f-3cbd42e47bc4';

update public.events set
 title='1:1 Speed Mingle | 로테이션 밋업',
 title_ko='',
 description='Meet new people through a series of relaxed 1:1 conversations. Rotate between participants every 15 minutes, enjoy real face-to-face connections, and see who you naturally click with.
---
여러 참가자와 1:1로 대화하며 자연스럽게 새로운 사람을 만나보세요. 15분 마다 상대를 바꾸며 부담 없이 대화하고, 나와 잘 맞는 사람을 찾아가는 로테이션 밋업입니다.',
 description_ko='',
 updated_at=now()
where id='219afb76-3c72-48a2-8877-48b060378fa3';

update public.events set
 title='1:1 Speed Mingle | 로테이션 밋업',
 title_ko='',
 description='테스트',
 description_ko='',
 updated_at=now()
where id='69770086-9951-4989-9dd5-bffa645554af';