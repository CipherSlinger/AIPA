// Which face a department wears in the org chart.
//
// A department is not a box — it is a small team of people, one of whom stands
// for the whole desk in the chart. That stand-in has to read at a glance:
// a QA desk and a design studio should not both be the same round head.
//
// The look is decided by the department's *name*, not its colour. A template
// node keeps that `name` frozen in whichever locale was active when it was
// applied — the display translation lives in `presetName` — so switching
// language does not re-cast every face. The same department therefore arrives
// as "Product" or "产品部" depending on the install. Every rule below carries
// both spellings, and the whole list is matched against a lower-cased name, so
// English and Chinese are one lookup.
//
// The list is ordered most-specific first. `研究设计部` (Study Design) must hit
// its own rule before the generic `设计` (design) rule swallows it, and
// `仓储物流部` (Fulfilment) must beat the `仓储` (warehouse) rule for the same
// reason. Keep that ordering in mind when adding a rule: a later rule only ever
// sees names no earlier rule matched.
//
// Departments the user made themselves have no template name, so they fall
// through to a keyword pass over broader categories (`engineering`, `finance`,
// …) and, failing that, to a hash of the department id. The hash is stable
// across reloads because the id is persisted, so a hand-made department keeps
// its face forever even if it matches nothing here.

import type { FaceLook } from '../avatars/CharacterFace'

/** Glasses styles the face art offers. */
export type DeptGlasses = 'round' | 'square' | 'none'

export interface DeptFace {
  look: FaceLook
  glasses: DeptGlasses
}

/** The minimum a department has to expose for its face to be resolved. */
export interface FaceSource {
  id: string
  name: string
}

/**
 * Most specific first. Each entry is [name fragments, look, glasses].
 *
 * Grouping principle:
 *   bob      — product, editorial, management, store-keeping
 *   crop     — engineering, QA, review, compliance, hands-on analysts
 *   curly    — design, creative, visualisation, photo/video
 *   ponytail — data, research, literature, sourcing
 *   spiky    — ops, infra, security, logistics, distribution
 *   medium   — writing, support, outreach, finance
 *
 * Glasses are the second axis: `square` for people who judge work (product,
 * review, compliance), `round` for people who read data (research, data,
 * design), `none` for people who run things (ops, logistics, support).
 */
const RULES: ReadonlyArray<readonly [readonly string[], FaceLook, DeptGlasses]> = [
  // ── Research-specific, before the generic design/data rules ───────────────
  [['研究设计', 'study design'], 'bob', 'square'],
  [['仿真', 'simulation'], 'crop', 'round'],
  [['实测', 'empirical'], 'crop', 'none'],
  [['建模', 'modelling', 'modeling'], 'crop', 'round'],
  [['文献', 'literature'], 'ponytail', 'round'],
  [['数据采集', 'data collection'], 'crop', 'none'],
  [['数据分析', 'data analysis', 'analytics'], 'ponytail', 'square'],
  [['可视化', 'visualisation', 'visualization', '图表'], 'curly', 'round'],
  [['同行审校', 'internal review'], 'crop', 'square'],

  // ── Content-specific ──────────────────────────────────────────────────────
  [['编辑审校', 'copy edit'], 'crop', 'square'],
  [['选题', 'editorial'], 'bob', 'square'],
  // The two writing teams share their parent's family, but not their faces —
  // two chips side by side under 撰稿部 have to be tellable apart.
  [['长文', 'long form', 'longform'], 'medium', 'round'],
  [['短内容', '短文案', 'short form', 'shortform'], 'medium', 'square'],
  [['摄影', 'photo', 'video'], 'curly', 'round'],
  [['音频', 'audio'], 'medium', 'round'],
  [['发行', 'distribution'], 'spiky', 'none'],
  [['平台', 'platform'], 'spiky', 'none'],
  [['社媒', 'social'], 'bob', 'none'],
  [['商务', 'partnership'], 'bob', 'none'],
  [['学术交流', 'outreach'], 'medium', 'round'],
  [['基金', 'grant'], 'bob', 'round'],
  [['论文', 'paper'], 'medium', 'none'],

  // ── E-commerce-specific ───────────────────────────────────────────────────
  [['店铺运营', 'store operations'], 'bob', 'square'],
  [['国内', 'domestic'], 'bob', 'none'],
  [['海外', 'overseas'], 'bob', 'round'],
  [['仓储物流', 'fulfilment', 'fulfillment', '物流'], 'spiky', 'square'],
  [['仓储', 'warehouse'], 'spiky', 'none'],
  [['配送', 'delivery', 'logistics'], 'spiky', 'round'],
  [['供应链', 'supply chain'], 'spiky', 'none'],
  [['选品', 'sourcing'], 'ponytail', 'round'],
  [['财务', 'finance', 'accounting'], 'medium', 'round'],
  [['合规', 'compliance', '法务', 'legal'], 'crop', 'square'],
  [['增长', 'growth'], 'ponytail', 'round'],

  // ── Software-specific ─────────────────────────────────────────────────────
  [['设计系统', 'design system'], 'curly', 'round'],
  [['前端', 'frontend'], 'crop', 'round'],
  [['后端', 'backend'], 'crop', 'none'],
  [['测试', 'qa', 'quality'], 'crop', 'square'],
  [['运维', 'devops', 'sre', 'infrastructure', 'infra'], 'spiky', 'none'],
  [['安全', 'security'], 'spiky', 'square'],
  [['客户成功', 'customer success'], 'medium', 'none'],
  [['客服', 'support'], 'medium', 'none'],

  // ── Broad categories — hand-made departments land here ───────────────────
  [['产品', 'product'], 'bob', 'square'],
  [['设计', 'design'], 'curly', 'none'],
  [['创意', 'creative'], 'curly', 'none'],
  [['视觉', 'visual'], 'curly', 'none'],
  [['市场', 'marketing'], 'bob', 'round'],
  [['运营', 'operations'], 'bob', 'round'],
  [['研发', 'engineering', 'engineer', 'develop'], 'crop', 'round'],
  [['数据', 'data'], 'ponytail', 'round'],
  [['研究', 'research'], 'ponytail', 'round'],
  [['分析', 'analysis'], 'ponytail', 'round'],
  [['写作', 'writing', '撰稿'], 'medium', 'none'],
  [['编辑', 'edit'], 'medium', 'none'],
  [['文档', 'documentation', 'docs'], 'medium', 'none'],
  [['人力', 'people', 'recruit'], 'bob', 'none'],
  [['行政', 'office', 'admin'], 'bob', 'none'],
  [['课程', 'education', 'teaching'], 'medium', 'round'],
  [['销售', 'sales'], 'bob', 'none'],
  [['采购', 'procurement'], 'ponytail', 'square'],
]

// Deterministic fallbacks for names no rule recognises. Ids are persisted, so
// the same department keeps the same face across reloads.
const FALLBACK_LOOKS: readonly FaceLook[] = ['bob', 'crop', 'curly', 'ponytail', 'spiky', 'medium']
const FALLBACK_GLASSES: readonly DeptGlasses[] = ['none', 'round', 'square']

// A company is a person too, but a more senior one — the crown badge carries the
// rest of the meaning, so the face only has to look assured.
const COMPANY_LOOKS: readonly FaceLook[] = ['medium', 'bob', 'crop']

/** FNV-1a — stable across runs and platforms. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function fallback(seed: string): DeptFace {
  const h = hashId(seed)
  return {
    look: FALLBACK_LOOKS[h % FALLBACK_LOOKS.length],
    glasses: FALLBACK_GLASSES[(h >>> 8) % FALLBACK_GLASSES.length],
  }
}

/**
 * The face for a department. `name` wins; `id` only breaks a tie that no rule
 * did, so renaming a department to a role we understand re-casts it, which is
 * the intended behaviour.
 */
export function resolveFace(name: string, seed: string): DeptFace {
  const haystack = name.toLowerCase()
  for (const [keys, look, glasses] of RULES) {
    if (keys.some(key => haystack.includes(key))) return { look, glasses }
  }
  return fallback(seed)
}

export function faceForDepartment(dept: FaceSource): DeptFace {
  return resolveFace(dept.name, dept.id)
}

/** The figure that stands for a whole company — a calmer, more senior face. */
export function faceForCompany(seed: string): DeptFace {
  const h = hashId(seed)
  return {
    look: COMPANY_LOOKS[h % COMPANY_LOOKS.length],
    glasses: (h >>> 8) % 2 === 0 ? 'square' : 'round',
  }
}