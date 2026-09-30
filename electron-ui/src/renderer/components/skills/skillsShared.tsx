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
}
