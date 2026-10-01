import { StreamChat } from 'stream-chat';

const apiKey=process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY?.trim();
const apiSecret=process.env.STREAM_CHAT_API_SECRET?.trim();
if(!apiKey||!apiSecret){
 throw new Error('Set NEXT_PUBLIC_STREAM_CHAT_API_KEY and STREAM_CHAT_API_SECRET before configuring Stream.');
}

const client=StreamChat.getInstance(apiKey,apiSecret);

// Persistent message creation is intentionally absent from every client grant.
// Roundy's backend remains the only path that can create match messages, so the
// opening/reply expiry rules cannot be bypassed from a browser token.
const matchGrants={
 anonymous:[],
 guest:[],
 user:[],
 channel_member:['read-channel','read-channel-members','read-events','create-reaction','delete-reaction-owner','upload-attachment','flag-message'],
 channel_moderator:['read-channel','read-channel-members','read-events','create-reaction','delete-reaction-owner','upload-attachment','flag-message'],
};

const notificationGrants={
 anonymous:[],
 guest:[],
 user:[],
 channel_member:['read-channel','read-channel-members','read-events'],
 channel_moderator:['read-channel','read-channel-members','read-events'],
};

const channelTypes={
 roundy_match:{
  commands:[],
  custom_events:false,
  connect_events:true,
  reactions:true,
  replies:false,
  quotes:true,
  polls:false,
  typing_events:true,
  read_events:true,
  uploads:true,
  url_enrichment:true,
  search:false,
  max_message_length:1000,
  grants:matchGrants,
 },
 roundy_notification:{
  commands:[],
  custom_events:false,
  connect_events:true,
  reactions:false,
  replies:false,
  quotes:false,
  polls:false,
  typing_events:false,
  read_events:true,
  uploads:false,
  url_enrichment:true,
  search:false,
  max_message_length:3000,
  grants:notificationGrants,
 },
};

for(const [name,settings] of Object.entries(channelTypes)){
 const exists=await client.getChannelType(name).then(()=>true).catch(()=>false);
 if(exists)await client.updateChannelType(name,settings);
 else await client.createChannelType({name,...settings});
 console.log('Configured Stream channel type: '+name);
}
