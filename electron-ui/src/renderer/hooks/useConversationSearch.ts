import { useState, useCallback, useRef } from 'react'
import { ChatMessage, StandardChatMessage } from '../types/app.types'

export type SearchRoleFilter = 'all' | 'user' | 'assistant'

/**
 * WeakMap cache for lowercased search text per message.
 * Inspired by Claude Code's utils/transcriptSearch.ts — avoids recomputing
 * on every keystroke by caching the lowercased text per message object.
 * WeakMap ensures entries are GC'd when the message object is no longer referenced.
 */
const messageSearchTextCache = new WeakMap<object, string>()

function getMessageSearchText(msg: ChatMessage): string {
  const key = msg as object
  if (messageSearchTextCache.has(key)) return messageSearchTextCache.get(key)!
  const content = (msg as StandardChatMessage).content || ''
  const annotation = (msg as StandardChatMessage).annotation || ''
  const text = (content + (annotation ? '\n' + annotation : '')).toLowerCase()
  messageSearchTextCache.set(key, text)
  return text
}

/**
 * Manages conversation search state: open/close, query, matches, navigation.
 * Supports case-sensitive toggle and role-based filtering.
 * Iteration 488: Added WeakMap cache for lowercased message text to reduce keystroke lag.
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
    const queryLower = query.toLowerCase()
    const matches: number[] = []
    messages.forEach((msg, idx) => {
      if (msg.role === 'permission' || msg.role === 'plan') return
      if (role === 'user' && msg.role !== 'user') return
      if (role === 'assistant' && msg.role !== 'assistant') return
      const found = cs
        // Case-sensitive: build text on the fly (no cache for this path)
        ? ((msg as StandardChatMessage).content || '').includes(query)
        // Case-insensitive: use WeakMap cache to avoid repeated .toLowerCase() per keystroke
        : getMessageSearchText(msg).includes(queryLower)
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
