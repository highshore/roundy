import type { Metadata } from 'next';
export const siteUrl = 'https://roundy.team';
export const publicPages = {
 '/': { title: '서울 로테이션 소개팅 | Roundy | Meet in Real Life', description: '서울에서 직접 만나 대화하는 1:1 로테이션 소개팅. 프로필 인증 후 참여하고, 서로 선택하면 매칭되는 라운디의 오프라인 모임을 알아보세요.' },
 '/language-exchange': { title: '서울 언어교환 모임 | Seoul Language Exchange | Roundy', description: '서울에서 한국어와 영어로 대화하는 라운디 언어교환. 프로그램 진행 방식, 모집 일정과 참가비를 확인하세요. Guided Korean and English conversation in Seoul.' },
 '/about': { title: 'About Roundy | 라운디 소개', description: 'Learn about Roundy and its in-person community in Seoul. 서울에서 직접 만나 대화하는 라운디를 소개합니다.' },
 '/how-it-works': { title: 'How Roundy Works | 라운디 이용 안내', description: 'Explore how to join Roundy events in Seoul. 라운디 모임의 참가 절차와 이용 방법을 확인하세요.' },
} as const;
export function publicMetadata(path: keyof typeof publicPages): Metadata {
 const page = publicPages[path];
 return { ...page, alternates: { canonical: path }, robots: { index: true, follow: true },
  openGraph: { ...page, url: siteUrl + path, siteName: 'Roundy', type: 'website', images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Roundy' }] },
  twitter: { ...page, card: 'summary_large_image', images: ['/opengraph-image'] } };
}
