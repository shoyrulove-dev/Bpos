import dns from 'dns'
import dotenv from 'dotenv'
import mongoose from 'mongoose'

dotenv.config({ path: '.env.local' })
dns.setServers(['8.8.8.8', '1.1.1.1'])

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bpos'

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null }

if (!global.mongooseCache) {
  global.mongooseCache = cached
}

export async function connectDB() {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    throw e
  }

  return cached.conn
}
