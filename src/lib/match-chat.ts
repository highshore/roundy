export const MATCH_CHAT_CHANNEL_TYPE='roundy_match';
export const ROUNDY_NOTIFICATION_CHANNEL_TYPE='roundy_notification';
export const ROUNDY_STREAM_USER_ID='roundy';
export const MATCH_CHAT_MAX_MESSAGE_LENGTH=1_000;
export const ROUNDY_WELCOME_NOTIFICATION_KIND='welcome';
export const ROUNDY_WELCOME_MESSAGE='Welcome to Roundy! Complete your profile, explore upcoming gatherings, and keep an eye on this chat for important updates.\n\nRoundy에 오신 것을 환영해요! 프로필을 완성하고 다가오는 모임을 둘러보세요. 중요한 안내는 이 채팅으로 보내드릴게요.';

export type MatchChatState='awaiting_opening'|'awaiting_reply'|'active'|'expired';

export type MatchChatSession={
 id:string;
 chat_state:MatchChatState;
 deadline:string|null;
 opening_expires_at:string;
 reply_expires_at:string|null;
 expired_at:string|null;
 expiry_reason:'opening_timeout'|'reply_timeout'|null;
 can_send:boolean;
 first_message_by_viewer:boolean;
 viewer_stream_user_id:string;
 viewer_name:string;
 viewer_photo:string|null;
 other_stream_user_id:string;
 other_name:string;
 other_photo:string|null;
 channel_id:string;
 notification_channel_id:string;
 stream_channel_exists:boolean;
 message_id?:string;
 already_reserved?:boolean;
};

export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value:string){return uuidPattern.test(value);}

// Stream message IDs are scoped by the match as well as the browser retry ID.
// This makes retries idempotent without letting a message ID from another room
// collide with a newly-reserved message.
export function matchChatStreamMessageId(matchId:string,messageId:string){
 return 'match_'+matchId.replaceAll('-','')+'_'+messageId.replaceAll('-','');
}

// A deterministic ID lets the welcome delivery recover after an interrupted
// request without creating a second welcome message in Stream.
export function roundyWelcomeStreamMessageId(userId:string){
 return 'roundy_welcome_'+userId.replaceAll('-','');
}
