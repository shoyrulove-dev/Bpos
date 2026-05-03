import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function requireAuth(_req?: NextRequest) {
  const session = await auth()
  if (!session?.user) return { token: null, res: err('Unauthorized', 401) }
  return { token: session.user as { id: string; role?: string; email?: string }, res: null }
}

export async function requireAdmin(_req?: NextRequest) {
  const { token, res } = await requireAuth()
  if (res) return { token: null, res }
  if ((token as { role?: string })?.role !== 'admin') return { token: null, res: err('Forbidden', 403) }
  return { token, res: null }
}
