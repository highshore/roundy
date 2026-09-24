export type Locale = 'en' | 'ko';

export const localeName: Record<Locale, string> = { en: 'English', ko: '한국어' };

export function tr(locale: Locale, english: string, korean: string) {
  return locale === 'ko' ? korean : english;
}

const koreanUi: Record<string, string> = {
  'WORKPLACE / SCHOOL':'직장 또는 학교',
  'Reviewing':'검토 중', 'Waitlisted':'대기 중', 'Approved':'승인 완료', 'Confirmed':'예약 확정', 'Completed':'완료',
  'Not started':'인증 전', 'Verified':'인증 완료', 'Rejected':'반려',
  'Update contact details':'연락처 수정', 'Complete your verification':'인증을 완료해 주세요', 'We’re reviewing your account.':'계정을 검토하고 있어요.',
  'Make a little room for someone new.':'아직 신청한 이벤트가 없어요',
  'Your applications and confirmed evenings will appear here.':'신청 내역과 예약이 확정된 이벤트가 여기에 표시돼요.',
  'Event date and round or match':'이벤트 날짜와 라운드 또는 매칭', 'Describe your concern':'신고 내용을 작성해 주세요',
  '01 / JOIN':'01 / 신청', '02 / MEET':'02 / 만남', '03 / CONNECT':'03 / 연결',
  'Find your evening':'이벤트 찾기', 'A table for two':'둘만의 대화', 'Only when it is mutual':'서로 선택한 경우에만',
  'No roster. No endless browsing.':'참가자 목록은 공개되지 않아요', 'Respect is the entry requirement.':'서로를 존중해 주세요', 'Privacy':'개인정보 보호',
  'Yeouido':'여의도', 'Anam':'안암', 'Hongdae':'홍대', 'English only':'영어로 진행', ' · English only':' · 영어로 진행',
  'SATURDAY SOCIAL':'토요일 소셜', 'ticket':'티켓', 'tickets':'티켓', '00\nTICKETS':'00\n티켓', 'AVAILABLE BALANCE':'보유 티켓',
  'Your 90-day window':'90일 이내 환불', 'Live credit balance UI is pending integration.':'실시간 티켓 잔액은 연동 준비 중이에요.',
  'Preview bookings do not purchase or issue real credits.':'미리보기 예약에서는 실제 티켓이 구매되거나 발급되지 않아요.',
  'Apply for this evening and wait for your seat approval before checkout.':'이벤트에 신청하고 승인을 받은 후 결제해 주세요.',
  'Confirm your approved booking to unlock your ticket.':'승인된 예약을 확정하면 티켓을 확인할 수 있어요.',
  'Live QR ticket issuance is pending the payment/check-in integration.':'실제 QR 티켓은 결제 및 체크인 연동 후 발급돼요.',
  'Would You Like to Meet Again':'다시 만나고 싶나요', 'Next round':'다음 라운드', 'Finish preview & lock choices':'미리보기 종료 및 선택 확정',
  '15-minute round · preview timer':'15분 라운드 · 미리보기 타이머', 'Open matched profile':'매칭된 프로필 보기', 'A new connection':'새로운 인연', ' at ':' · ',
  'Event Management':'이벤트 관리', 'Reset this preview':'미리보기 초기화',
  'SEOUL / AFTER HOURS':'서울 / 저녁의 만남', 'A real room. A fresh start. ':'실제 만남, 새로운 시작. ',
  'Preview application states':'신청 상태 미리보기', 'Preview confirmed booking — no charge':'예약 확정 미리보기 — 결제 없음',
  'PREVIEW TICKET — NOT VALID FOR ENTRY':'미리보기 티켓 — 실제 입장 불가', 'Demo QR code, not a valid admission ticket':'미리보기 QR 코드, 실제 입장 티켓이 아닙니다',
  'Arrive 15 minutes early. Entry closes 15 minutes after the start.':'15분 일찍 도착해 주세요. 시작 15분 후에는 입장이 마감돼요.',
  'Event-night preview':'이벤트 진행 미리보기', 'Preview staff check-in':'체크인 미리보기',
  'WHY NO PREVIEW MATCH?':'미리보기에서 매칭이 없는 이유', 'This local preview has no second attendee. The database implements reciprocal matching for real events.':'미리보기에는 실제 상대 참가자가 없어요. 실제 이벤트에서는 서로 선택한 경우에만 매칭돼요.',
  'Fill with a fictional sample profile':'가상 예시 프로필 불러오기', 'Fictional sample profile loaded. You can edit it or continue.':'가상 예시 프로필을 불러왔어요. 수정하거나 계속 진행하세요.',
  'You must be 18 or older and select a gender.':'만 18세 이상이어야 하며 성별을 선택해야 해요.',
  'Please add at least one photo.':'사진을 최소 1장 추가해 주세요.', 'Choose at least 3 interests.':'관심사를 최소 3개 선택해 주세요.',
  'Add a public social account, or choose Apply while I arrange verification.':'공개 소셜 계정을 추가하거나 인증 준비 후 신청하기를 선택해 주세요.',
  'Please choose an image below 2 MB.':'2MB 미만의 사진을 선택해 주세요.',
  'Photo is too large for this preview. Please choose a smaller photo.':'미리보기에 저장하기에는 사진이 너무 커요. 작은 사진을 선택해 주세요.',
  'You can choose Yes for at most 3 people. Change an earlier Yes to choose someone else.':'Yes는 최대 3명까지 선택할 수 있어요. 다른 사람을 선택하려면 이전 선택을 변경해 주세요.',
  'Phone number copied.':'전화번호를 복사했어요.', 'Could not copy. Please select the number manually.':'복사하지 못했어요. 번호를 직접 선택해 주세요.',
  'Preview only. No report was sent.':'미리보기예요. 신고는 전송되지 않았어요.', 'Your report was submitted for private review.':'비공개 검토를 위해 신고를 접수했어요.',
  'Something went wrong. Please try again.':'문제가 발생했어요. 다시 시도해 주세요.', 'Please try again.':'다시 시도해 주세요.',
  'Payments are not enabled. No charge has been made.':'결제 기능은 준비 중이에요. 결제된 금액은 없어요.',
  'Sign in required':'로그인이 필요해요', 'Please sign in with Kakao':'카카오로 로그인해 주세요', 'Administrator access required':'관리자 권한이 필요해요',
  'Could not save the event.':'이벤트를 저장하지 못했어요.', 'Could not load events.':'이벤트를 불러오지 못했어요.', 'Could not delete the event.':'이벤트를 삭제하지 못했어요.',
  'Use lowercase letters, numbers and hyphens for the URL slug.':'URL에는 영문 소문자, 숫자와 하이픈을 사용해 주세요.',
  'Choose a valid start and end time.':'올바른 시작 및 종료 시간을 선택해 주세요.', 'Choose a valid age range.':'올바른 연령 범위를 선택해 주세요.',
  'Capacity must be an even number from 12 to 24.':'정원은 12~24명 사이의 짝수여야 해요.',
  'Enter both map coordinates, or leave both blank.':'위도와 경도를 모두 입력하거나 둘 다 비워 두세요.',
  'Explore events': '이벤트 둘러보기',
  'Open ticket': '티켓 열기',
  'View application': '신청 내역 보기',
  'Find an evening': '이벤트 찾기',
  'Complete profile': '프로필 완성하기',
  'Edit profile': '프로필 수정',
  'Update verification': '인증 정보 수정',
  'Send application': '참가 신청하기',
  'Confirm my seat': '좌석 확정하기',
  'Back to My Events': '내 이벤트로 돌아가기',
  'Continue to secure payment': '안전한 결제 계속하기',
  'Use an existing ticket': '보유 티켓 사용하기',
  'View match results': '매칭 결과 보기',
  'Report a concern': '문제 신고하기',
  'Privacy & event rules': '개인정보 및 이벤트 규칙',
  'Sign out': '로그아웃',
  'Cancel': '취소',
  'Save & leave': '저장 후 나가기',
  'Saving…': '저장 중…',
  'Continue': '계속',
  'Submit for review': '검토 요청하기',
  'Previous step': '이전 단계',
  'FULL LEGAL NAME': '실명',
  'DATE OF BIRTH': '생년월일',
  'NATIONALITY': '국적',
  'HEIGHT (CM)': '키 (CM)',
  'JOB TITLE': '직업',
  'WORKPLACE / SCHOOL — PRIVATE': '직장 또는 학교 — 비공개',
  'PUBLIC JOB DESCRIPTION': '공개 직업 설명',
  'PUBLIC WORKPLACE DESCRIPTION': '공개 직장 또는 학교 설명',
  'SEARCH INTERESTS': '관심사 검색',
  'PRIVATE PHONE NUMBER': '비공개 전화번호',
  'PUBLIC INSTAGRAM': '공개 인스타그램',
  'OR LINKEDIN': '또는 링크드인',
  'Gender': '성별',
  'Woman': '여성',
  'Man': '남성',
  'Add photo': '사진 추가',
  'Make main': '대표 사진으로 설정',
  'Main photo': '대표 사진',
  'Your photo ': '내 사진 ',
  'Remove photo ': '사진 삭제 ',
  'What are you into?': '어떤 것에 관심이 있나요?',
  'Your name as shown on ID': '신분증에 기재된 이름',
  'Your nationality': '국적',
  'Product designer': '프로덕트 디자이너',
  'Company or university': '회사 또는 학교',
  'Designer': '디자이너',
  'A creative company': '창의적인 회사',
  'Only when it’s mutual': '서로 선택했을 때만',
  'Your contact details stay private.': '연락처는 비공개로 유지돼요.',
  'Use work or student proof.': '재직 또는 재학 증빙을 이용하세요.',
  'No social account?': '소셜 계정이 없나요?',
  'Apply while I arrange verification': '인증 준비 후 신청하기',
  'Before you apply': '신청 전 확인',
  'A good fit for the room': '이 자리에 어울리는 사람',
  'Valid for 90 days': '90일 동안 유효',
  'Before you pay': '결제 전 확인',
  'Booking confirmed': '예약 확정',
  'Event complete': '이벤트 종료',
  'Mutual match': '상호 매칭',
  'My Events': '내 이벤트',
  'My tickets': '내 티켓',
  'Verification': '인증',
  'Safety': '안전',
  'Settings': '설정',
  'Tickets & credits': '티켓 및 크레딧',
  'Safety & reporting': '안전 및 신고',
  'Refunds': '환불',
  'A connection takes two.': '연결은 두 사람의 선택에서 시작돼요.',
  'No mutual matches yet.': '아직 상호 매칭이 없어요.',
  'No preview match?': '미리보기 매칭이 없나요?',
  'We never invent someone’s Yes.': '누군가의 Yes를 임의로 만들지 않아요.',
  'Your ticket lives here.': '티켓은 여기에서 확인할 수 있어요.',
  'Approval comes first.': '승인이 먼저 필요해요.',
  'The host starts your evening.': '호스트가 이벤트를 시작해요.',
  'Check in first.': '먼저 체크인하세요.',
  'Would you like to meet again?': '다시 만나고 싶나요?',
  'No': '아니요',
  'Maybe': '고민해 볼게요',
  'Yes': '네',
  'Event / encounter': '이벤트 또는 만남',
  'What happened?': '어떤 일이 있었나요?',
  'Send a confidential report': '비공개 신고 보내기',
  'Published': '공개',
  'Draft': '초안',
  'Live': '진행 중',
  'Closed': '종료',
  'Cancelled': '취소',
  'Your legal name stays private until a mutual match.': '실명은 서로 매칭된 경우에만 공개돼요.',
  'Add 1–3 recent photos. Keep it clearly, honestly you.': '최근 사진을 1~3장 추가해 주세요. 있는 그대로의 모습을 보여 주세요.',
  'We display a general description of your work. Exact details stay private.': '직업에 대한 일반적인 설명만 보여 드려요. 구체적인 정보는 비공개예요.',
  'Pick at least 3, up to 10. Small details make you memorable.': '최소 3개, 최대 10개를 선택해 주세요. 작은 취향이 기억에 남게 해요.',
  'Only mutual matches receive your name and phone number.': '서로 매칭된 경우에만 이름과 전화번호를 확인할 수 있어요.',
  'Our team reviews your public social account. Handles stay private.': '팀에서 공개 소셜 계정을 검토해요. 계정 정보는 비공개로 유지돼요.',
  'No group photos or heavy filters. Use a recent, recognizable picture.': '단체 사진이나 과도한 필터는 피하고, 최근의 알아보기 쉬운 사진을 사용해 주세요.',
  'Choose up to 10 interests.': '관심사는 최대 10개까지 선택할 수 있어요.',
  'I agree to share my name and phone number with mutual matches after the event.': '이벤트 후 서로 매칭된 상대에게 이름과 전화번호를 공유하는 데 동의합니다.',
  'Sharing happens only after you both choose Yes. Once revealed, contact details cannot be revoked.': '두 사람이 모두 Yes를 선택한 경우에만 공유돼요. 공개된 연락처는 회수할 수 없어요.',
  'Apply now, then arrange a private document review with your host. Verification must clear before attending.': '지금 신청하고 호스트와 비공개 서류 인증을 조율하세요. 참석 전 인증이 완료되어야 해요.',
  'You can comfortably hold a 15-minute English conversation and agree to our ': '15분 동안 영어 대화를 나눌 수 있고 ',
  'event rules': '이벤트 규칙',
  '. Applying does not confirm a seat.': '에 동의해야 해요. 신청만으로 좌석이 확정되지는 않아요.',
  'Women ₩19,800 / Men ₩29,800 per ticket. Returning attendees receive 10% off the server-verified price. Promo/referral support awaits the payment adapter.': '티켓 가격은 여성 19,800원, 남성 29,800원이에요. 재참가자는 서버에서 확인된 가격으로 10% 할인받아요. 프로모션과 추천인 할인은 결제 연동 후 지원돼요.',
  '100% refund if requested within 90 days. No refund after expiry. Tickets are personal and non-transferable. One ticket is used for this booking.': '90일 안에 요청하면 전액 환불됩니다. 만료 후에는 환불되지 않아요. 티켓은 본인만 사용할 수 있으며 양도할 수 없어요. 이 예약에는 티켓 1장이 사용돼요.',
  'Show your ticket and photo ID to the host.': '호스트에게 티켓과 사진 신분증을 보여 주세요.',
  'Your starting table appears only after a host checks you in. Verification and ID are required.': '호스트가 체크인한 후에만 시작 테이블이 표시돼요. 인증과 신분증이 필요해요.',
  'Live table assignment and host controls are pending integration. Your privacy remains protected.': '실시간 테이블 배정과 호스트 제어는 연동 중이에요. 개인정보는 계속 보호돼요.',
  'Your host must verify your ticket and ID before a table is revealed.': '호스트가 티켓과 신분증을 확인한 후에 테이블이 공개돼요.',
  'Your choices are locked. Only mutual Yes creates a match.': '선택이 확정되었어요. 서로 Yes를 선택한 경우에만 매칭돼요.',
  'There’s no perfect opening line. Just say hello.': '완벽한 첫마디는 필요 없어요. 가볍게 인사해 보세요.',
  'Your answer stays private. Edit until the evening ends.': '선택은 비공개예요. 이벤트가 끝나기 전까지 수정할 수 있어요.',
  'Yes choices used. Your choice is saved locally in this preview.': '개의 Yes를 사용했어요. 이 미리보기에서는 선택이 기기에만 저장돼요.',
  'Your connections, from evenings you actually shared.': '실제로 함께한 저녁에서 만들어진 연결이에요.',
  'Your results appear when your event closes.': '이벤트가 종료되면 결과가 표시돼요.',
  'Only Yes + Yes creates a match. Nobody sees rejections, and contact details stay hidden until there is a real mutual match.': 'Yes와 Yes가 만나야 매칭이 생겨요. 거절은 누구에게도 보이지 않으며, 연락처는 실제 상호 매칭 전까지 숨겨져요.',
  'Request a refund within 90 days for a 100% refund under the stated policy. No refund after expiry. The treatment of used tickets needs policy clarification before automated refunds go live.': '명시된 정책에 따라 90일 안에 전액 환불을 요청할 수 있어요. 만료 후에는 환불되지 않아요. 사용된 티켓의 자동 환불은 정책 확정 후 제공돼요.',
  'Social handles are never revealed to attendees. Changing your social account resets verification. Verification must clear before attending.': '소셜 계정은 참가자에게 절대 공개되지 않아요. 계정을 변경하면 인증이 다시 검토돼요. 참석 전 인증이 완료되어야 해요.',
  'Reports are confidential, not anonymous. Our team reviews them directly.': '신고는 비공개이지만 익명은 아니에요. 팀에서 직접 검토해요.',
  'Harassment, intoxication, hate speech, unwanted contact, recording and sharing identities can lead to permanent removal. ': '괴롭힘, 과도한 음주, 혐오 표현, 원치 않는 연락, 녹음과 신원 공유는 영구 이용 제한으로 이어질 수 있어요. ',
  'Read our safety principles.': '안전 원칙을 읽어 보세요.',
  'Create a reusable profile, apply, and wait for a curated room. Once approved, use a ticket or checkout.': '재사용 가능한 프로필을 만들고 신청하세요. 검토 후 승인되면 티켓 또는 결제로 좌석을 확정할 수 있어요.',
  'Bring ID and arrive early. Meet through 15-minute English rounds. No alcohol is provided. Entry closes 15 minutes after the start.': '신분증을 지참하고 일찍 도착하세요. 15분씩 영어로 대화해요. 주류는 제공되지 않으며 시작 후 15분이 지나면 입장할 수 없어요.',
  'Choose up to 3 Yes. Both say Yes? You see each other’s profile, name and phone number after the event.': '최대 3명에게 Yes를 선택할 수 있어요. 두 사람 모두 Yes를 선택하면 이벤트 후 서로의 프로필, 이름과 전화번호를 확인해요.',
  'Photos, identity, social handles and choices are private. Rich dating profiles and phone numbers are available only to mutual matches. Verification handles are never shared.': '사진, 신원, 소셜 계정과 선택은 비공개예요. 상세 프로필과 전화번호는 상호 매칭된 경우에만 확인할 수 있으며, 인증에 사용한 계정은 공유되지 않아요.',
  'Harassment, hate speech, intoxication, recording and sharing identities can lead to immediate removal and permanent exclusion. Reports identify the reporter to staff only. Reported pairs should not be seated together in future events.': '괴롭힘, 혐오 표현, 과도한 음주, 녹음과 신원 공유는 즉시 퇴장과 영구 이용 제한으로 이어질 수 있어요. 신고자의 신원은 운영진에게만 알려지며, 신고된 두 사람은 향후 같은 테이블에 배정되지 않아요.',
};

export function ui(locale: Locale, english: string) {
  if (locale !== 'ko') return english;
  const exact = koreanUi[english];
  if (exact) return exact;
  const matchedKey = Object.keys(koreanUi).find((key) => key.trim().toLowerCase() === english.trim().toLowerCase());
  if (matchedKey) return english.replace(english.trim(), koreanUi[matchedKey].trim());
  for (const [prefix, translated] of [['Photo ', '사진 '], ['Your photo ', '내 사진 '], ['Remove photo ', '사진 삭제 '], ['Review round ', '라운드 확인 ']]) {
    if (english.startsWith(prefix) && /^\d+$/.test(english.slice(prefix.length))) return translated + english.slice(prefix.length);
  }
  return english;
}

type EventCopy = { title: string; description: string; venue: string; address: string };

const koreanEvents: Record<string, EventCopy> = {
  'saturday-social': {
    title: '토요일 소셜',
    description: '작은 공간에서 새로운 얼굴들을 만나 보세요. 한 사람씩, 온전히 영어로 나누는 대화가 좋은 연결로 이어집니다.',
    venue: '예시 장소',
    address: '서울 여의도 — 예시 이벤트',
  },
  'sunday-slow-dating': {
    title: '일요일 슬로우 데이팅',
    description: '예상하지 못한 연결을 위한 여유를 만들어 보세요. 다정한 호스트와 함께하는 깊이 있는 대화, 잘 보낸 일요일 오후입니다.',
    venue: '예시 장소',
    address: '서울 안암 — 예시 이벤트',
  },
};

export function localizeEvent<T extends { slug: string; title: string; theme: string; description: string; venue: string; address: string }>(event: T, locale: Locale) {
  if (locale !== 'ko' || !koreanEvents[event.slug]) return event;
  return { ...event, ...koreanEvents[event.slug] };
}

const koreanInterests: Record<string, string> = {
  Coffee: '커피', Running: '러닝', Travel: '여행', Food: '맛집', Film: '영화', Music: '음악', Hiking: '하이킹', Art: '예술', Books: '책', Tech: '테크', Cooking: '요리', Design: '디자인', Museums: '미술관', Photography: '사진', Football: '축구', Yoga: '요가',
};

export function localizeInterest(interest: string, locale: Locale) {
  return locale === 'ko' ? koreanInterests[interest] ?? interest : interest;
}

export function dateLabelForLocale(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', weekday: 'short',
  }).format(new Date(value));
}

export function timeLabelForLocale(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: locale === 'en',
  }).format(new Date(value));
}
