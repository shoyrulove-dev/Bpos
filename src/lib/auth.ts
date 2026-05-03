import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/db'
import UserModel from '@/models/User'
import { authConfig } from '@/lib/auth.config'

const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60 // 30 days
const DEFAULT_MAX_AGE  = 24 * 60 * 60       // 1 day

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email:      { label: 'Email',             type: 'email' },
        password:   { label: 'Mật khẩu',          type: 'password' },
        rememberMe: { label: 'Ghi nhớ đăng nhập', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('MISSING_FIELDS')
        }

        try {
          await connectDB()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          throw new Error(`DB_CONNECT: ${msg.slice(0, 120)}`)
        }

        const user = await UserModel.findOne({ email: credentials.email }).select('+password')
        if (!user) throw new Error('USER_NOT_FOUND')

        const valid = await bcrypt.compare(credentials.password as string, user.password)
        if (!valid) throw new Error('WRONG_PASSWORD')

        return {
          id:         user._id.toString(),
          name:       user.name,
          email:      user.email,
          role:       user.role,
          avatar:     user.avatar,
          rememberMe: credentials.rememberMe === 'true',
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id         = user.id
        token.role       = (user as { role?: string }).role
        token.avatar     = (user as { avatar?: string }).avatar
        token.rememberMe = (user as { rememberMe?: boolean }).rememberMe ?? false
        // Set token expiry based on rememberMe
        token.exp = Math.floor(Date.now() / 1000) +
          (token.rememberMe ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id     = token.id as string
        session.user.role   = token.role as string
        session.user.avatar = token.avatar as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: REMEMBER_MAX_AGE,
  },
  secret: process.env.NEXTAUTH_SECRET,
})
