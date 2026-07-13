'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ShoppingBag, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: form.email,
        password: form.password,
        rememberMe: String(rememberMe),
        redirect: false,
      })

      if (result?.error) {
        const code = (result as { code?: string }).code ?? ''
        if (code === 'USER_NOT_FOUND') {
          setError('Email khÃ´ng tá»“n táº¡i trong há»‡ thá»‘ng')
        } else if (code === 'WRONG_PASSWORD') {
          setError('Máº­t kháº©u khÃ´ng Ä‘Ãºng')
        } else if (code.startsWith('DB_CONNECT')) {
          setError(`Lá»—i káº¿t ná»‘i database: ${code.replace('DB_CONNECT: ', '')}`)
        } else if (code === 'MISSING_FIELDS') {
          setError('Vui lÃ²ng nháº­p Ä‘áº§y Ä‘á»§ email vÃ  máº­t kháº©u')
        } else {
          setError(`ÄÄƒng nháº­p tháº¥t báº¡i${code ? ` (${code})` : ''}`)
        }
      } else {
        router.push('/orders')
        router.refresh()
      }
    } catch {
      setError('CÃ³ lá»—i xáº£y ra. Vui lÃ²ng thá»­ láº¡i.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 via-primary-600 to-orange-700 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-1/4 w-32 h-32 rounded-full bg-white/5" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-xl mb-4">
            <ShoppingBag className="w-8 h-8 text-primary-500" />
          </div>
          <h1 className="text-3xl font-bold text-white">BPOS Portal</h1>
          <p className="text-primary-100 mt-1 text-sm">Quáº£n lÃ½ bÃ¡n hÃ ng Ä‘a kÃªnh</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">ÄÄƒng nháº­p</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label">Máº­t kháº©u</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-500 accent-orange-500 cursor-pointer"
                />
                <span className="text-sm text-gray-600">Ghi nhá»› Ä‘Äƒng nháº­p</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Äang Ä‘Äƒng nháº­p...
                </>
              ) : (
                'ÄÄƒng nháº­p'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-primary-100 text-xs mt-6">
          Â© 2026 BPOS Portal Â· v1.0.0
        </p>
      </div>
    </div>
  )
}
