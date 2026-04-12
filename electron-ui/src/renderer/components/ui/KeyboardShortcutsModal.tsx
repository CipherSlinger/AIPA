import React, { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props { onClose: () => void }

/**
 * Lightweight keyboard shortcuts reference modal.
 * Triggered by pressing '?' when not in an input field, or Ctrl+/.
 *
 * Note: The full-featured cheatsheet (with search) is in
 * components/shared/ShortcutCheatsheet.tsx — App.tsx renders that.
 * This component is a standalone lightweight version for embedding elsewhere.
 */
const SHORTCUT_GROUPS = [
  {
    category: '对话',
    items: [
      { keys: ['Enter'], desc: '发送消息' },
      { keys: ['Shift', 'Enter'], desc: '换行' },
      { keys: ['Escape'], desc: '中止生成' },
      { keys: ['Ctrl', 'Shift', 'K'], desc: '压缩上下文 (/compact)' },
      { keys: ['Ctrl', 'Shift', 'R'], desc: '重新生成回复' },
      { keys: ['Ctrl', 'U'], desc: '清空输入框' },
    ],
  },
  {
    category: '导航',
    items: [
      { keys: ['Ctrl', 'L'], desc: '聚焦输入框' },
      { keys: ['Ctrl', 'B'], desc: '切换侧栏' },
      { keys: ['Ctrl', 'N'], desc: '新建对话（双击）' },
      { keys: ['Ctrl', 'K'], desc: '会话快速切换' },
      { keys: ['Ctrl', '['], desc: '上一个会话' },
      { keys: ['Ctrl', ']'], desc: '下一个会话' },
      { keys: ['Ctrl', '1-8'], desc: '切换侧栏标签页' },
    ],
  },
  {
    category: '界面',
    items: [
      { keys: ['Ctrl', ','], desc: '打开设置' },
      { keys: ['Ctrl', 'Shift', 'P'], desc: '命令面板' },
      { keys: ['Ctrl', '/'], desc: '快捷键参考（本页）' },
      { keys: ['?'], desc: '快捷键参考（本页）' },
      { keys: ['Ctrl', 'Shift', 'O'], desc: '专注模式' },
      { keys: ['Ctrl', 'Shift', 'D'], desc: '切换主题' },
      { keys: ['Ctrl', 'Shift', 'L'], desc: '切换语言' },
      { keys: ['Ctrl', 'Shift', 'M'], desc: '切换模型' },
    ],
  },
  {
    category: '对话管理',
    items: [
      { keys: ['Ctrl', 'F'], desc: '在对话中搜索' },
      { keys: ['Ctrl', 'Shift', 'F'], desc: '全局跨会话搜索' },
      { keys: ['Ctrl', 'Shift', 'E'], desc: '导出对话' },
      { keys: ['Ctrl', 'Home'], desc: '跳到第一条消息' },
      { keys: ['Ctrl', 'End'], desc: '跳到最后一条消息' },
      { keys: ['Ctrl', 'Shift', 'C'], desc: '折叠/展开所有消息' },
    ],
  },
]

export default function KeyboardShortcutsModal({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(15,15,25,0.95)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16, padding: '24px 28px',
          maxWidth: 520, width: '90%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.5)',
          maxHeight: '80vh', overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.10) transparent',
        }}
      >
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.82)', letterSpacing: '-0.01em' }}>
            键盘快捷键
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 6, cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
              padding: '4px 7px', display: 'flex', alignItems: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* 分组 */}
        {SHORTCUT_GROUPS.map(group => (
          <div key={group.category} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.38)',
              marginBottom: 10,
            }}>
              {group.category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {group.items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)' }}>{item.desc}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    {item.keys.map((key, ki) => (
                      <React.Fragment key={ki}>
                        <kbd style={{
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderBottom: '2px solid rgba(255,255,255,0.20)',
                          borderRadius: 5, padding: '2px 7px',
                          fontSize: 11, fontWeight: 600,
                          color: 'rgba(255,255,255,0.82)',
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                        }}>
                          {key}
                        </kbd>
                        {ki < item.keys.length - 1 && (
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>
          按 Escape 关闭
        </div>
      </div>
    </div>
  )
}
