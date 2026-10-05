-- Public copy migration only. Keep the legacy event theme identifier for routing/data compatibility.
update public.events
set
  title = case
    when title = '1:1 Speed Mingle | 로테이션 밋업' then 'Rotation Dating | 로테이션 소개팅'
    when title = '(Test) 1:1 Rotation Meetup' then '(Test) Rotation Dating'
    else replace(replace(title,'1:1 Speed Mingle','Rotation Dating'),'1:1 Rotation Meetup','Rotation Dating')
  end,
  title_ko = case
    when title_ko = '(테스트) 글로벌 로테이션 소개팅' then '(테스트) 로테이션 소개팅'
    else replace(replace(coalesce(title_ko,''),'1:1 밍글','로테이션 소개팅'),'로테이션 밋업','로테이션 소개팅')
  end,
  description = case
    when description like 'Meet new people through a series of relaxed 1:1 conversations.%'
      then 'Meet new people through Roundy''s Rotation Dating format. Meet each participant in turn, rotate every 15 minutes, and see who you naturally click with.'
    else replace(replace(description,'1:1 Speed Mingle','Rotation Dating'),'1:1 mingle','Rotation Dating')
  end,
  description_ko = case
    when description_ko like '여러 참가자와 1:1로 대화하며 자연스럽게 새로운 사람을 만나보세요.%'
      then 'Roundy 로테이션 소개팅에서 여러 참가자를 차례로 만나보세요. 15분마다 상대를 바꾸며 부담 없이 대화하고, 더 이야기해보고 싶은 사람을 선택할 수 있습니다.'
    else replace(replace(coalesce(description_ko,''),'1:1 밍글','로테이션 소개팅'),'로테이션 밋업','로테이션 소개팅')
  end,
  updated_at = now()
where theme in ('1:1 Speed Mingle','1:1 Speed Meetup')
  and (
    title like '%1:1%' or title like '%로테이션 밋업%'
    or coalesce(title_ko,'') like '%1:1%' or coalesce(title_ko,'') like '%글로벌 로테이션 소개팅%' or coalesce(title_ko,'') like '%로테이션 밋업%'
    or coalesce(description,'') like '%1:1%Mingle%' or coalesce(description,'') like '%1:1 conversations%'
    or coalesce(description_ko,'') like '%1:1 밍글%' or coalesce(description_ko,'') like '%1:1로 대화%' or coalesce(description_ko,'') like '%로테이션 밋업%'
  );