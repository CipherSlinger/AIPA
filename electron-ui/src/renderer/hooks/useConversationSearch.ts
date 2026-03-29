import { useState, useCallback, useRef } from 'react'
import { ChatMessage, StandardChatMessage } from '../types/app.types'

export type SearchRoleFilter = 'all' | 'user' | 'assistant'

/**
 * Manages conversation search state: open/close, query, matches, navigation.
 * Supports case-sensitive toggle and role-based filtering.
 */
export function useConversationSearch(messages: ChatMessage[]) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<number[]>([])
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [roleFilter, setRoleFilter] = useState<SearchRoleFilter>('all')

  // Keep refs to current options so the search function always has latest values
  const caseSensitiveRef = useRef(caseSensitive)
  caseSensitiveRef.current = caseSensitive
  const roleFilterRef = useRef(roleFilter)
  roleFilterRef.current = roleFilter

  const performSearch = useCallback((query: string, cs: boolean, role: SearchRoleFilter) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchMatches([])
      setCurrentMatchIdx(0)
      return
    }
    const matches: number[] = []
    messages.forEach((msg, idx) => {
      if (msg.role === 'permission' || msg.role === 'plan') return
      if (role === 'user' && msg.role !== 'user') return
      if (role === 'assistant' && msg.role !== 'assistant') return
      const content = (msg as StandardChatMessage).content || ''
      const found = cs
        ? content.includes(query)
        : content.toLowerCase().includes(query.toLowerCase())
      if (found) {
        matches.push(idx)
      }
    })
    setSearchMatches(matches)
    setCurrentMatchIdx(0)
  }, [messages])

  const handleSearch = useCallback((query: string) => {
    performSearch(query, caseSensitiveRef.current, roleFilterRef.current)
  }, [performSearch])

  const toggleCaseSensitive = useCallback(() => {
    const newVal = !caseSensitiveRef.current
    setCaseSensitive(newVal)
    caseSensitiveRef.current = newVal
    performSearch(searchQuery, newVal, roleFilterRef.current)
  }, [performSearch, searchQuery])

  const changeRoleFilter = useCallback((role: SearchRoleFilter) => {
    setRoleFilter(role)
    roleFilterRef.current = role
    performSearch(searchQuery, caseSensitiveRef.current, role)
  }, [performSearch, searchQuery])

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
    setCaseSensitive(false)
    setRoleFilter('all')
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
  }, [])

  return {
    searchOpen,
    searchQuery,
    searchMatches,
    currentMatchIdx,
    caseSensitive,
    roleFilter,
    handleSearch,
    handleSearchNavigate,
    handleSearchClose,
    toggleCaseSensitive,
    changeRoleFilter,
    openSearch,
    setSearchOpen,
  }
}
