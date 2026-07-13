'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from './auth'
import { useBrivoxStore } from './store'

export function useAuthGuard() {
  const [ready, setReady] = useState(false)
  const { currentUser, setCurrentUser } = useBrivoxStore()
  const router = useRouter()

  useEffect(() => {
    if (currentUser) {
      setReady(true)
      return
    }
    getSession().then((session) => {
      if (session) {
        setCurrentUser(session).then(() => setReady(true))
      } else {
        router.replace('/login')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, user: currentUser }
}
