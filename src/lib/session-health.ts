type SessionSuccessFields = Record<string, unknown>

const GRAB_SESSION_FAILURE_THRESHOLD = 2

export function buildSessionSuccessUpdate(fields: SessionSuccessFields) {
  return {
    $set: {
      ...fields,
      sessionFailureCount: 0,
    },
    $unset: { sessionError: 1 },
  }
}

export function buildSessionClearUpdate(fields: SessionSuccessFields = {}, unsetFields: string[] = []) {
  const unset = unsetFields.reduce<Record<string, 1>>((acc, field) => {
    acc[field] = 1
    return acc
  }, { sessionError: 1 })

  return {
    $set: {
      ...fields,
      sessionFailureCount: 0,
    },
    $unset: unset,
  }
}

export function buildSessionFailureUpdate(options: {
  provider: string
  currentFailureCount?: number
  errorMessage: string
  fallbackStatus?: 'error' | 'expired' | 'none' | 'active'
  extraSet?: Record<string, unknown>
}) {
  const {
    provider,
    currentFailureCount = 0,
    errorMessage,
    fallbackStatus = 'error',
    extraSet = {},
  } = options

  if (provider === 'grab') {
    const nextFailureCount = currentFailureCount + 1
    return {
      $set: {
        ...extraSet,
        sessionStatus: nextFailureCount >= GRAB_SESSION_FAILURE_THRESHOLD ? 'expired' : 'error',
        sessionError: errorMessage,
        sessionFailureCount: nextFailureCount,
      },
    }
  }

  return {
    $set: {
      ...extraSet,
      sessionStatus: fallbackStatus,
      sessionError: errorMessage,
    },
  }
}