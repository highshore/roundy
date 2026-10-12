import {editorialState, type EditorialState} from './marketing-workflow';

type Row = Record<string, any>;
type Label = readonly [string, string];
export type WorkflowNavigation = {
 state: EditorialState;
 phase: 0 | 1 | 2 | null;
 action: Label | null;
 targets: readonly string[];
};

// Navigation is presentation only. It must never approve, regenerate or publish.
export function workflowNavigation(row: Row | null | undefined): WorkflowNavigation {
 const state = editorialState(row);
 const copy = ['#roundy-editorial-studio', '.marketing-quality-status'];
 const photos = ['#roundy-marketing-photo-editor', '.marketing-photo-first-panel'];
 switch (state) {
  case 'empty':
  case 'topic_review':
   return {state, phase: 0, action: ['Set up content', '콘텐츠 만들기 열기'], targets: ['.marketing-generator-card']};
  case 'source_review':
  case 'copy_review':
  case 'translation_review':
   return {state, phase: 0, action: ['Review saved copy', '저장된 원고 확인'], targets: copy};
  case 'photo_review':
   return {state, phase: 1, action: ['Choose photos', '사진 선택으로 이동'], targets: photos};
  case 'render_review':
   return {state, phase: 1, action: ['Finish images', '이미지 완성으로 이동'], targets: ['#roundy-editorial-render-action', ...photos, '#roundy-marketing-approval']};
  case 'ready':
   return {state, phase: 2, action: ['Review and publish', '최종 검토 및 게시'], targets: ['#roundy-marketing-approval']};
  case 'published':
  case 'scheduled':
   return {state, phase: 2, action: null, targets: []};
  // A running or uncertain job must not look like a completed approval step.
  case 'running':
  case 'system_error':
   return {state, phase: null, action: null, targets: []};
 }
}

export function carouselCounts(row: Row | null | undefined) {
 const total = Array.isArray(row?.carousel_slides) ? row.carousel_slides.length : 0;
 const brand = total > 0 && row?.content_document?.brand_outro_version === 1 ? 1 : 0;
 return {total, stories: total - brand, brand};
}

// Open the enclosing disclosure before scrolling; otherwise a valid anchor can
// remain invisible. This helper performs no requests or application mutations.
export function focusWorkflowTarget(targets: readonly string[], root: ParentNode = document): boolean {
 const target = targets.map(selector => root.querySelector<HTMLElement>(selector))
  .find(element => element !== null && !element.closest('[hidden]'));
 if (!target) return false;
 for (let element: HTMLElement | null = target; element; element = element.parentElement) {
  if (element.tagName === 'DETAILS') (element as HTMLDetailsElement).open = true;
 }
 const previousTabIndex = target.getAttribute('tabindex');
 if (previousTabIndex === null) {
  target.setAttribute('tabindex', '-1');
  target.addEventListener('blur', () => target.removeAttribute('tabindex'), {once: true});
 }
 const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 target.focus({preventScroll: true});
 target.scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'start'});
 return true;
}
