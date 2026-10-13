/** Canonical content state. Do not infer a managed content's state from legacy jobs. */
export const CONTENT_STAGES = ['discovery','copy','media','render','review','publish','complete'] as const;
export type ContentStage = typeof CONTENT_STAGES[number];
export type ContentStatus = 'queued'|'running'|'blocked'|'failed'|'uncertain'|'scheduled'|'published'|'archived';
export const CONTENT_STAGE_LABELS:Record<ContentStage,[string,string]>={
 discovery:['Research','자료 조사'],copy:['Copy','원고'],media:['Photos','사진'],render:['Render','이미지 제작'],
 review:['Final review','최종 검토'],publish:['Publishing','게시'],complete:['Complete','완료']
};
export const CONTENT_STATUS_LABELS:Record<ContentStatus,[string,string]>={
 queued:['Queued','작업 대기'],running:['Working','진행 중'],blocked:['Action needed','확인 필요'],
 failed:['Step failed','해당 단계 오류'],uncertain:['Check previous request','이전 요청 결과 확인 필요'],
 scheduled:['Scheduled','게시 예약'],published:['Published','게시 완료'],archived:['Archived','보관됨']
};
export const CONTENT_ACTION_LABELS:Record<string,[string,string]>={
 photo_approval_required:['Review selected photos','선택된 사진을 검수하세요'],
 final_approval_required:['Review and approve publication','최종 검토 후 게시를 승인하세요'],
 source_review_required:['Refine the brief or retry research','소재를 보완하거나 자료 조사를 다시 진행하세요'],
 copy_review_required:['Edit the saved copy','저장된 원고를 수정하세요'],
 review_changed_content:['Review changes and continue','수정 내용을 확인하고 다음 단계로 진행하세요'],
 retry_step:['Retry this step only','오류가 난 단계만 다시 실행하세요'],
 reconcile_request:['Confirm the previous external result first','이전 외부 요청 결과를 먼저 확인하세요'],
 preflight_required:['Resolve the listed publishing checks','표시된 게시 조건을 보완하세요'],
 workflow_paused:['Workflow is paused','워크플로가 일시 중지됐습니다']
};
export function contentIsLocked(row:{status?:string}):boolean{
 return ['running','scheduled','published','uncertain','archived'].includes(String(row.status));
}
