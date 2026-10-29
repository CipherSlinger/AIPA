// The slash command a skill becomes in the chat composer.
//
// Every surface that hands a skill to chat used to spell the transformation
// out inline: spaces collapsed to hyphens, the whole name lowercased. Keeping
// it here means the marketplace's Use action, the Employees card action and
// the skill page's Run now cannot drift apart — a command shown on one surface
// is exactly the command inserted by another.
//
// Deliberately React-free: the harness executes this against the marketplace's
// original rule for the same inputs.

export function skillSlashCommand(name: string): string {
  return `/${name.replace(/\s+/g, '-').toLowerCase()}`
}
