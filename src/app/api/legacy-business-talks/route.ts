import { NextResponse } from 'next/server';

// Retired integration: do not fetch or expose content from an external service.
export function GET() {
  return NextResponse.json({ events: [] }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
