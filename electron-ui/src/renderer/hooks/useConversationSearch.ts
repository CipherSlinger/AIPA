import { useState, useCallback } from 'react'
import { ChatMessage, StandardChatMessage } from '../types/app.types'

/**
 * Manages conversation search state: open/close, query, matches, navigation.
 */
export function useConversationSearch(messages: ChatMessage[]) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<number[]>([])
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchMatches([])
      setCurrentMatchIdx(0)
      return
    }
    const lower = query.toLowerCase()
    const matches: number[] = []
    messages.forEach((msg, idx) => {
      if (msg.role === 'permission' || msg.role === 'plan') return
      const content = (msg as StandardChatMessage).content || ''
      if (content.toLowerCase().includes(lower)) {
        matches.push(idx)
      }
    })
    setSearchMatches(matches)
    setCurrentMatchIdx(0)
  }, [messages])

  const handleSearchNavigate = useCallback((direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return
    setCurrentMatchIdx(prev => {
      if (direction === 'next') return (prev + 1) % searchMatches.length
      return (prev - 1 + searchMatches.length) % searchMatches.length
    })
  }, [searchMatches.length])

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchMatches([])
    setCurrentMatchIdx(0)
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
  }, [])

  return {
    searchOpen,
    searchQuery,
    searchMatches,
    currentMatchIdx,
    handleSearch,
    handleSearchNavigate,
    handleSearchClose,
    openSearch,
    setSearchOpen,
  }
}
