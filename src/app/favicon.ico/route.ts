import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.redirect(new URL('/favicon.svg', 'http://localhost'))
}
