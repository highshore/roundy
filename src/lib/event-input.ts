export function eventInput(body:unknown) {
 if(!body||typeof body!=='object')throw new Error('Invalid event.');
 const v=body as Record<string,unknown>;
 const text=(k:string,max:number,required=true)=>{const x=v[k];if(typeof x!=='string'||x.length>max||(required&&!x.trim()))throw new Error(`Invalid ${k}.`);return x.trim();};
 const int=(k:string,min:number,max:number)=>{const x=v[k];if(typeof x!=='number'||!Number.isInteger(x)||x<min||x>max)throw new Error(`Invalid ${k}.`);return x;};
 const starts_at=text('starts_at',40);if(!/^\d{4}-\d{2}-\d{2}T/.test(starts_at)||!Number.isFinite(Date.parse(starts_at)))throw new Error('Choose a valid event date and time.');
 const age_min=int('age_min',18,100),age_max=int('age_max',18,100);if(age_max<age_min)throw new Error('Choose a valid age range.');
 const capacity=int('capacity',2,100);
 const duration_minutes=int('duration_minutes',15,1440),lockdown_minutes=int('lockdown_minutes',0,43200);
 const reminder_minutes=v.reminder_minutes===null?null:int('reminder_minutes',0,43200);
 const status=text('status',20);if(!['draft','live'].includes(status))throw new Error('Invalid event visibility.');
 const latitude=v.latitude,longitude=v.longitude;
 if((latitude===null)!==(longitude===null)||!(latitude===null||typeof latitude==='number'&&Number.isFinite(latitude)&&Math.abs(latitude)<=90)||!(longitude===null||typeof longitude==='number'&&Number.isFinite(longitude)&&Math.abs(longitude)<=180))throw new Error('Select a valid location.');
 const images=v.images;
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/wis-event-images/';
 if(!Array.isArray(images)||images.length>10||images.some(x=>typeof x!=='string'||(!['/images/yeouido.webp','/images/anam-korea-university.webp'].includes(x)&&(!x.startsWith(base)||!/^[-a-f0-9]+\/[-a-f0-9]+\.(jpg|png|webp)$/.test(x.slice(base.length))))))throw new Error('Choose up to 10 uploaded event images.');
 return {title:text('title',120),description:text('description',3000),starts_at,duration_minutes,lockdown_minutes,reminder_minutes,venue:text('venue',160),address:text('address',300,false),latitude:latitude as number|null,longitude:longitude as number|null,age_min,age_max,capacity,status,images:images as string[],image:images[0]||'',neighborhood:'Seoul',theme:'',ends_at:new Date(Date.parse(starts_at)+duration_minutes*60000).toISOString()};
}
