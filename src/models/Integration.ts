import mongoose, { Schema, Document } from 'mongoose'

export interface IIntegration extends Document {
  provider: 'shopee' | 'grab' | 'xanh_sm' | 'be'
  brandId: mongoose.Types.ObjectId
  hubId?: mongoose.Types.ObjectId
  externalStoreId?: string
  externalStoreName?: string

  /** 'api' = Official API keys/OAuth2 (legacy). 'auto' = Automation merchant login. */
  loginMode: 'api' | 'auto'

  /** Official API credentials (api mode). Encrypted AES-256-GCM JSON. */
  credentials: Record<string, string>

  // ─── Auto-login mode fields ────────────────────────────────────────────────
  /** Merchant portal username (phone / email). Plain text — low sensitivity. */
  loginUsername?: string
  /** Merchant portal password. AES-256-GCM encrypted. */
  loginPassword?: string
  /** How expired sessions should be re-established. */
  sessionRefreshMode?: 'auto' | 'browser'
  /** Session cookies captured by Playwright. AES-256-GCM encrypted JSON (PlaywrightCookie[]). */
  sessionData?: string
  /** Lifecycle state of the stored session. */
  sessionStatus: 'none' | 'active' | 'expired' | 'error'
  /** When the session was last captured. */
  sessionCapturedAt?: Date
  /** Estimated session expiry (platform-dependent). */
  sessionExpiresAt?: Date
  /** Last error from automation login. */
  sessionError?: string
  /** Consecutive session failures used to soften transient Grab portal flapping. */
  sessionFailureCount?: number
  /** Whether automation is currently running for this integration. */
  automationRunning: boolean
  // ──────────────────────────────────────────────────────────────────────────

  isActive: boolean
  lastSyncAt?: Date
  syncStatus?: 'idle' | 'syncing' | 'success' | 'error'
  syncError?: string
  createdBy: mongoose.Types.ObjectId
}

const IntegrationSchema = new Schema<IIntegration>({
  provider:          { type: String, enum: ['shopee', 'grab', 'xanh_sm', 'be'], required: true },
  brandId:           { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  hubId:             { type: Schema.Types.ObjectId, ref: 'Hub' },
  externalStoreId:   { type: String },
  externalStoreName: { type: String },

  loginMode:         { type: String, enum: ['api', 'auto'], default: 'api' },

  credentials:       { type: Map, of: String, select: false },

  loginUsername:     { type: String },
  loginPassword:     { type: String, select: false },
  sessionRefreshMode:{ type: String, enum: ['auto', 'browser'], default: 'auto' },
  sessionData:       { type: String, select: false },
  sessionStatus:     { type: String, enum: ['none', 'active', 'expired', 'error'], default: 'none' },
  sessionCapturedAt: { type: Date },
  sessionExpiresAt:  { type: Date },
  sessionError:      { type: String },
  sessionFailureCount: { type: Number, default: 0 },
  automationRunning: { type: Boolean, default: false },

  isActive:          { type: Boolean, default: true },
  lastSyncAt:        { type: Date },
  syncStatus:        { type: String, enum: ['idle', 'syncing', 'success', 'error'], default: 'idle' },
  syncError:         { type: String },
  createdBy:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

export default mongoose.models.Integration || mongoose.model<IIntegration>('Integration', IntegrationSchema)
