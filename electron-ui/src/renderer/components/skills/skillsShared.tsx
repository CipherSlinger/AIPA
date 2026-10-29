// Shared types for the Skills UI. The Skills list now lives on the Employees page
// (see components/workflows/EmployeesSkillsSection.tsx); the old panel-only helpers
// (TabButton, CategoryPill) were removed with it.

export interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
  tags?: string[]
  /**
   * Provenance recorded when the skill was drafted from a conversation.
   * Absent for skills installed before wave 64 and for hand-written skills,
   * which is why the detail view renders nothing rather than "unknown".
   */
  sourceConversation?: string
  sourceTitle?: string
  createdAt?: string
}
