// Whole-company templates — one per kind of company.
//
// A brand-new install has an empty org chart, and every department is three
// decisions (name, folder, colour) the user would have to invent from nothing.
// A template answers all of them for an entire company at once: it creates the
// company → department → team folders on disk, registers every node, and hangs
// a set of **ghost positions** on them.
//
// A ghost position is a job title plus its brief and nothing else — no session,
// no model call, no folder of its own. Hiring one (「上岗」) turns the brief into
// that employee's first message. So applying a template is free and reversible;
// you pay for the employees you actually put to work.
//
// Node names, position titles and briefs are NOT UI copy: once applied they are
// user data, stored in localStorage and renameable. So each carries both
// locales and we freeze whichever was active at creation, rather than letting a
// later language switch rename the user's own company.

import { useDepartmentStore, type Department, type OrgNodeKind, type Position } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { DEPT_COLORS, baseName, dirToSlug, joinPath, normalizePath } from './deptUtils'

export type Locale = 'en' | 'zh-CN'

/** UI copy for the picker card — the only part that goes through i18n. */
export interface TemplatePosition {
  title: { en: string; zh: string }
  /** 2-3 concrete sentences. Becomes the employee's first message on 上岗. */
  brief: { en: string; zh: string }
}

export interface TemplateNode {
  name: { en: string; zh: string }
  color?: string
  positions?: TemplatePosition[]
  /** Sub-nodes. In practice only one level deep — a department's teams. */
  teams?: TemplateNode[]
}

/** The kind of a node's children, derived from what the node itself is. */
const CHILD_KIND: Record<OrgNodeKind, OrgNodeKind | null> = {
  company: 'department',
  department: 'team',
  team: null,
}

export interface CompanyTemplate {
  id: string
  labelKey: string
  descKey: string
  name: { en: string; zh: string }
  departments: TemplateNode[]
}

export const COMPANY_TEMPLATES: CompanyTemplate[] = [
  // ── 软件公司 ───────────────────────────────────────────────────────────────
  {
    id: 'software',
    labelKey: 'dept.presets.domains.software',
    descKey: 'dept.presets.domains.softwareDesc',
    name: { en: 'Software Company', zh: '软件公司' },
    departments: [
      {
        name: { en: 'Product', zh: '产品部' },
        color: '#818cf8',
        positions: [
          {
            title: { en: 'Product Manager', zh: '产品经理' },
            brief: {
              en: 'Own the roadmap for the flagship product. Turn user feedback and business goals into a prioritised backlog, and write the spec the team builds from.',
              zh: '负责旗舰产品的路线图。把用户反馈与业务目标整理成优先级明确的需求列表，并写出团队据此开发的文档。',
            },
          },
          {
            title: { en: 'User Researcher', zh: '用户研究员' },
            brief: {
              en: 'Talk to users every week and turn what you hear into evidence. Maintain the interview guide and keep a running insight log the whole team can read.',
              zh: '每周访谈用户，把听到的东西整理成证据。维护访谈提纲，并保持一份全员可读的洞察记录。',
            },
          },
        ],
      },
      {
        name: { en: 'Design', zh: '设计部' },
        color: '#a78bfa',
        positions: [
          {
            title: { en: 'UI Designer', zh: '界面设计师' },
            brief: {
              en: 'Design the product surfaces end to end. Keep the component library consistent and hand off specs engineers can build without asking.',
              zh: '端到端设计产品界面。保持组件库一致，交付工程师无需追问就能实现的标注。',
            },
          },
        ],
        teams: [
          {
            name: { en: 'Design System', zh: '设计系统组' },
            color: '#c4b5fd',
            positions: [
              {
                title: { en: 'Design System Lead', zh: '设计系统负责人' },
                brief: {
                  en: 'Own the design tokens and the component contracts. Review every new pattern before it ships, and keep the docs in step with the code.',
                  zh: '负责设计变量与组件契约。所有新模式上线前由你评审，并保持文档与代码同步。',
                },
              },
            ],
          },
        ],
      },
      {
        name: { en: 'Engineering', zh: '研发部' },
        color: '#6366f1',
        positions: [
          {
            title: { en: 'Tech Lead', zh: '技术负责人' },
            brief: {
              en: 'Own the architecture and the build. Break work down to a size two people can run in parallel, keep the main branch buildable, and review every merge.',
              zh: '负责架构与构建。把任务拆到两个人能并行的粒度，保持主干随时可构建，并评审每一次合并。',
            },
          },
        ],
        teams: [
          {
            name: { en: 'Frontend', zh: '前端组' },
            color: '#818cf8',
            positions: [
              {
                title: { en: 'Frontend Engineer', zh: '前端工程师' },
                brief: {
                  en: 'Build the user-facing surfaces in React and TypeScript. Get the build green before handing anything over, and ask before touching the design system.',
                  zh: '用 React 与 TypeScript 构建用户界面。交付前自行跑通构建，改动设计系统前先确认。',
                },
              },
            ],
          },
          {
            name: { en: 'Backend', zh: '后端组' },
            color: '#4f46e5',
            positions: [
              {
                title: { en: 'Backend Engineer', zh: '后端工程师' },
                brief: {
                  en: 'Own the services and the data model. Migrations must be reversible, and anything you ship needs logs and metrics before it needs praise.',
                  zh: '负责服务与数据模型。迁移脚本必须可回滚，上线的东西先有日志和指标，再谈别的。',
                },
              },
            ],
          },
        ],
      },
      {
        name: { en: 'QA', zh: '测试部' },
        color: '#4ade80',
        positions: [
          {
            title: { en: 'QA Engineer', zh: '测试工程师' },
            brief: {
              en: 'Decide what "done" means for each release. Maintain the regression suite and write reproduction steps an engineer can actually follow.',
              zh: '为每次发版定义「完成」的标准。维护回归用例，并写出工程师真的能照着复现的步骤。',
            },
          },
        ],
      },
      {
        name: { en: 'DevOps', zh: '运维部' },
        color: '#14b8a6',
        positions: [
          {
            title: { en: 'Site Reliability Engineer', zh: '站点可靠性工程师' },
            brief: {
              en: 'Own uptime and the deploy pipeline. Automate the toil and write the runbook before the first incident, not after it.',
              zh: '负责可用性与部署流水线。把重复劳动自动化，并在第一次故障之前而不是之后写好手册。',
            },
          },
        ],
      },
      {
        name: { en: 'Data', zh: '数据部' },
        color: '#fbbf24',
        positions: [
          {
            title: { en: 'Data Analyst', zh: '数据分析师' },
            brief: {
              en: 'Answer product questions with the data we already have. Ship dashboards people open on their own, and say plainly when the data cannot answer the question.',
              zh: '用现有数据回答产品问题。做出大家会主动打开的看板；数据回答不了的问题就直接说。',
            },
          },
        ],
      },
      {
        name: { en: 'Security', zh: '安全部' },
        color: '#f87171',
        positions: [
          {
            title: { en: 'Security Engineer', zh: '安全工程师' },
            brief: {
              en: 'Threat-model new features before they ship, and own the repository dependency and secret hygiene.',
              zh: '在新功能上线前做威胁建模，并负责仓库的依赖与密钥卫生。',
            },
          },
        ],
      },
      {
        name: { en: 'Customer Success', zh: '客户成功部' },
        color: '#ec4899',
        positions: [
          {
            title: { en: 'Support Engineer', zh: '技术支持工程师' },
            brief: {
              en: 'Be the first responder for user reports. Reproduce, triage, and turn recurring issues into tickets the team can act on.',
              zh: '做用户反馈的第一响应人。复现、分级，并把反复出现的问题变成团队能处理的工单。',
            },
          },
        ],
      },
      {
        name: { en: 'Marketing', zh: '市场部' },
        color: '#f97316',
        positions: [
          {
            title: { en: 'Product Marketing', zh: '产品市场' },
            brief: {
              en: 'Own positioning and launch copy. Explain what we built to the people who need it, in their own words.',
              zh: '负责定位与发布文案。用目标用户自己的语言，把我们的产品讲给需要它的人。',
            },
          },
        ],
      },
    ],
  },

  // ── 内容工作室 ─────────────────────────────────────────────────────────────
  {
    id: 'content',
    labelKey: 'dept.presets.domains.content',
    descKey: 'dept.presets.domains.contentDesc',
    name: { en: 'Content Studio', zh: '内容工作室' },
    departments: [
      {
        name: { en: 'Editorial', zh: '选题策划部' },
        color: '#fbbf24',
        positions: [
          {
            title: { en: 'Editor', zh: '选题策划' },
            brief: {
              en: 'Pitch executable story ideas every day, each with an angle, a target reader and a rough length. Record why rejected pitches were rejected so they are not re-pitched.',
              zh: '每天提出可执行的选题，附上角度、目标读者和大致篇幅。被否掉的选题记下原因，避免重复提。',
            },
          },
        ],
      },
      {
        name: { en: 'Writing', zh: '撰稿部' },
        color: '#ec4899',
        positions: [
          {
            title: { en: 'Editorial Lead', zh: '内容主编' },
            brief: {
              en: 'Own the writing department: keep the pitch queue moving, match writers to topics, and read every draft before it leaves for review. Report what is stuck and what is ready.',
              zh: '负责撰稿部：维护选题队列的流转，把选题分配给合适的撰稿人，每篇稿子在送审前先读一遍。定期说明哪些卡住了、哪些已就绪。',
            },
          },
        ],
        teams: [
          {
            name: { en: 'Long Form', zh: '长文组' },
            color: '#f472b6',
            positions: [
              {
                title: { en: 'Long-form Writer', zh: '长文撰稿' },
                brief: {
                  en: 'Turn pitches into finished drafts. Send the structure and the central argument first and expand only after it is agreed — never a long draft in one go.',
                  zh: '把选题写成完整的稿子。先给结构和核心论点，确认之后再展开，不要一次性交长文。',
                },
              },
            ],
          },
          {
            name: { en: 'Short Form', zh: '短内容组' },
            color: '#db2777',
            positions: [
              {
                title: { en: 'Short-form Writer', zh: '短文案' },
                brief: {
                  en: 'Own headlines, summaries and social copy. Give three options per piece and say which one you recommend and why.',
                  zh: '负责标题、摘要和社媒短文案。同一条内容给三个备选，并说明你推荐哪一个、为什么。',
                },
              },
            ],
          },
        ],
      },
      {
        name: { en: 'Design', zh: '设计部' },
        color: '#a78bfa',
        positions: [
          {
            title: { en: 'Visual Designer', zh: '视觉设计' },
            brief: {
              en: 'Own covers, illustrations and page layout. Keep one template family so a reader recognises us at a glance.',
              zh: '负责封面、配图与版式。保持同一套模板，让读者一眼就认得出是我们。',
            },
          },
        ],
      },
      {
        name: { en: 'Photo & Video', zh: '摄影影像部' },
        color: '#14b8a6',
        positions: [
          {
            title: { en: 'Photo & Video Producer', zh: '摄影摄像' },
            brief: {
              en: 'Own shooting and the media library. Name raw files by date and story so anyone can pull the right clip without asking.',
              zh: '负责拍摄与素材归档。原始素材按日期与选题命名，让别人不用问就能取到要用的那一条。',
            },
          },
        ],
      },
      {
        name: { en: 'Copy Editing', zh: '编辑审校部' },
        color: '#f87171',
        positions: [
          {
            title: { en: 'Copy Editor', zh: '审校编辑' },
            brief: {
              en: 'Check facts, logic and typos line by line. Say why you changed something — never edit silently.',
              zh: '逐篇审校事实、逻辑与错字。改动理由要说清楚，不要只改不解释。',
            },
          },
        ],
      },
      {
        name: { en: 'Audio', zh: '配音音频部' },
        color: '#818cf8',
        positions: [
          {
            title: { en: 'Audio Producer', zh: '音频制作' },
            brief: {
              en: 'Own voiceover and post-production. Normalise loudness before delivery and attach a per-sentence timeline.',
              zh: '负责配音与后期。交付前统一响度，并附上逐句时间轴。',
            },
          },
        ],
      },
      {
        name: { en: 'Distribution', zh: '发行运营部' },
        color: '#f97316',
        positions: [
          {
            title: { en: 'Channel Operator', zh: '渠道运营' },
            brief: {
              en: 'Own the publishing cadence and per-platform adaptation. Keep one table showing how a piece differs across platforms, so nothing ships in the wrong shape.',
              zh: '负责发布节奏与各平台适配。用一张表说清同一篇内容在各平台的版本差异，避免发错版本。',
            },
          },
        ],
        teams: [
          {
            name: { en: 'Social', zh: '社媒组' },
            color: '#fb923c',
            positions: [
              {
                title: { en: 'Social Media Operator', zh: '社媒运营' },
                brief: {
                  en: 'Run the social accounts. Reply to comments the same day and pass negative feedback to editorial immediately.',
                  zh: '维护社媒账号。评论区当天回复，负面反馈第一时间同步给选题。',
                },
              },
            ],
          },
          {
            name: { en: 'Platform', zh: '平台组' },
            color: '#ea580c',
            positions: [
              {
                title: { en: 'Platform Operator', zh: '平台运营' },
                brief: {
                  en: 'Study platform rules and recommendation mechanics. Log any change the day it lands, with what it means for us.',
                  zh: '研究平台规则与推荐机制。规则一变当天记录，并说明对我们的影响。',
                },
              },
            ],
          },
        ],
      },
      {
        name: { en: 'Partnerships', zh: '商务合作部' },
        color: '#4ade80',
        positions: [
          {
            title: { en: 'Partnerships Manager', zh: '商务对接' },
            brief: {
              en: 'Own deal conversations and contract follow-up. Update the status the same day after every call, so nothing verbal gets lost.',
              zh: '负责合作洽谈与合同跟进。每次沟通后当天更新进展，不让口头承诺丢失。',
            },
          },
        ],
      },
      {
        name: { en: 'Growth', zh: '数据增长部' },
        color: '#6366f1',
        positions: [
          {
            title: { en: 'Growth Analyst', zh: '增长分析' },
            brief: {
              en: 'Watch reads, subscriptions and retention. Give one actionable conclusion a week, not a pile of numbers.',
              zh: '盯住阅读、订阅与留存。每周给出一个可执行的结论，而不是一堆数字。',
            },
          },
        ],
      },
    ],
  },

  // ── 电商公司 ───────────────────────────────────────────────────────────────
  {
    id: 'ecommerce',
    labelKey: 'dept.presets.domains.ecommerce',
    descKey: 'dept.presets.domains.ecommerceDesc',
    name: { en: 'E-commerce Company', zh: '电商公司' },
    departments: [
      {
        name: { en: 'Sourcing', zh: '选品部' },
        color: '#fbbf24',
        positions: [
          {
            title: { en: 'Sourcing Specialist', zh: '选品专员' },
            brief: {
              en: 'Own product selection. For each candidate give cost, suggested price, competitor count and the evidence behind your demand call.',
              zh: '负责选品。每个候选给出成本、建议售价、竞品数量，以及你判断需求的那份证据。',
            },
          },
        ],
      },
      {
        name: { en: 'Supply Chain', zh: '供应链部' },
        color: '#4ade80',
        positions: [
          {
            title: { en: 'Supply Chain Specialist', zh: '供应链专员' },
            brief: {
              en: 'Own suppliers and lead times. Flag anything at risk of slipping two weeks ahead, not on the day it happens.',
              zh: '负责供应商与交期。任何可能延期的情况提前两周预警，而不是当天才说。',
            },
          },
        ],
      },
      {
        name: { en: 'Store Operations', zh: '店铺运营部' },
        color: '#6366f1',
        positions: [
          {
            title: { en: 'Store Operator', zh: '店铺运营' },
            brief: {
              en: 'Run the listings and the daily store. Log every change to price, stock or promotion, with the reason.',
              zh: '负责商品页与店铺日常。价格、库存、活动任一改动都记录在案，并写清原因。',
            },
          },
        ],
        teams: [
          {
            name: { en: 'Domestic', zh: '国内店' },
            color: '#818cf8',
            positions: [
              {
                title: { en: 'Domestic Store Operator', zh: '国内店运营' },
                brief: {
                  en: 'Own the domestic listings and promotion sign-ups. Plan the promotion calendar ahead and never reprice at the deadline.',
                  zh: '负责国内平台的商品页与活动报名。活动节奏提前排好，临近截止不临时改价。',
                },
              },
            ],
          },
          {
            name: { en: 'Overseas', zh: '海外店' },
            color: '#4f46e5',
            positions: [
              {
                title: { en: 'Overseas Store Operator', zh: '海外店运营' },
                brief: {
                  en: 'Own overseas listings, delivery times and duty notes. Rewrite the copy in the target market language rather than translating word for word.',
                  zh: '负责海外平台的商品页、物流时效与关税说明。文案按目标市场语言重写，不逐字直译。',
                },
              },
            ],
          },
        ],
      },
      {
        name: { en: 'Visual Design', zh: '视觉设计部' },
        color: '#a78bfa',
        positions: [
          {
            title: { en: 'E-commerce Designer', zh: '电商设计师' },
            brief: {
              en: 'Own hero images, detail pages and campaign assets. Test three hero variants for click-through before committing spend.',
              zh: '负责主图、详情页与活动素材。主图先做三个版本测点击，再决定投放哪一张。',
            },
          },
        ],
      },
      {
        name: { en: 'Paid Marketing', zh: '市场投放部' },
        color: '#f97316',
        positions: [
          {
            title: { en: 'Media Buyer', zh: '投放优化师' },
            brief: {
              en: 'Own the ad accounts. Each week report return on ad spend by channel and recommend where the budget moves next.',
              zh: '负责广告账户。每周给出各渠道的投产比，以及下一步预算该往哪挪的建议。',
            },
          },
        ],
      },
      {
        name: { en: 'Support', zh: '客服部' },
        color: '#ec4899',
        positions: [
          {
            title: { en: 'Pre-sales Support', zh: '售前客服' },
            brief: {
              en: 'Handle pre-sales questions. Lead with the answer and then the reason, and add recurring questions to the script library the same day.',
              zh: '负责售前咨询。回复先给结论再给依据，常见问题当天补进话术库。',
            },
          },
          {
            title: { en: 'After-sales Support', zh: '售后客服' },
            brief: {
              en: 'Handle returns and complaints. Fix the customer problem first and assign responsibility second — never the other way round.',
              zh: '负责退换与投诉。先解决用户的问题，再分析是谁的责任，不要倒过来。',
            },
          },
        ],
      },
      {
        name: { en: 'Fulfilment', zh: '仓储物流部' },
        color: '#14b8a6',
        positions: [
          {
            title: { en: 'Inventory Planner', zh: '库存管理' },
            brief: {
              en: 'Own stock levels and replenishment. Each week propose what to reorder and what to clear, with the numbers behind both.',
              zh: '负责库存与补货。每周给出补货建议和滞销处理方案，并附上依据的数字。',
            },
          },
        ],
        teams: [
          {
            name: { en: 'Warehouse', zh: '仓储组' },
            color: '#2dd4bf',
            positions: [
              {
                title: { en: 'Warehouse Lead', zh: '仓储主管' },
                brief: {
                  en: 'Own receiving, picking and cycle counts. Reconcile a discrepancy the day it appears, not at month end.',
                  zh: '负责入库、拣货与盘点。盘点差异当天查明，不留到月底。',
                },
              },
            ],
          },
          {
            name: { en: 'Delivery', zh: '配送组' },
            color: '#0d9488',
            positions: [
              {
                title: { en: 'Logistics Coordinator', zh: '物流专员' },
                brief: {
                  en: 'Own dispatch and stuck parcels. Update the status of every in-transit exception once a day.',
                  zh: '负责发货与异常件跟进。卡在途中的订单每天更新一次状态。',
                },
              },
            ],
          },
        ],
      },
      {
        name: { en: 'Compliance', zh: '售后与合规部' },
        color: '#f87171',
        positions: [
          {
            title: { en: 'Compliance Officer', zh: '合规专员' },
            brief: {
              en: 'Review platform rules and advertising law. Stop non-compliant claims before publication and offer a compliant rewrite, not just a rejection.',
              zh: '负责平台规则与广告法审查。可能违规的表述在发布前拦下，并给出合规的替代写法，而不只是否掉。',
            },
          },
        ],
      },
      {
        name: { en: 'Analytics', zh: '数据分析部' },
        color: '#818cf8',
        positions: [
          {
            title: { en: 'Data Analyst', zh: '数据分析师' },
            brief: {
              en: 'Own sales, conversion and return rate. Trace any abnormal swing to the specific product and channel the same day.',
              zh: '负责销量、转化与退货率。异常波动当天定位到具体商品和渠道。',
            },
          },
        ],
      },
      {
        name: { en: 'Finance', zh: '财务部' },
        color: '#a78bfa',
        positions: [
          {
            title: { en: 'Reconciliation Accountant', zh: '对账会计' },
            brief: {
              en: 'Own settlement cycles and costing. Report true margin monthly, with platform fees, shipping and returns counted in.',
              zh: '负责平台账期与成本核算。每月给出真实毛利，把平台费、物流费和退货都算进去。',
            },
          },
        ],
      },
    ],
  },

  // ── 学术研究团队 ───────────────────────────────────────────────────────────
  {
    id: 'research',
    labelKey: 'dept.presets.domains.research',
    descKey: 'dept.presets.domains.researchDesc',
    name: { en: 'Research Group', zh: '学术研究团队' },
    departments: [
      {
        name: { en: 'Literature', zh: '文献调研部' },
        color: '#818cf8',
        positions: [
          {
            title: { en: 'Literature Researcher', zh: '文献检索' },
            brief: {
              en: 'Search and organise the literature. For each paper give the method, data, conclusion and what we can reuse, plus how it bears on our question.',
              zh: '负责检索与整理文献。每篇给出方法、数据、结论和可复用的部分，并标注它与本题的关系。',
            },
          },
        ],
      },
      {
        name: { en: 'Study Design', zh: '研究设计部' },
        color: '#a78bfa',
        positions: [
          {
            title: { en: 'Study Designer', zh: '研究设计' },
            brief: {
              en: 'Turn the research question into an executable design. Pin down the variables, sample, controls and a pre-registered analysis plan.',
              zh: '把研究问题变成可执行的方案。明确变量、样本、对照，以及预注册的分析计划。',
            },
          },
        ],
      },
      {
        name: { en: 'Data Collection', zh: '数据采集部' },
        color: '#14b8a6',
        positions: [
          {
            title: { en: 'Data Collector', zh: '数据采集' },
            brief: {
              en: 'Own data collection and cleaning. Keep the raw data read-only and make the cleaning a script that can be re-run.',
              zh: '负责数据采集与清洗。原始数据只读保存，清洗过程写成可重跑的脚本。',
            },
          },
        ],
      },
      {
        name: { en: 'Data Analysis', zh: '数据分析部' },
        color: '#6366f1',
        positions: [
          {
            title: { en: 'Data Analyst', zh: '数据分析' },
            brief: {
              en: 'Run the statistics. Report effect sizes rather than p-values alone, and state the assumption behind each test.',
              zh: '负责统计分析。报告效应量而不只看 p 值，并说明每个检验成立的前提。',
            },
          },
        ],
      },
      {
        name: { en: 'Modelling', zh: '建模与实验部' },
        color: '#fbbf24',
        positions: [
          {
            title: { en: 'Modelling Researcher', zh: '建模研究' },
            brief: {
              en: 'Own the models and experiments. Compare against a baseline, justify the choice, and state the conditions under which the model fails.',
              zh: '负责模型与实验。与基线对比，说明选型理由，并给出模型失效的条件。',
            },
          },
        ],
        teams: [
          {
            name: { en: 'Simulation', zh: '仿真组' },
            color: '#fcd34d',
            positions: [
              {
                title: { en: 'Simulation Engineer', zh: '仿真工程' },
                brief: {
                  en: 'Own the simulation environment and the parameter sweeps. Pin the random seeds so any result can be reproduced.',
                  zh: '负责仿真环境与参数扫描。固定随机种子，保证任何结果都能复现。',
                },
              },
            ],
          },
          {
            name: { en: 'Empirical', zh: '实测组' },
            color: '#f59e0b',
            positions: [
              {
                title: { en: 'Experiment Engineer', zh: '实验工程' },
                brief: {
                  en: 'Own the physical experiments and the rig. Log environment, parameters and raw readings on every run — including the failures.',
                  zh: '负责实测与设备。每次实验记录环境、参数与原始读数，失败的也要记。',
                },
              },
            ],
          },
        ],
      },
      {
        name: { en: 'Writing', zh: '论文写作部' },
        color: '#ec4899',
        positions: [
          {
            title: { en: 'Paper Writer', zh: '论文撰写' },
            brief: {
              en: 'Own the manuscript. Deliver the outline and figures first and the prose second — one point per paragraph.',
              zh: '负责论文写作。先交提纲与图表，再写正文；每段只讲一件事。',
            },
          },
        ],
      },
      {
        name: { en: 'Visualisation', zh: '图表与可视化部' },
        color: '#f97316',
        positions: [
          {
            title: { en: 'Visualisation Designer', zh: '可视化设计' },
            brief: {
              en: 'Own the figures. A figure must explain itself: the caption states the finding, the axes carry units, and the colour carries meaning.',
              zh: '负责图表。图要能自解释：标题写结论，坐标轴带单位，颜色有意义。',
            },
          },
        ],
      },
      {
        name: { en: 'Internal Review', zh: '同行审校部' },
        color: '#f87171',
        positions: [
          {
            title: { en: 'Internal Reviewer', zh: '内部审稿' },
            brief: {
              en: 'Review every draft before submission, judging it as a referee would. Separate rejection-level problems from nitpicks.',
              zh: '负责投稿前的内部评审。按审稿人的标准挑毛病，并区分哪些是拒稿级问题、哪些只是细节。',
            },
          },
        ],
      },
      {
        name: { en: 'Grants', zh: '基金与投稿部' },
        color: '#4ade80',
        positions: [
          {
            title: { en: 'Grant Writer', zh: '基金申请' },
            brief: {
              en: 'Own grants and submission logistics. Keep one table of each funder criteria, deadline and required documents.',
              zh: '负责基金与投稿事务。把每个基金的评审标准、截止时间和材料清单做成一张表。',
            },
          },
        ],
      },
      {
        name: { en: 'Outreach', zh: '学术交流部' },
        color: '#818cf8',
        positions: [
          {
            title: { en: 'Outreach Coordinator', zh: '学术交流' },
            brief: {
              en: 'Own conferences, talks and collaborations. After every talk, log the questions and suggestions and follow each one to closure.',
              zh: '负责会议、报告与合作联络。每次报告后整理收到的质疑与建议，逐条跟进到闭环。',
            },
          },
        ],
      },
    ],
  },
]

/** Where template folders land when the user does not pick somewhere else. */
export const PRESET_BASE_DIR_NAME = 'AIPA'

const loc = (v: { en: string; zh: string }, locale: Locale): string => (locale === 'zh-CN' ? v.zh : v.en)

// ── Preview ──────────────────────────────────────────────────────────────────

export interface PreviewNode {
  name: string
  color: string
  kind: OrgNodeKind
  /** The folder is already a node — the tree will keep it and only fill gaps. */
  exists: boolean
  /** Ghost positions this node would gain. Always 0 for an existing node. */
  positionCount: number
  children: PreviewNode[]
}

export interface TemplatePreview {
  root: PreviewNode
  counts: { departments: number; teams: number; positions: number }
}

/**
 * What applying this template would actually change. Built from the same skip
 * rule `applyTemplate` uses, so the picker can never promise a folder that is
 * already there.
 */
export function previewTemplate(tpl: CompanyTemplate, locale: Locale, baseDir: string): TemplatePreview {
  const owned = ownedIndex()
  const counts = { departments: 0, teams: 0, positions: 0 }

  const build = (node: TemplateNode, parentDir: string, kind: OrgNodeKind): PreviewNode => {
    const name = loc(node.name, locale)
    const dir = joinPath(parentDir, name)
    const exists = owned.has(dirToSlug(dir))
    const positionCount = node.positions?.length ?? 0
    if (!exists) {
      if (kind === 'team') counts.teams++
      else if (kind === 'department') counts.departments++
      counts.positions += positionCount
    }
    const childKind = CHILD_KIND[kind]
    return {
      name,
      color: node.color ?? '#6366f1',
      kind,
      exists,
      positionCount: exists ? 0 : positionCount,
      children: childKind ? (node.teams ?? []).map(t => build(t, dir, childKind)) : [],
    }
  }

  const root = build({ name: tpl.name, color: '#6366f1', teams: tpl.departments }, normalizePath(baseDir), 'company')
  return { root, counts }
}

// ── Apply ────────────────────────────────────────────────────────────────────

export interface ApplyTemplateResult {
  /** Department nodes created (the company container itself is not counted). */
  departments: number
  teams: number
  positions: number
  /** Node names whose folder could not be created — never dropped silently. */
  failed: string[]
}

/**
 * Create the company tree on disk and register every node, then hang the ghost
 * positions on it. One `fs:ensureDir` per node, parents before children.
 *
 * Idempotent: a folder that is already a node is reused, its id becoming the
 * parent for any teams still missing underneath it. So re-applying a template
 * fills gaps instead of doubling the company.
 *
 * `fs:ensureDir` is sandboxed to the home directory and the current working
 * directory, so a root outside those fails per-node and is reported rather than
 * throwing the whole batch away.
 */
export async function applyTemplate(
  tpl: CompanyTemplate,
  baseDir: string,
  locale: Locale,
): Promise<ApplyTemplateResult> {
  const base = normalizePath(baseDir)
  const addDepartment = useDepartmentStore.getState().addDepartment
  const owned = ownedIndex()
  const failed: string[] = []
  const result: ApplyTemplateResult = { departments: 0, teams: 0, positions: 0, failed }

  // Depth-first, parent first: a child needs its parent's id for `parentId`, and
  // a parent whose folder failed to create makes its children impossible too.
  const visit = async (node: TemplateNode, parentDir: string, parentId: string | undefined, kind: OrgNodeKind): Promise<void> => {
    const name = loc(node.name, locale)
    const dir = joinPath(parentDir, name)
    const slug = dirToSlug(dir)
    const existing = owned.get(slug)
    let nodeId = existing?.id

    if (!nodeId) {
      try {
        const ensured = await window.electronAPI.fsEnsureDir(dir)
        if (ensured && typeof ensured === 'object' && 'error' in ensured) {
          failed.push(name)
          return
        }
      } catch {
        failed.push(name)
        return
      }
      const positions: Position[] = (node.positions ?? []).map(p => ({
        id: newPositionId(),
        title: loc(p.title, locale),
        brief: loc(p.brief, locale),
      }))
      const created = addDepartment({
        name,
        directory: dir,
        color: node.color ?? DEPT_COLORS[result.departments % DEPT_COLORS.length],
        parentId,
        kind,
        positions,
      })
      owned.set(slug, created)
      nodeId = created.id
      if (kind === 'team') result.teams++
      else if (kind === 'department') result.departments++
      result.positions += positions.length
    }

    const childKind = CHILD_KIND[kind]
    if (childKind) {
      for (const child of node.teams ?? []) await visit(child, dir, nodeId, childKind)
    }
  }

  await visit(
    { name: tpl.name, color: '#6366f1', teams: tpl.departments },
    base,
    undefined,
    'company',
  )

  markDeptSetupChosen()
  return result
}

function newPositionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Every node's directory, keyed by slug — how a folder is known to be taken. */
function ownedIndex(): Map<string, Department> {
  const owned = new Map<string, Department>()
  for (const dept of useDepartmentStore.getState().departments) {
    const slug = dirToSlug(dept.directory)
    if (!owned.has(slug)) owned.set(slug, dept)
  }
  return owned
}

// ── Adopting folders the user already works in ────────────────────────────────

/** The folders the user has worked in that no department owns yet. */
export function existingDirsPreview(sessions: SessionListItem[], homeDir?: string): Department[] {
  const owned = ownedIndex()
  const seen = new Map<string, Department>()
  for (const s of sessions) {
    // A session with a real cwd names its folder exactly; without one, only the
    // decoded `project` exists and a lone basename is not a usable directory.
    const directory = s.cwd ? normalizePath(s.cwd, homeDir) : normalizePath(s.project, homeDir)
    if (!directory || !/[\\/]/.test(directory)) continue
    if (seen.has(directory) || owned.has(dirToSlug(directory))) continue
    seen.set(directory, { id: directory, name: baseName(directory), directory, createdAt: 0 })
  }
  return [...seen.values()]
}

/**
 * Turn the folders the user has already worked in into departments — the
 * explicit form of what used to happen silently behind their back. Folders a
 * department already owns are skipped, so opening this twice is a no-op rather
 * than a pile of duplicate departments.
 */
export function importExistingDirs(sessions: SessionListItem[], homeDir?: string): number {
  const dirs = existingDirsPreview(sessions, homeDir)

  const addDepartment = useDepartmentStore.getState().addDepartment
  let i = 0
  for (const dir of dirs) {
    addDepartment({ name: dir.name, directory: dir.directory, color: DEPT_COLORS[i++ % DEPT_COLORS.length] })
  }
  markDeptSetupChosen()
  return dirs.length
}

// ── "Stop asking me" flag ────────────────────────────────────────────────────
// The empty org chart offers the template picker. Choosing "start blank" leaves
// zero departments, so without a flag the offer would come straight back.
const SETUP_KEY = 'aipa:dept-setup-chosen'

export function hasChosenDeptSetup(): boolean {
  try { return localStorage.getItem(SETUP_KEY) === '1' } catch { return false }
}

export function markDeptSetupChosen(): void {
  try { localStorage.setItem(SETUP_KEY, '1') } catch { /* private mode — just offer again next time */ }
}
