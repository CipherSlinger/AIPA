import { createContext, useContext } from 'react'

/**
 * True while the find bar is searching tool-card text ("Include tool output").
 *
 * A context rather than store state: the mode begins and ends with one find
 * bar, and a context value change re-renders exactly the components that care
 * (tool cards, collapsed bodies) even though they sit under `React.memo`.
 * Unmounting the provider — closing or leaving the chat — ends the mode by
 * itself, so there is no flag left behind that could keep a transcript
 * expanded after the search is gone.
 *
 * Default false: any tool block rendered outside a find session behaves
 * exactly as before.
 */
export const FindDeepContext = createContext(false)

export function useFindDeep(): boolean {
  return useContext(FindDeepContext)
}
