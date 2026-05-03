import type { NextAuthConfig } from 'next-auth'

// Edge-compatible auth config (NO DB/Mongoose imports)
// Used by middleware only
export const authConfig = {
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAuthPage = nextUrl.pathname.startsWith('/login')

      if (!isLoggedIn && !isAuthPage) {
        return Response.redirect(new URL('/login', nextUrl))
      }
      if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL('/', nextUrl))
      }
      return true
    },
  },
  providers: [],
} satisfies NextAuthConfig
