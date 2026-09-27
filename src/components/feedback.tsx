'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, LockKeyhole, MessageCircle } from 'lucide-react';
import { tr, dateLabelForLocale, type Locale } from '@/lib/locale';
import { feedbackQuestions, ratingKeys, type FeedbackContext, type FeedbackSurvey, type RatingKey } from '@/lib/feedback';
import './feedback.css';

function useFeedbackContext() {
 const [context, setContext] = useState<FeedbackContext | null>(null);
 const [error, setError] = useState(false);
 const [revision, setRevision] = useState(0);
 useEffect(() => {
  const controller = new AbortController();
  setError(false);
  fetch('/api/feedback', { cache: 'no-store', signal: controller.signal }).then(async r => {
   if (!r.ok) throw Error('load');
   setContext(await r.json());
  }).catch(() => { if (!controller.signal.aborted) setError(true); });
  return () => controller.abort();
 }, [revision]);
 return { context, error, retry: () => setRevision(n => n + 1) };
}
export function FeedbackPrompt({ locale }: { locale: Locale }) {
 const { context } = useFeedbackContext();
 if (!context?.eligible) return null;
 return <Link className="feedback-prompt" href="/feedback"><MessageCircle size={24}/><span><strong>{tr(locale, 'How was your first Roundy?', '첫 라운디 모임은 어땠나요?')}</strong><small>{tr(locale, 'A 2-minute check-in. Help shape the next one.', '2분이면 충분해요. 다음 모임을 위한 의견을 들려주세요.')}</small></span><ArrowRight size={20}/></Link>;
}
function Rating({ name, value, onChange, locale, talk }: { name: RatingKey; value: number; onChange: (v: number) => void; locale: Locale; talk: boolean }) {
 const question = name === 'connection' && talk ? tr(locale, 'Did you have meaningful conversations?', '의미 있는 대화를 나눌 수 있었나요?') : tr(locale, feedbackQuestions[name][0], feedbackQuestions[name][1]);
 const labels = name === 'overall' ? (locale === 'ko' ? ['아쉬웠어요', '조금 아쉬웠어요', '보통이에요', '좋았어요', '정말 좋았어요'] : ['Poor', 'Fair', 'Okay', 'Good', 'Great']) : (locale === 'ko' ? ['전혀 아니에요', '별로 아니에요', '보통이에요', '그런 편이에요', '매우 그래요'] : ['Not at all', 'Not really', 'Somewhat', 'Mostly', 'Absolutely']);
 return <fieldset className="feedback-rating"><legend>{question}</legend><div className="feedback-scale">{[1, 2, 3, 4, 5].map(n => <label key={n} className={value === n ? 'selected' : ''}><input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} required aria-label={`${n} — ${labels[n - 1]}`}/><span>{n}</span></label>)}</div><div className="feedback-scale-labels"><span>{labels[0]}</span><span>{labels[4]}</span></div></fieldset>;
}
export function FeedbackPage({ locale }: { locale: Locale }) {
 const { context, error: loadError, retry } = useFeedbackContext();
 const [step, setStep] = useState(0);
 const [answers, setAnswers] = useState<FeedbackSurvey>({ overall: 0, connection: 0, return: 0, recommend: 0, difficulty: '', improvement: '', locale });
 const [busy, setBusy] = useState(false);
 const [sent, setSent] = useState(false);
 const [error, setError] = useState('');
 const heading = useRef<HTMLHeadingElement>(null);
 function move(next: number) { setStep(next); setError(''); requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }); }
 if (loadError) return <section className="feedback-state"><h1>{tr(locale, 'Couldn’t load your feedback form', '피드백 양식을 불러오지 못했어요')}</h1><button className="button" onClick={retry}>{tr(locale, 'Try again', '다시 시도')}</button></section>;
 if (!context) return <p role="status">{tr(locale, 'Loading your feedback form…', '피드백 양식을 불러오는 중…')}</p>;
 if (sent || context.submitted) return <section className="feedback-state"><span className="feedback-success-icon"><Check size={30}/></span><h1>{tr(locale, 'Thanks for being part of it.', '함께해 주셔서 고마워요.')}</h1><p>{tr(locale, 'Your feedback is saved. We’ll use it to make the next Roundy better.', '의견을 잘 받았어요. 더 좋은 라운디 모임을 만드는 데 활용할게요.')}</p><Link className="button" href="/events">{tr(locale, 'Explore events', '이벤트 둘러보기')}<ArrowRight size={18}/></Link><Link className="text-button" href="/me/events">{tr(locale, 'Back to My Events', '내 이벤트로 돌아가기')}</Link></section>;
 if (!context.eligible || !context.event) return <section className="feedback-state"><MessageCircle size={32}/><h1>{tr(locale, 'See you after your first meetup.', '첫 모임이 끝나면 만나요.')}</h1><p>{tr(locale, 'This form opens after your first checked-in Roundy event ends. If you attended but don’t see it, ask your host to check your attendance.', '첫 라운디 모임에서 체크인하고 모임이 끝나면 작성할 수 있어요. 참석했는데 양식이 열리지 않으면 호스트에게 출석 확인을 요청해 주세요.')}</p><Link className="button" href="/me/events">{tr(locale, 'My Events', '내 이벤트')}</Link><Link className="text-button" href="/me/safety">{tr(locale, 'Contact the Roundy team', '라운디 운영진에게 문의하기')}</Link></section>;
 const event = context.event;
 const keys: RatingKey[] = step === 0 ? ['overall', 'connection'] : ['return', 'recommend'];
 const complete = keys.every(k => answers[k] > 0);
 return <section className="feedback-page"><Link className="feedback-back" href="/me/events"><ArrowLeft size={16}/>{tr(locale, 'My Events', '내 이벤트')}</Link><header className="feedback-heading"><p className="eyebrow">{tr(locale, 'YOUR FIRST ROUNDY', '첫 라운디의 기억')}</p><h1 ref={heading} tabIndex={-1}>{step === 0 ? tr(locale, 'How did it feel?', '어떤 시간이었나요?') : tr(locale, 'Make the next one better.', '다음 만남을 더 좋게.')}</h1><p>{tr(locale, 'About 2 minutes. Honest answers welcome.', '약 2분이면 충분해요. 솔직한 의견을 들려주세요.')}</p></header><div className="feedback-event"><span>{event.theme === 'Business Talk' ? tr(locale, 'Business Talk', '비즈니스 토크') : tr(locale, '1:1 Mingle', '1:1 밍글')}</span><strong>{event.title}</strong><small>{dateLabelForLocale(event.starts_at, locale)}</small></div><div className="feedback-progress"><span>{tr(locale, step === 0 ? 'Your experience' : 'Next time', step === 0 ? '모임 경험' : '다음 모임')}</span><span>{step + 1} / 2</span><progress value={step + 1} max={2} aria-label={tr(locale, 'Survey progress', '설문 진행')}/></div><form onSubmit={async e => {
  e.preventDefault(); if (!complete || busy) return;
  if (step === 0) { move(1); return; }
  setBusy(true); setError('');
  try {
   const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: event.id, survey: { ...answers, locale } }) });
   if (!response.ok) throw Error('submit');
   setSent(true);
  } catch { setError(tr(locale, 'Couldn’t send your feedback. Your answers are still here—please try again.', '피드백을 보내지 못했어요. 입력한 답변은 그대로 있으니 다시 시도해 주세요.')); }
  finally { setBusy(false); }
 }}><fieldset disabled={busy} className="feedback-fields">{keys.map(k => <Rating key={k} name={k} value={answers[k]} onChange={v => setAnswers(a => ({ ...a, [k]: v }))} locale={locale} talk={event.theme === 'Business Talk'}/>)}{step === 1 && (['difficulty', 'improvement'] as const).map(k => <label className="feedback-written" key={k}><span>{tr(locale, feedbackQuestions[k][0], feedbackQuestions[k][1])} <small>{tr(locale, '(optional)', '(선택)')}</small></span><textarea rows={3} maxLength={1500} value={answers[k]} onChange={e => setAnswers(a => ({ ...a, [k]: e.target.value }))} placeholder={k === 'difficulty' ? tr(locale, 'Conversation prompts, pace, language, atmosphere…', '대화 주제, 진행 속도, 언어, 분위기 등') : tr(locale, 'One thing to keep, change, or try…', '좋았던 점, 바꾸고 싶은 점, 새로운 제안 등')}/></label>)}</fieldset><p className="feedback-privacy"><LockKeyhole size={15}/>{tr(locale, 'Only Roundy admins can review your answers. This is not anonymous.', '답변은 라운디 관리자만 확인할 수 있으며 익명 설문은 아니에요.')}</p>{error && <p role="alert" className="feedback-error">{error}</p>}<div className="feedback-actions">{step === 1 && <button className="button secondary" type="button" disabled={busy} onClick={() => move(0)}>{tr(locale, 'Back', '이전')}</button>}<button className="button" type="submit" disabled={!complete || busy}>{busy ? tr(locale, 'Sending…', '보내는 중…') : step === 0 ? tr(locale, 'Continue', '다음') : tr(locale, 'Send feedback', '피드백 보내기')}<ArrowRight size={18}/></button></div>{!complete && <p className="note">{tr(locale, 'Please answer both ratings to continue.', '계속하려면 두 질문에 점수를 선택해 주세요.')}</p>}</form><Link className="feedback-safety" href="/me/safety">{tr(locale, 'Something felt unsafe? Report a concern', '불편하거나 안전하지 않았나요? 신고하기')}</Link></section>;
}
export function FeedbackSummary({ survey, locale }: { survey: FeedbackSurvey; locale: Locale }) {
 return <dl className="feedback-summary">{ratingKeys.map(k => <div key={k}><dt>{k === 'connection' ? tr(locale, 'Connection quality', '대화와 연결 경험') : tr(locale, feedbackQuestions[k][0], feedbackQuestions[k][1])}</dt><dd>{survey[k]} / 5</dd></div>)}{(['difficulty', 'improvement'] as const).map(k => <div key={k}><dt>{tr(locale, feedbackQuestions[k][0], feedbackQuestions[k][1])}</dt><dd>{survey[k] || tr(locale, 'No answer', '답변 없음')}</dd></div>)}</dl>;
}
