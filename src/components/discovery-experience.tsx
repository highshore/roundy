import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, MessageCircle, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { dateLabelForLocale, localizeEvent, timeLabelForLocale, tr, type Locale } from '@/lib/locale';
import { eventCategory, type Event } from '@/lib/data';
import styles from './discovery-experience.module.css';

export type LegacyTalk = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  description: string;
  venue: string;
  address: string;
  capacity: number;
  participant_count: number;
  image: string;
  source_url: string;
};

function EventRow({ event, locale }: { event: Event; locale: Locale }) {
  const item = localizeEvent(event, locale);
  const category = eventCategory(event);
  return <Link className={styles.eventRow} href={'/events/' + event.slug}>
    <span className={styles.eventThumb}>
      <Image src={event.image || '/images/yeouido.webp'} alt="" fill sizes="112px"/>
    </span>
    <span className={styles.eventCopy}>
      <span className={styles.eventMeta}>{category === '1:1 Speed Mingle' ? tr(locale, '1:1 Mingle', '1:1 밍글') : tr(locale, 'Business Talk', '비즈니스 토크')}</span>
      <h3>{item.title}</h3>
      <p>{dateLabelForLocale(event.starts_at, locale)} · {timeLabelForLocale(event.starts_at, locale)} · {item.venue}</p>
    </span>
    <span className={styles.eventArrow}><ArrowUpRight size={19}/></span>
  </Link>;
}

function LegacyRow({ event, locale }: { event: LegacyTalk; locale: Locale }) {
  return <a className={styles.eventRow} href={event.source_url} target="_blank" rel="noreferrer">
    <span className={styles.eventThumb}>
      {event.image ? <img src={event.image} alt="" loading="lazy"/> : <span aria-hidden="true"><MessageCircle size={22}/></span>}
    </span>
    <span className={styles.eventCopy}>
      <span className={styles.eventMeta}>{tr(locale, 'BUSINESS TALK / 1 CUP ARCHIVE', '비즈니스 토크 / 영어 한잔 기록')}</span>
      <h3>{event.title}</h3>
      <p>{dateLabelForLocale(event.starts_at, locale)} · {event.venue}</p>
    </span>
    <span className={styles.eventArrow}><ArrowUpRight size={19}/></span>
  </a>;
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return <header className={styles.sectionHeader}>
    <div>
      <span className={styles.sectionEyebrow}>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
    {body && <p>{body}</p>}
  </header>;
}

export function DiscoveryLanding({ events, legacyTalks, locale }: { events: Event[]; legacyTalks: LegacyTalk[]; locale: Locale }) {
  const legacyUpcoming = legacyTalks.filter(event => Date.parse(event.starts_at) >= Date.now());
  const upcoming = [
    ...events.map(event => ({ kind: 'roundy' as const, event })),
    ...legacyUpcoming.map(event => ({ kind: 'legacy' as const, event })),
  ].sort((a, b) => Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at)).slice(0, 4);

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{tr(locale, 'ROUNDY / SEOUL', 'ROUNDY / SEOUL')}</p>
        <h1>{tr(locale, 'Choose how you want to meet.', '어떻게 만날지부터 골라보세요.')}</h1>
        <p>{tr(locale, 'One-on-one chemistry or a thoughtful group conversation. Both start offline, with enough structure to make meeting strangers feel natural.', '1:1로 천천히 알아가거나, 좋은 주제로 여러 사람과 깊게 대화해 보세요. 둘 다 오프라인에서, 낯선 만남이 자연스럽도록 필요한 만큼만 구조를 둡니다.')}</p>
      </div>
      <div className={styles.heroMark}><span>{tr(locale, 'Offline first. Profiles later.', '먼저 만나고, 프로필은 나중에.')}</span></div>
    </section>

    <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'TWO EXPERIENCES', '두 가지 경험')} title={tr(locale, 'Pick the room that fits tonight.', '오늘의 나에게 맞는 자리를 골라보세요.')} body={tr(locale, 'Roundy is not one meetup format stretched across every occasion. Each room has its own rhythm.', 'Roundy는 하나의 모임 방식을 반복하지 않습니다. 각 모임에는 각자의 리듬이 있습니다.')}/>
      <div className={styles.experienceGrid}>
        <Link href="/mingle" className={styles.experience}>
          <div className={styles.experienceImage}><Image src="/images/roundy-mingle-hero.webp" alt={tr(locale, 'People having a one-on-one Roundy conversation', 'Roundy에서 1:1로 대화하는 사람들')} fill sizes="(max-width: 759px) 100vw, 560px"/></div>
          <div className={styles.experienceBody}>
            <div><span className={styles.eventMeta}>{tr(locale, '1:1 / MUTUAL MATCH', '1:1 / 상호 선택')}</span><h3>{tr(locale, '1:1 Mingle', '1:1 밍글')}</h3><p>{tr(locale, 'Meet the person before the profile. Short rotations, a mid-conversation reveal, then private mutual matching.', '프로필보다 사람을 먼저 만나보세요. 짧은 로테이션, 대화 중간의 프로필 공개, 그리고 비공개 상호 매칭으로 이어집니다.')}</p></div>
            <span className={styles.arrow}><ArrowRight size={20}/></span>
          </div>
        </Link>
        <Link href="/business-talk" className={styles.experience}>
          <div className={styles.experienceImage}><Image src="/images/roundy-business-hero.webp" alt={tr(locale, 'A small group having a Roundy Business Talk', 'Roundy 비즈니스 토크에서 소그룹으로 대화하는 사람들')} fill sizes="(max-width: 759px) 100vw, 560px"/></div>
          <div className={styles.experienceBody}>
            <div><span className={styles.eventMeta}>{tr(locale, 'SMALL GROUP / ENGLISH', '소그룹 / 영어')}</span><h3>{tr(locale, 'Business Talk', '비즈니스 토크')}</h3><p>{tr(locale, 'Skip networking small talk. Start with one topic worth discussing and meet people through the way they think.', '네트워킹용 스몰토크 대신 이야기할 가치가 있는 한 가지 주제로 시작합니다. 생각하는 방식을 통해 사람을 만나보세요.')}</p></div>
            <span className={styles.arrow}><ArrowRight size={20}/></span>
          </div>
        </Link>
      </div>
    </section>

    <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'NEXT UP', '다음 모임')} title={tr(locale, 'Upcoming in Seoul', '서울에서 곧 열려요')} body={tr(locale, 'Choose the experience first, then the date.', '어떤 방식으로 만날지 고른 뒤 날짜를 선택하세요.')}/>
      {upcoming.length ? <div className={styles.eventList}>{upcoming.map(item => item.kind === 'roundy' ? <EventRow key={'roundy-' + item.event.id} event={item.event} locale={locale}/> : <LegacyRow key={'legacy-' + item.event.id} event={item.event} locale={locale}/>)}</div> : <p className={styles.empty}>{tr(locale, 'New dates are being prepared.', '새로운 일정을 준비하고 있어요.')}</p>}
    </section>

    <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'WHAT STAYS THE SAME', '어떤 모임이든 지키는 것')} title={tr(locale, 'Less browsing. More being there.', '덜 고르고, 더 직접 만나세요.')} />
      <div className={styles.principles}>
        <article className={styles.principle}><Sparkles size={22}/><strong>{tr(locale, 'Offline first', '오프라인이 먼저')}</strong><p>{tr(locale, 'Roundy is designed around the room, not an endless feed of people.', '끝없이 사람을 넘겨보는 피드가 아니라, 실제 한 공간에서의 경험을 중심으로 만듭니다.')}</p></article>
        <article className={styles.principle}><ShieldCheck size={22}/><strong>{tr(locale, 'Reviewed before joining', '참여 전 확인')}</strong><p>{tr(locale, 'Profiles and verification are reviewed before members enter events.', '이벤트 참여 전 프로필과 인증 정보를 검토합니다.')}</p></article>
        <article className={styles.principle}><UsersRound size={22}/><strong>{tr(locale, 'Structured, not scripted', '구조는 있지만 각본은 없어요')}</strong><p>{tr(locale, 'Hosts and prompts remove the awkward start without deciding the conversation for you.', '호스트와 질문이 어색한 시작을 줄여주지만 대화 자체를 대신 정해주지는 않습니다.')}</p></article>
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.proof}>
        <strong className={styles.proofNumber}>80+</strong>
        <div className={styles.proofCopy}><strong>{tr(locale, 'Built from a real offline community.', '실제 오프라인 커뮤니티에서 시작했습니다.')}</strong><p>{tr(locale, 'Before Roundy, our earlier conversation community grew to more than 80 cumulative paid members. Roundy keeps the parts that helped strangers actually connect.', 'Roundy 이전에 운영한 대화 커뮤니티는 누적 유료 멤버 80명 이상으로 성장했습니다. 낯선 사람들이 실제로 연결되는 데 도움이 됐던 부분을 Roundy에 남겼습니다.')}</p><Link className={styles.inlineLink} href="/about">{tr(locale, 'Read our story', 'Roundy 이야기 보기')} <ArrowRight size={16}/></Link></div>
      </div>
    </section>

    <section className={styles.finalCta}>
      <div><h2>{tr(locale, 'Start with the room.', '어떤 자리에 들어갈지부터.')}</h2><p>{tr(locale, 'Explore the format first, or go straight to the next available event.', '모임 방식을 먼저 알아보거나, 바로 다음 이벤트를 골라보세요.')}</p></div>
      <Link className={styles.primaryLink} href="/events">{tr(locale, 'See all events', '모든 이벤트 보기')} <ArrowRight size={18}/></Link>
    </section>
  </div>;
}

type IntroKind = 'mingle' | 'business';

function IntroPage({ kind, events, legacyTalks, locale }: { kind: IntroKind; events: Event[]; legacyTalks: LegacyTalk[]; locale: Locale }) {
  const mingle = kind === 'mingle';
  const relevant = events.filter(event => eventCategory(event) === (mingle ? '1:1 Speed Mingle' : 'Business Talk')).slice(0, 3);
  const recentArchive = legacyTalks.filter(event => Date.parse(event.starts_at) < Date.now()).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)).slice(0, 4);
  const steps = mingle ? [
    [tr(locale, '01 / CHECK IN', '01 / 체크인'), tr(locale, 'Leave the résumé at the door.', '이력서 같은 정보는 잠시 내려두세요.'), tr(locale, 'You receive a random nickname. Age, job, school and nationality are not printed on the name tag.', '랜덤 닉네임을 받습니다. 나이, 직업, 학교, 국적은 이름표에 표시하지 않습니다.')],
    [tr(locale, '02 / MEET', '02 / 대화'), tr(locale, 'Talk before you know the profile.', '프로필을 알기 전에 먼저 대화하세요.'), tr(locale, 'Each round lasts 15 minutes. Curated questions guide the first part; basic profile information appears later, then the conversation opens up.', '한 라운드는 15분입니다. 앞부분은 큐레이션 질문으로 대화하고, 이후 기본 프로필이 공개되면 자유롭게 이어갑니다.')],
    [tr(locale, '03 / CHOOSE', '03 / 선택'), tr(locale, 'Keep only what felt mutual.', '서로 원한 연결만 이어집니다.'), tr(locale, 'After the rotations, choose up to three people you want to talk to again. Only mutual choices become matches.', '모든 로테이션이 끝난 뒤 다시 이야기하고 싶은 사람을 최대 3명 선택합니다. 서로 선택한 경우에만 매칭됩니다.')],
  ] : [
    [tr(locale, '01 / ARRIVE', '01 / 도착'), tr(locale, 'No elevator pitch required.', '엘리베이터 피치는 필요 없어요.'), tr(locale, 'The host settles the room and introduces one topic worth discussing. You do not need to work the room or sell yourself.', '호스트가 자리를 정리하고 이야기할 가치가 있는 한 가지 주제를 소개합니다. 방을 돌며 자신을 홍보할 필요가 없습니다.')],
    [tr(locale, '02 / DISCUSS', '02 / 대화'), tr(locale, 'Start with an idea, not a job title.', '직함이 아니라 생각으로 시작하세요.'), tr(locale, 'Small groups discuss the same prompt in English, giving everyone a reason to go beyond introductions quickly.', '소그룹이 같은 질문을 영어로 이야기합니다. 자기소개를 넘어 빠르게 더 깊은 대화로 들어갈 수 있습니다.')],
    [tr(locale, '03 / ROTATE', '03 / 이동'), tr(locale, 'Change the room, keep the thread.', '사람은 바뀌어도 대화의 흐름은 이어져요.'), tr(locale, 'Groups rotate so you meet more people without turning the evening into open-ended networking.', '그룹을 바꾸며 더 많은 사람을 만나되, 끝없는 자유 네트워킹처럼 흘러가지 않도록 진행합니다.')],
    [tr(locale, '04 / STAY', '04 / 이어가기'), tr(locale, 'Continue the conversations worth keeping.', '더 이야기하고 싶은 대화를 이어가세요.'), tr(locale, 'After the structured portion, stay for a more relaxed conversation with people you clicked with.', '정규 진행이 끝난 뒤 마음이 맞았던 사람들과 조금 더 편하게 대화를 이어갈 수 있습니다.')],
  ];

  return <div className={styles.page}>
    <section className={styles.introHero}>
      <div>
        <p className={styles.eyebrow}>{mingle ? tr(locale, 'ROUNDY / 1:1 MINGLE', 'ROUNDY / 1:1 밍글') : tr(locale, 'ROUNDY / BUSINESS TALK', 'ROUNDY / 비즈니스 토크')}</p>
        <h1>{mingle ? tr(locale, 'Meet the person before the profile.', '프로필보다 사람을 먼저 만나보세요.') : tr(locale, 'Skip small talk. Start with something worth discussing.', '스몰토크는 건너뛰고, 이야기할 가치가 있는 주제로 시작하세요.')}</h1>
        <p className={styles.introLead}>{mingle ? tr(locale, 'A profile can be useful. It just should not decide the first five seconds. Roundy lets conversation happen before the numbers arrive.', '프로필은 유용하지만 첫 5초를 결정할 필요는 없습니다. Roundy에서는 숫자와 조건을 보기 전에 먼저 대화가 시작됩니다.') : tr(locale, 'Business Talk is for people who want to meet thoughtful, globally minded people without spending the night exchanging pitches and LinkedIn QR codes.', 'Business Talk은 피치와 링크드인 QR을 주고받는 네트워킹 대신, 생각이 있는 글로벌한 사람들과 제대로 대화하고 싶은 사람을 위한 자리입니다.')}</p>
        <div className={styles.quickFacts}>
          {(mingle ? [
            [tr(locale, '15 min', '15분'), tr(locale, 'each 1:1 round', '각 1:1 라운드')],
            [tr(locale, 'Up to 3', '최대 3명'), tr(locale, 'private choices', '비공개 선택')],
            [tr(locale, 'Mutual only', '상호 선택만'), tr(locale, 'contact reveal', '연락처 공개')],
          ] : [
            [tr(locale, 'English', '영어'), tr(locale, 'conversation-first', '대화 중심')],
            [tr(locale, 'Small groups', '소그룹'), tr(locale, 'hosted format', '호스트 진행')],
            [tr(locale, '1 topic', '한 가지 주제'), tr(locale, 'deeper quickly', '빠르게 깊게')],
          ]).map(([strong, label]) => <div className={styles.quickFact} key={strong}><strong>{strong}</strong><span>{label}</span></div>)}
        </div>
      </div>
      <div className={styles.introImage}>
        <Image src={mingle ? '/images/roundy-mingle-hero.webp' : '/images/roundy-business-hero.webp'} alt="" fill priority sizes="(max-width: 759px) 100vw, 600px"/>
        <span className={styles.introBadge}>{mingle ? tr(locale, '1:1 / SEOUL', '1:1 / 서울') : tr(locale, 'SMALL GROUP / SEOUL', '소그룹 / 서울')}</span>
      </div>
    </section>

    <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'IN THE ROOM', '모임에서는')} title={mingle ? tr(locale, 'A first impression with less information.', '정보는 덜고, 첫인상은 더 직접적으로.') : tr(locale, 'Enough structure to skip the awkward part.', '어색한 시작을 건너뛸 만큼의 구조.')} body={mingle ? tr(locale, 'The format intentionally changes what you learn first.', '무엇을 먼저 알게 되는지 의도적으로 순서를 바꿉니다.') : tr(locale, 'You always know what the room is doing next, so you can focus on the conversation.', '다음에 무엇을 할지 알 수 있도록 진행해, 대화 자체에 집중할 수 있습니다.')}/>
      <div className={styles.steps}>{steps.map(([number, title, body]) => <article className={styles.step} key={number}><span className={styles.stepNumber}>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    {mingle ? <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'THE REVEAL', '프로필 공개')} title={tr(locale, 'First the conversation. Then the context.', '먼저 대화하고, 그다음 맥락을 확인하세요.')} body={tr(locale, 'The reveal is not a twist. It is a way to notice which assumptions you would have made from a profile alone.', '프로필 공개는 반전을 만들기 위한 장치가 아닙니다. 프로필만 봤다면 했을 법한 판단을 스스로 알아차리게 하는 순서입니다.')}/>
      <div className={styles.reveal}>
        <div className={styles.revealPane}><span className={styles.sectionEyebrow}>{tr(locale, 'FIRST 10 MINUTES', '처음 10분')}</span><h3>{tr(locale, 'Person first', '사람이 먼저')}</h3><ul><li>{tr(locale, 'Random nickname', '랜덤 닉네임')}</li><li>{tr(locale, 'Same curated character questions', '같은 성향 질문')}</li><li>{tr(locale, 'No age, job or school prompt', '나이, 직업, 학교 질문 없음')}</li></ul></div>
        <div className={styles.revealPane}><span className={styles.sectionEyebrow}>{tr(locale, 'FINAL 5 MINUTES', '마지막 5분')}</span><h3>{tr(locale, 'Context later', '맥락은 나중에')}</h3><ul><li>{tr(locale, 'Basic profile becomes available', '기본 프로필 공개')}</li><li>{tr(locale, 'Conversation becomes free-form', '자유 대화로 전환')}</li><li>{tr(locale, 'Notice what surprised you', '예상과 달랐던 점 확인')}</li></ul></div>
      </div>
    </section> : <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'NOT A NETWORKING MIXER', '일반 네트워킹과 다릅니다')} title={tr(locale, 'Meet through how people think.', '사람의 생각을 통해 만나세요.')} body={tr(locale, 'The room is designed to make useful conversation the default rather than something you have to hunt for.', '좋은 대화를 찾아 헤매지 않아도 되도록, 유의미한 대화가 기본값이 되게 설계합니다.')}/>
      <div className={styles.comparison}>
        <div className={styles.comparisonColumn}><span className={styles.sectionEyebrow}>{tr(locale, 'LEAVE OUT', '덜어내는 것')}</span><h3>{tr(locale, 'Networking theatre', '네트워킹식 행동')}</h3><ul><li>{tr(locale, 'Working the room', '사람 많은 곳을 돌며 인사하기')}</li><li>{tr(locale, 'Repeating the same self-introduction', '같은 자기소개 반복하기')}</li><li>{tr(locale, 'Collecting contacts with no conversation', '대화 없이 연락처만 모으기')}</li></ul></div>
        <div className={styles.comparisonColumn}><span className={styles.sectionEyebrow}>{tr(locale, 'MAKE ROOM FOR', '대신 남기는 것')}</span><h3>{tr(locale, 'Conversation with a point', '내용이 있는 대화')}</h3><ul><li>{tr(locale, 'One curated current topic', '큐레이션한 하나의 시사 주제')}</li><li>{tr(locale, 'Small groups where everyone speaks', '모두가 말할 수 있는 소그룹')}</li><li>{tr(locale, 'Time to continue after the format ends', '공식 진행 후 이어갈 수 있는 시간')}</li></ul></div>
      </div>
    </section>}

    {!mingle && recentArchive.length > 0 && <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'FROM 1 CUP ENGLISH', '영어 한잔에서 이어집니다')} title={tr(locale, 'This format was tested before it was branded.', '브랜드보다 먼저 현장에서 검증한 방식입니다.')} body={tr(locale, 'Our earlier community grew past 80 cumulative paid members around deeper, topic-led English conversations.', '이전 커뮤니티는 깊이 있는 주제 중심 영어 대화를 기반으로 누적 유료 멤버 80명 이상으로 성장했습니다.')}/>
      <div className={styles.archive}>{recentArchive.map(event => <a className={styles.archiveRow} href={event.source_url} target="_blank" rel="noreferrer" key={event.id}><span>{dateLabelForLocale(event.starts_at, locale)}</span><strong>{event.title}</strong><span>{event.participant_count}/{event.capacity}</span></a>)}</div>
    </section>}

    <section className={styles.section}>
      <SectionHeading eyebrow={tr(locale, 'NEXT EVENT', '다음 이벤트')} title={mingle ? tr(locale, 'Try 1:1 Mingle in Seoul.', '서울에서 1:1 밍글을 만나보세요.') : tr(locale, 'Join the next Business Talk.', '다음 비즈니스 토크에 참여하세요.')} body={tr(locale, 'See the date, room and participant requirements before you join.', '참여 전에 날짜, 장소, 참가 요건을 확인할 수 있습니다.')}/>
      {relevant.length ? <div className={styles.eventList}>{relevant.map(event => <EventRow key={event.id} event={event} locale={locale}/>)}</div> : <p className={styles.empty}>{tr(locale, 'The next date is being prepared.', '다음 일정을 준비하고 있어요.')}</p>}
    </section>

    <section className={styles.finalCta}>
      <div><h2>{mingle ? tr(locale, 'Meet first. Decide later.', '먼저 만나고, 판단은 나중에.') : tr(locale, 'Bring one evening. Leave with better conversations.', '한 저녁을 내고, 더 좋은 대화를 가져가세요.')}</h2><p>{tr(locale, 'Browse all published Roundy events and choose the one that fits.', '공개된 Roundy 이벤트를 둘러보고 나에게 맞는 자리를 선택하세요.')}</p></div>
      <Link className={styles.primaryLink} href={'/events?category=' + encodeURIComponent(mingle ? '1:1 Speed Mingle' : 'Business Talk')}>{tr(locale, 'See events', '이벤트 보기')} <ArrowRight size={18}/></Link>
    </section>
  </div>;
}

export function MingleIntro(props: { events: Event[]; legacyTalks: LegacyTalk[]; locale: Locale }) {
  return <IntroPage kind="mingle" {...props}/>;
}

export function BusinessTalkIntro(props: { events: Event[]; legacyTalks: LegacyTalk[]; locale: Locale }) {
  return <IntroPage kind="business" {...props}/>;
}
