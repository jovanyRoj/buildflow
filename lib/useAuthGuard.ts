'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from './auth'
import { useBuildFlowStore } from './store'

export function useAuthGuard() {
  const [ready, setReady] = useState(false)
  const { currentUser, setCurrentUser } = useBuildFlowStore()
  const router = useRouter()

  useEffect(() => {
    // On first render, restore session from localStorage
    if (!currentUser) {
      const session = getSession()
      if (session) {
        setCurrentUser(session)
        setReady(true)
      } else {
        router.replace('/login')
      }
    } else {
      setReady(true)
    }
  }, [])

  return { ready, user: currentUser }
}
