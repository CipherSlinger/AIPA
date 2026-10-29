/**
 * The four non-`cli:*` subscriptions the stream hook registers alongside the
 * event listener. Moved verbatim (wave 75C) from `useStreamJson`'s effect;
 * the registration order and the cleanup order are unchanged. Returns one
 * cleanup that removes them in the order the effect used to.
 */
import { useChatStore, useUiStore } from '../../store'
import type { StreamJsonEventContext } from './eventContext'

export function subscribeStreamJsonListeners(ctx: StreamJsonEventContext): () => void {
  const { activeBridgeIdRef, sendMessageRef, stopStreamingAndReleaseSleep } = ctx
  // Listen for multi-agent plan approval requests (P3-3)
  const unsubPlanApproval = window.electronAPI.onPlanApprovalRequest?.((data) => {
    useChatStore.getState().setPendingPlanApproval({
      sessionId: data.sessionId,
      requestId: data.requestId,
      from: data.from,
      planContent: data.planContent,
      planFilePath: data.planFilePath,
    })
  })

  // Listen for provider failover events
  const unsubFailover = window.electronAPI.onProviderFailover((data) => {
    useUiStore.getState().addToast('warning',
      `Failover: ${data.fromProvider} -> ${data.toProvider}. ${data.reason}`
    )
  })

  // Listen for tab-close abort event (Iteration 515)
  const handleAbortStream = () => {
    const sid = activeBridgeIdRef.current
    if (sid) {
      window.electronAPI.cliAbort(sid)
      activeBridgeIdRef.current = null
    }
    useChatStore.getState().denyPendingPermissions()
    stopStreamingAndReleaseSleep()
  }
  window.addEventListener('aipa:abortStream', handleAbortStream)

  // Listen for send-message events dispatched by tool cards (e.g. AskUserQuestionCard) (Iteration 540)
  const handleSendMessage = (e: Event) => {
    const text = (e as CustomEvent<{ text: string }>).detail?.text
    if (text) sendMessageRef.current?.(text)
  }
  window.addEventListener('aipa:sendMessage', handleSendMessage)

  return () => {
    unsubFailover()
    unsubPlanApproval?.()
    window.removeEventListener('aipa:abortStream', handleAbortStream)
    window.removeEventListener('aipa:sendMessage', handleSendMessage)
  }
}
