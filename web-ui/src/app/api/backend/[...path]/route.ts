import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:5167';
const API_KEY = process.env.API_SECRET_KEY ?? '';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path, 'GET');
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path, 'POST');
}

async function proxy(req: NextRequest, pathParts: string[], method: string) {
  const path = pathParts.join('/');
  const url = `${BACKEND}/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;

  let body: string | undefined;
  if (method === 'POST') {
    body = await req.text();
  }

  try {
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 502 });
  }
}
