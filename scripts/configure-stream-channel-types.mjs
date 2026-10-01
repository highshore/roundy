import { StreamChat } from 'stream-chat';

const apiKey=process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY?.trim();
const apiSecret=process.env.STREAM_CHAT_API_SECRET?.trim();
if(!apiKey||!apiSecret){
 throw new Error('Set NEXT_PUBLIC_STREAM_CHAT_API_KEY and STREAM_CHAT_API_SECRET before configuring Stream.');
}

const client=StreamChat.getInstance(apiKey,apiSecret);
// Do not inherit `messaging` grants and try to subtract writes: that can leave
// a new mutating permission behind after Stream adds one. Channel members get
// only the read capability; every mutation comes from Roundy's server client.
const readOnlyGrants={
 anonymous:[],
 guest:[],
 user:[],
 channel_member:['read-channel'],
 channel_moderator:['read-channel'],
};

const readOnlySettings={
 commands:[],
 custom_events:false,
 reactions:false,
 replies:false,
 quotes:false,
 polls:false,
 typing_events:false,
 uploads:false,
 url_enrichment:false,
 max_message_length:3000,
 grants:readOnlyGrants,
};

for(const name of ['roundy_match','roundy_notification']){
 const exists=await client.getChannelType(name).then(()=>true).catch(()=>false);
 if(exists)await client.updateChannelType(name,readOnlySettings);
 else await client.createChannelType({name,...readOnlySettings});
 console.log(`Configured Stream channel type: ${name}`);
}
