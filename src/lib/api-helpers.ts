import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function requireAuth(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return { token: null, res: err('Unauthorized', 401) }
  return { token, res: null }
}

export async function requireAdmin(req: NextRequest) {
  const { token, res } = await requireAuth(req)
  if (res) return { token: null, res }
  if (token!.role !== 'admin') return { token: null, res: err('Forbidden', 403) }
  return { token, res: null }
}
