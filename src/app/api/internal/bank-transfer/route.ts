import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runBankWorker } from '@/lib/payments/bank-worker.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(req:NextRequest) {
 const expected=process.env.CRON_SECRET ? 'Bearer '+process.env.CRON_SECRET : '';
 const actual=req.headers.get('authorization')??'';
 if(!expected || Buffer.byteLength(actual)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return NextResponse.json({error:'Unauthorized'},{status:401});
 try {return NextResponse.json(await runBankWorker(),{headers:{'Cache-Control':'no-store'}});}
 catch {return NextResponse.json({error:'Bank worker failed; inspect payment operations'},{status:500});}
}
