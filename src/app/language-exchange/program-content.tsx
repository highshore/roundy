'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, CircleHelp, Clock3, Globe2, MessageCircleMore, ShieldCheck, UsersRound } from 'lucide-react';
import { useSiteLocale } from '@/components/site-shell';
import { tr } from '@/lib/locale';
import styles from './page.module.css';

export type LanguageEvent = {
  id: string;
  slug: string;
  title: string;
  title_ko: string | null;
  starts_at: string;
  venue: string;
  capacity: number;
  seats_remaining: number;
  price_general: number;
};

const curriculum = [
  {
    time: '00–10',
    enTitle: 'Check-in and orientation',
    koTitle: '체크인 및 오리엔테이션',
    enDetail: 'Meet your host, review conversation guidelines and check language levels.',
    koDetail: '진행자 소개, 대화 규칙 및 언어 수준 확인',
  },
  {
    time: '10–30',
    enTitle: 'Warm up with topic cards',
    koTitle: '주제 카드로 워밍업',
    enDetail: 'Practice brief introductions and questions in Korean and English.',
    koDetail: '짧은 자기소개와 한국어·영어 질문 연습',
  },
  {
    time: '30–70',
    enTitle: 'Guided conversation rotation',
    koTitle: '가이드형 대화 로테이션',
    enDetail: 'Practice speaking in two 20-minute rounds with different partners.',
    koDetail: '20분씩 2회, 파트너를 바꿔 실전 회화 연습',
  },
  {
    time: '70–105',
    enTitle: 'Real-world conversation practice',
    koTitle: '실전 상황별 대화',
    enDetail: 'Discuss cultural differences, travel and everyday life.',
    koDetail: '문화 차이, 여행, 일상생활 등 주제로 토론',
  },
  {
    time: '105–120',
    enTitle: 'Wrap-up and feedback',
    koTitle: '마무리 및 피드백',
    enDetail: 'Review expressions you learned and set your next learning goal.',
    koDetail: '새롭게 배운 표현을 정리하고 다음 학습 목표 설정',
  },
] as const;

export default function LanguageExchangeContent({ events }: { events: LanguageEvent[] }) {
  const { locale } = useSiteLocale();
  const t = (english: string, korean: string) => tr(locale, english, korean);

  const dateFormatter = new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return (
    <div className={styles.page}>
      <main id="main">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}><Globe2 size={16} /> {t('ROUNDY LANGUAGE EXCHANGE', 'ROUNDY 언어교환')}</span>
            <h1>
              {t('Language comes alive', '언어는 책보다,')}<br />
              <em>{t('between people.', '사람 사이에서')}</em>{locale === 'ko' ? ' 자랍니다.' : ''}
            </h1>
            <p>{t(
              'An in-person Korean and English conversation program. Practice speaking and listening with different people, guided by a host and topic cards.',
              '한국어와 영어를 직접 말하고 듣는 오프라인 대화 실습 프로그램입니다. 진행자의 안내와 주제 카드를 활용해 다양한 사람들과 실제 대화를 연습합니다.',
            )}</p>
            <div className={styles.heroActions}>
              <a href="#program" className={styles.primary}>{t('Explore the program', '프로그램 살펴보기')} <ArrowRight size={18} /></a>
              <Link href="/events" className={styles.secondary}>{t('Browse meetups', '모임 목록 보기')}</Link>
            </div>
            <span className={styles.planning}>
              {t(
                'Our language-exchange pilot is in preparation. Confirmed booking dates will be announced below.',
                '언어교환 시범 프로그램 준비 중입니다. 실제 모집 일정은 아래에서 별도 안내합니다.',
              )}
            </span>
          </div>
          <div className={styles.heroVisual} aria-label={t('Sample Korean–English conversation', '한국어 및 영어 대화 예시')}>
            <div className={styles.floatCard}>
              <span>01 / KOREAN</span>
              <strong>오늘 하루 어땠어요?</strong>
              <small>How was your day?</small>
            </div>
            <div className={styles.bubble}>{t('Every conversation starts', '대화의 시작은')}<br />{t('with a small question.', '작은 질문 하나.')}</div>
            <div className={styles.floatCardAlt}>
              <span>02 / ENGLISH</span>
              <strong>What made you smile today?</strong>
              <small>오늘 웃게 만든 일은 무엇인가요?</small>
            </div>
          </div>
        </section>

        <section className={styles.overview} id="program">
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>{t('THE PROGRAM', '프로그램 소개')}</span>
            <h2>{t('How it works', '진행 방식')}</h2>
            <p>{t(
              'Below is an example of the 120-minute program currently being prepared. The confirmed structure of each session will be stated on its event page.',
              '아래는 현재 준비 중인 120분 프로그램의 예시이며, 각 회차의 확정된 구성은 모집 페이지에 별도로 명시합니다.',
            )}</p>
          </div>
          <div className={styles.featureGrid}>
            <article>
              <MessageCircleMore />
              <strong>{t('Practice Korean and English', '한국어와 영어 대화 실습')}</strong>
              <p>{t('Alternate between your native and target languages to practice natural expressions.', '모국어와 학습 언어를 교대로 사용하며 자연스러운 표현을 연습합니다.')}</p>
            </article>
            <article>
              <UsersRound />
              <strong>{t('Host-guided conversation rounds', '진행자가 안내하는 순환 대화')}</strong>
              <p>{t('Follow conversation prompts and rotate partners to practice in different speaking situations.', '주제별 가이드를 따라 파트너를 바꾸며 다양한 말하기 상황을 경험합니다.')}</p>
            </article>
            <article>
              <BookOpen />
              <strong>{t('Question cards and key expressions', '질문 카드와 표현 정리')}</strong>
              <p>{t('We plan to use topic cards, helpful expressions and a short self-review at the end.', '질문 카드, 주제별 표현, 마무리 자기점검을 프로그램에 활용할 예정입니다.')}</p>
            </article>
          </div>
        </section>

        <section className={styles.program}>
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>{t('SAMPLE CURRICULUM', '예시 커리큘럼')}</span>
            <h2>{t('A sample 120-minute session', '120분 운영 예시')}</h2>
            <p>{t(
              'Check the individual event page for the confirmed schedule, number of conversations and any materials before booking.',
              '실제 운영 회차의 일정, 대화 횟수, 준비물은 예약 전 해당 행사에서 확인해 주세요.',
            )}</p>
          </div>
          <ol className={styles.timeline}>
            {curriculum.map((item, i) => (
              <li key={item.time}>
                <span className={styles.time}>{item.time}<small>{t('MIN', '분')}</small></span>
                <span className={styles.number}>0{i + 1}</span>
                <div><strong>{t(item.enTitle, item.koTitle)}</strong><p>{t(item.enDetail, item.koDetail)}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.booking} id="booking">
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>{t('UPCOMING SESSIONS', '모집 일정')}</span>
            <h2>{t('Upcoming meetups and fees', '모임 일정 및 참가비')}</h2>
            <p>{t(
              'Fees, capacity, venue and duration may vary by session. Only published events can be booked.',
              '참가비, 정원, 장소, 진행 시간은 회차별로 달라질 수 있습니다. 모집이 공개된 행사만 실제 예약이 가능합니다.',
            )}</p>
          </div>
          {events.length ? (
            <div className={styles.eventList}>
              {events.map(event => (
                <Link className={styles.event} key={event.id} href={'/events/' + event.slug}>
                  <div>
                    <strong>{locale === 'ko' ? (event.title_ko?.trim() || event.title) : (event.title || event.title_ko)}</strong>
                    <span><CalendarDays size={14} /> {dateFormatter.format(new Date(event.starts_at))}{locale === 'en' ? ' KST' : ''}</span>
                    <span>{event.venue} {t('· Seats left: ', '· 잔여 ')}{event.seats_remaining}/{event.capacity}{t(' seats', '석')}</span>
                  </div>
                  <div className={styles.eventPrice}>
                    <strong>{locale === 'ko' ? event.price_general.toLocaleString('ko-KR') + '원' : '₩' + event.price_general.toLocaleString('en-US')}</strong>
                    <span>{t('View details', '상세보기')} <ArrowRight size={15} /></span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <CalendarDays size={27} />
              <strong>{t('No language-exchange sessions are currently open for booking.', '현재 공개된 언어교환 모집 일정이 없습니다.')}</strong>
              <p>{t(
                'The pilot program is being prepared. Session dates and fees will be published when confirmed. Reservations and payments are not being accepted for this program yet.',
                '프로그램은 준비 중이며, 일정 및 참가비가 확정된 후 행사별로 공개합니다. 지금은 결제나 예약을 받고 있지 않습니다.',
              )}</p>
            </div>
          )}
        </section>

        <section className={styles.terms}>
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>{t('BEFORE JOINING', '참가 전 확인사항')}</span>
            <h2>{t('Participation and policies', '참가 및 운영 안내')}</h2>
          </div>
          <div className={styles.termsGrid}>
            <article>
              <Clock3 size={21} />
              <h3>{t('Booking and attendance', '신청과 참여')}</h3>
              <p>{t(
                'Before booking a published event, check its date, location, fee, age restrictions and participation requirements. The specific inclusions stated on that event page take precedence.',
                '실제 공개된 행사에서 일정, 장소, 참가비, 연령 및 참가 조건을 확인한 다음 예약합니다. 해당 페이지에 명시된 제공사항이 우선합니다.',
              )}</p>
            </article>
            <article>
              <ShieldCheck size={21} />
              <h3>{t('Cancellations and refunds', '취소와 환불')}</h3>
              <p>
                {t('You can review the cancellation deadline shown on each event and our ', '각 행사에 표시된 취소 마감 시점과 ')}
                <Link href="/refund-policy">{t('refund policy', '환불 규정')}</Link>
                {t(' before paying. Your statutory rights remain protected.', '을 결제 전에 확인할 수 있습니다. 적용 법령에 따른 권리는 별도로 보호됩니다.')}
              </p>
            </article>
            <article>
              <CircleHelp size={21} />
              <h3>{t('Matching and chat features', '매칭 및 채팅 기능 안내')}</h3>
              <p>{t(
                'Roundy also offers optional mutual matching and chat features after offline events. These are separate from the language-exchange practice itself. Each event will state whether they are included.',
                'Roundy에는 오프라인 행사 이후 상호 선택에 따라 매칭되거나 채팅하는 기능도 있습니다. 이 기능은 언어교환 실습 자체와 구분되며 행사별 제공 여부를 안내합니다.',
              )}</p>
            </article>
          </div>
          <p className={styles.contact}>
            {t('Contact: ', '문의: ')}<a href="mailto:hello@roundy.team">hello@roundy.team</a>
            {' · '}<Link href="/terms">{t('Terms of Service', '이용약관')}</Link>
            {' · '}<Link href="/privacy">{t('Privacy Policy', '개인정보처리방침')}</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
