import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

function readToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

/**
 * The one-time token from an email link (/reset-password#token=…). The fragment never reaches a
 * server; it is also removed from the address bar so it doesn't linger in history or screenshots.
 */
export function useLinkToken(): string | null {
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => readToken(location.hash))

  useEffect(() => {
    if (location.hash) {
      void navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true })
    }
  }, [location, navigate])

  return token
}
