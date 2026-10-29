// The archive ledger's selection rule.
//
// The rule itself lives in `lib/rowSelection.ts` now that "Recently deleted"
// has a checkbox column too: one implementation of none/some/all, select-all
// and the prune, shared by both lists instead of two copies that drift. This
// module is kept as the archive's import path so the panel and the harnesses
// written against it keep working unchanged.
export * from '../../lib/rowSelection'
