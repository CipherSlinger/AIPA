// The built-in company templates. Data only — preview/apply live in deptPresets.ts.
//
// Node names, position titles and briefs are NOT UI copy: once applied they are
// user data, stored in localStorage and renameable. So each carries both
// locales and we freeze whichever was active at creation, rather than letting a
// later language switch rename the user's own company.

/** A name or brief in both locales. */
export interface LocalizedText {
  en: string
  zh: string
}

export interface TemplatePosition {
  title: LocalizedText
  /** 2-3 concrete sentences. Becomes the employee's first message on 上岗. */
  brief: LocalizedText
}

export interface TemplateNode {
  name: LocalizedText
  color?: string
  positions?: TemplatePosition[]
  /** Sub-nodes. In practice only one level deep — a department's teams. */
  teams?: TemplateNode[]
}

export interface CompanyTemplate {
  id: string
  labelKey: string
  descKey: string
  name: LocalizedText
  departments: TemplateNode[]
}

// Roughly four hundred `{ en, zh }` pairs follow; spelling the shape out at every
// site buries the content under punctuation. These four helpers are the whole
// notation — everything below is still plain literals, in reading order.
const L = (en: string, zh: string): LocalizedText => ({ en, zh })

const pos = (titleEn: string, titleZh: string, briefEn: string, briefZh: string): TemplatePosition => ({
  title: L(titleEn, titleZh),
  brief: L(briefEn, briefZh),
})

const node = (
  en: string,
  zh: string,
  color: string,
  positions: TemplatePosition[] = [],
  teams?: TemplateNode[],
): TemplateNode => ({ name: L(en, zh), color, positions, teams })

const template = (id: string, en: string, zh: string, departments: TemplateNode[]): CompanyTemplate => ({
  id,
  // The picker's keys are derived so every template must have a matching
  // `…<id>` / `…<id>Desc` pair — a rule instead of a convention someone can typo.
  labelKey: `dept.presets.domains.${id}`,
  descKey: `dept.presets.domains.${id}Desc`,
  name: L(en, zh),
  departments,
})

export const COMPANY_TEMPLATES: CompanyTemplate[] = [
  // ── 软件公司 ───────────────────────────────────────────────────────────────
  template('software', 'Software Company', '软件公司', [
    node('Product', '产品部', '#818cf8', [
      pos('Product Manager', '产品经理',
        'Own the roadmap for the flagship product. Turn user feedback and business goals into a prioritised backlog, and write the spec the team builds from.',
        '负责旗舰产品的路线图。把用户反馈与业务目标整理成优先级明确的需求列表，并写出团队据此开发的文档。'),
      pos('User Researcher', '用户研究员',
        'Talk to users every week and turn what you hear into evidence. Maintain the interview guide and keep a running insight log the whole team can read.',
        '每周访谈用户，把听到的东西整理成证据。维护访谈提纲，并保持一份全员可读的洞察记录。'),
    ]),
    node('Design', '设计部', '#a78bfa', [
      pos('UI Designer', '界面设计师',
        'Design the product surfaces end to end. Keep the component library consistent and hand off specs engineers can build without asking.',
        '端到端设计产品界面。保持组件库一致，交付工程师无需追问就能实现的标注。'),
    ], [
      node('Design System', '设计系统组', '#c4b5fd', [
        pos('Design System Lead', '设计系统负责人',
          'Own the design tokens and the component contracts. Review every new pattern before it ships, and keep the docs in step with the code.',
          '负责设计变量与组件契约。所有新模式上线前由你评审，并保持文档与代码同步。'),
      ]),
    ]),
    node('Engineering', '研发部', '#6366f1', [
      pos('Tech Lead', '技术负责人',
        'Own the architecture and the build. Break work down to a size two people can run in parallel, keep the main branch buildable, and review every merge.',
        '负责架构与构建。把任务拆到两个人能并行的粒度，保持主干随时可构建，并评审每一次合并。'),
    ], [
      node('Frontend', '前端组', '#818cf8', [
        pos('Frontend Engineer', '前端工程师',
          'Build the user-facing surfaces in React and TypeScript. Get the build green before handing anything over, and ask before touching the design system.',
          '用 React 与 TypeScript 构建用户界面。交付前自行跑通构建，改动设计系统前先确认。'),
      ]),
      node('Backend', '后端组', '#4f46e5', [
        pos('Backend Engineer', '后端工程师',
          'Own the services and the data model. Migrations must be reversible, and anything you ship needs logs and metrics before it needs praise.',
          '负责服务与数据模型。迁移脚本必须可回滚，上线的东西先有日志和指标，再谈别的。'),
      ]),
    ]),
    node('QA', '测试部', '#4ade80', [
      pos('QA Engineer', '测试工程师',
        'Decide what "done" means for each release. Maintain the regression suite and write reproduction steps an engineer can actually follow.',
        '为每次发版定义「完成」的标准。维护回归用例，并写出工程师真的能照着复现的步骤。'),
    ]),
    node('DevOps', '运维部', '#14b8a6', [
      pos('Site Reliability Engineer', '站点可靠性工程师',
        'Own uptime and the deploy pipeline. Automate the toil and write the runbook before the first incident, not after it.',
        '负责可用性与部署流水线。把重复劳动自动化，并在第一次故障之前而不是之后写好手册。'),
    ]),
    node('Data', '数据部', '#fbbf24', [
      pos('Data Analyst', '数据分析师',
        'Answer product questions with the data we already have. Ship dashboards people open on their own, and say plainly when the data cannot answer the question.',
        '用现有数据回答产品问题。做出大家会主动打开的看板；数据回答不了的问题就直接说。'),
    ]),
    node('Security', '安全部', '#f87171', [
      pos('Security Engineer', '安全工程师',
        'Threat-model new features before they ship, and own the repository dependency and secret hygiene.',
        '在新功能上线前做威胁建模，并负责仓库的依赖与密钥卫生。'),
    ]),
    node('Customer Success', '客户成功部', '#ec4899', [
      pos('Support Engineer', '技术支持工程师',
        'Be the first responder for user reports. Reproduce, triage, and turn recurring issues into tickets the team can act on.',
        '做用户反馈的第一响应人。复现、分级，并把反复出现的问题变成团队能处理的工单。'),
    ]),
    node('Marketing', '市场部', '#f97316', [
      pos('Product Marketing', '产品市场',
        'Own positioning and launch copy. Explain what we built to the people who need it, in their own words.',
        '负责定位与发布文案。用目标用户自己的语言，把我们的产品讲给需要它的人。'),
    ]),
  ]),

  // ── 内容工作室 ─────────────────────────────────────────────────────────────
  template('content', 'Content Studio', '内容工作室', [
    node('Editorial', '选题策划部', '#fbbf24', [
      pos('Editor', '选题策划',
        'Pitch executable story ideas every day, each with an angle, a target reader and a rough length. Record why rejected pitches were rejected so they are not re-pitched.',
        '每天提出可执行的选题，附上角度、目标读者和大致篇幅。被否掉的选题记下原因，避免重复提。'),
    ]),
    node('Writing', '撰稿部', '#ec4899', [
      pos('Editorial Lead', '内容主编',
        'Own the writing department: keep the pitch queue moving, match writers to topics, and read every draft before it leaves for review. Report what is stuck and what is ready.',
        '负责撰稿部：维护选题队列的流转，把选题分配给合适的撰稿人，每篇稿子在送审前先读一遍。定期说明哪些卡住了、哪些已就绪。'),
    ], [
      node('Long Form', '长文组', '#f472b6', [
        pos('Long-form Writer', '长文撰稿',
          'Turn pitches into finished drafts. Send the structure and the central argument first and expand only after it is agreed — never a long draft in one go.',
          '把选题写成完整的稿子。先给结构和核心论点，确认之后再展开，不要一次性交长文。'),
      ]),
      node('Short Form', '短内容组', '#db2777', [
        pos('Short-form Writer', '短文案',
          'Own headlines, summaries and social copy. Give three options per piece and say which one you recommend and why.',
          '负责标题、摘要和社媒短文案。同一条内容给三个备选，并说明你推荐哪一个、为什么。'),
      ]),
    ]),
    node('Design', '设计部', '#a78bfa', [
      pos('Visual Designer', '视觉设计',
        'Own covers, illustrations and page layout. Keep one template family so a reader recognises us at a glance.',
        '负责封面、配图与版式。保持同一套模板，让读者一眼就认得出是我们。'),
    ]),
    node('Photo & Video', '摄影影像部', '#14b8a6', [
      pos('Photo & Video Producer', '摄影摄像',
        'Own shooting and the media library. Name raw files by date and story so anyone can pull the right clip without asking.',
        '负责拍摄与素材归档。原始素材按日期与选题命名，让别人不用问就能取到要用的那一条。'),
    ]),
    node('Copy Editing', '编辑审校部', '#f87171', [
      pos('Copy Editor', '审校编辑',
        'Check facts, logic and typos line by line. Say why you changed something — never edit silently.',
        '逐篇审校事实、逻辑与错字。改动理由要说清楚，不要只改不解释。'),
    ]),
    node('Audio', '配音音频部', '#818cf8', [
      pos('Audio Producer', '音频制作',
        'Own voiceover and post-production. Normalise loudness before delivery and attach a per-sentence timeline.',
        '负责配音与后期。交付前统一响度，并附上逐句时间轴。'),
    ]),
    node('Distribution', '发行运营部', '#f97316', [
      pos('Channel Operator', '渠道运营',
        'Own the publishing cadence and per-platform adaptation. Keep one table showing how a piece differs across platforms, so nothing ships in the wrong shape.',
        '负责发布节奏与各平台适配。用一张表说清同一篇内容在各平台的版本差异，避免发错版本。'),
    ], [
      node('Social', '社媒组', '#fb923c', [
        pos('Social Media Operator', '社媒运营',
          'Run the social accounts. Reply to comments the same day and pass negative feedback to editorial immediately.',
          '维护社媒账号。评论区当天回复，负面反馈第一时间同步给选题。'),
      ]),
      node('Platform', '平台组', '#ea580c', [
        pos('Platform Operator', '平台运营',
          'Study platform rules and recommendation mechanics. Log any change the day it lands, with what it means for us.',
          '研究平台规则与推荐机制。规则一变当天记录，并说明对我们的影响。'),
      ]),
    ]),
    node('Partnerships', '商务合作部', '#4ade80', [
      pos('Partnerships Manager', '商务对接',
        'Own deal conversations and contract follow-up. Update the status the same day after every call, so nothing verbal gets lost.',
        '负责合作洽谈与合同跟进。每次沟通后当天更新进展，不让口头承诺丢失。'),
    ]),
    node('Growth', '数据增长部', '#6366f1', [
      pos('Growth Analyst', '增长分析',
        'Watch reads, subscriptions and retention. Give one actionable conclusion a week, not a pile of numbers.',
        '盯住阅读、订阅与留存。每周给出一个可执行的结论，而不是一堆数字。'),
    ]),
  ]),

  // ── 电商公司 ───────────────────────────────────────────────────────────────
  template('ecommerce', 'E-commerce Company', '电商公司', [
    node('Sourcing', '选品部', '#fbbf24', [
      pos('Sourcing Specialist', '选品专员',
        'Own product selection. For each candidate give cost, suggested price, competitor count and the evidence behind your demand call.',
        '负责选品。每个候选给出成本、建议售价、竞品数量，以及你判断需求的那份证据。'),
    ]),
    node('Supply Chain', '供应链部', '#4ade80', [
      pos('Supply Chain Specialist', '供应链专员',
        'Own suppliers and lead times. Flag anything at risk of slipping two weeks ahead, not on the day it happens.',
        '负责供应商与交期。任何可能延期的情况提前两周预警，而不是当天才说。'),
    ]),
    node('Store Operations', '店铺运营部', '#6366f1', [
      pos('Store Operator', '店铺运营',
        'Run the listings and the daily store. Log every change to price, stock or promotion, with the reason.',
        '负责商品页与店铺日常。价格、库存、活动任一改动都记录在案，并写清原因。'),
    ], [
      node('Domestic', '国内店', '#818cf8', [
        pos('Domestic Store Operator', '国内店运营',
          'Own the domestic listings and promotion sign-ups. Plan the promotion calendar ahead and never reprice at the deadline.',
          '负责国内平台的商品页与活动报名。活动节奏提前排好，临近截止不临时改价。'),
      ]),
      node('Overseas', '海外店', '#4f46e5', [
        pos('Overseas Store Operator', '海外店运营',
          'Own overseas listings, delivery times and duty notes. Rewrite the copy in the target market language rather than translating word for word.',
          '负责海外平台的商品页、物流时效与关税说明。文案按目标市场语言重写，不逐字直译。'),
      ]),
    ]),
    node('Visual Design', '视觉设计部', '#a78bfa', [
      pos('E-commerce Designer', '电商设计师',
        'Own hero images, detail pages and campaign assets. Test three hero variants for click-through before committing spend.',
        '负责主图、详情页与活动素材。主图先做三个版本测点击，再决定投放哪一张。'),
    ]),
    node('Paid Marketing', '市场投放部', '#f97316', [
      pos('Media Buyer', '投放优化师',
        'Own the ad accounts. Each week report return on ad spend by channel and recommend where the budget moves next.',
        '负责广告账户。每周给出各渠道的投产比，以及下一步预算该往哪挪的建议。'),
    ]),
    node('Support', '客服部', '#ec4899', [
      pos('Pre-sales Support', '售前客服',
        'Handle pre-sales questions. Lead with the answer and then the reason, and add recurring questions to the script library the same day.',
        '负责售前咨询。回复先给结论再给依据，常见问题当天补进话术库。'),
      pos('After-sales Support', '售后客服',
        'Handle returns and complaints. Fix the customer problem first and assign responsibility second — never the other way round.',
        '负责退换与投诉。先解决用户的问题，再分析是谁的责任，不要倒过来。'),
    ]),
    node('Fulfilment', '仓储物流部', '#14b8a6', [
      pos('Inventory Planner', '库存管理',
        'Own stock levels and replenishment. Each week propose what to reorder and what to clear, with the numbers behind both.',
        '负责库存与补货。每周给出补货建议和滞销处理方案，并附上依据的数字。'),
    ], [
      node('Warehouse', '仓储组', '#2dd4bf', [
        pos('Warehouse Lead', '仓储主管',
          'Own receiving, picking and cycle counts. Reconcile a discrepancy the day it appears, not at month end.',
          '负责入库、拣货与盘点。盘点差异当天查明，不留到月底。'),
      ]),
      node('Delivery', '配送组', '#0d9488', [
        pos('Logistics Coordinator', '物流专员',
          'Own dispatch and stuck parcels. Update the status of every in-transit exception once a day.',
          '负责发货与异常件跟进。卡在途中的订单每天更新一次状态。'),
      ]),
    ]),
    node('Compliance', '售后与合规部', '#f87171', [
      pos('Compliance Officer', '合规专员',
        'Review platform rules and advertising law. Stop non-compliant claims before publication and offer a compliant rewrite, not just a rejection.',
        '负责平台规则与广告法审查。可能违规的表述在发布前拦下，并给出合规的替代写法，而不只是否掉。'),
    ]),
    node('Analytics', '数据分析部', '#818cf8', [
      pos('Data Analyst', '数据分析师',
        'Own sales, conversion and return rate. Trace any abnormal swing to the specific product and channel the same day.',
        '负责销量、转化与退货率。异常波动当天定位到具体商品和渠道。'),
    ]),
    node('Finance', '财务部', '#a78bfa', [
      pos('Reconciliation Accountant', '对账会计',
        'Own settlement cycles and costing. Report true margin monthly, with platform fees, shipping and returns counted in.',
        '负责平台账期与成本核算。每月给出真实毛利，把平台费、物流费和退货都算进去。'),
    ]),
  ]),

  // ── 学术研究团队 ───────────────────────────────────────────────────────────
  template('research', 'Research Group', '学术研究团队', [
    node('Literature', '文献调研部', '#818cf8', [
      pos('Literature Researcher', '文献检索',
        'Search and organise the literature. For each paper give the method, data, conclusion and what we can reuse, plus how it bears on our question.',
        '负责检索与整理文献。每篇给出方法、数据、结论和可复用的部分，并标注它与本题的关系。'),
    ]),
    node('Study Design', '研究设计部', '#a78bfa', [
      pos('Study Designer', '研究设计',
        'Turn the research question into an executable design. Pin down the variables, sample, controls and a pre-registered analysis plan.',
        '把研究问题变成可执行的方案。明确变量、样本、对照，以及预注册的分析计划。'),
    ]),
    node('Data Collection', '数据采集部', '#14b8a6', [
      pos('Data Collector', '数据采集',
        'Own data collection and cleaning. Keep the raw data read-only and make the cleaning a script that can be re-run.',
        '负责数据采集与清洗。原始数据只读保存，清洗过程写成可重跑的脚本。'),
    ]),
    node('Data Analysis', '数据分析部', '#6366f1', [
      pos('Data Analyst', '数据分析',
        'Run the statistics. Report effect sizes rather than p-values alone, and state the assumption behind each test.',
        '负责统计分析。报告效应量而不只看 p 值，并说明每个检验成立的前提。'),
    ]),
    node('Modelling', '建模与实验部', '#fbbf24', [
      pos('Modelling Researcher', '建模研究',
        'Own the models and experiments. Compare against a baseline, justify the choice, and state the conditions under which the model fails.',
        '负责模型与实验。与基线对比，说明选型理由，并给出模型失效的条件。'),
    ], [
      node('Simulation', '仿真组', '#fcd34d', [
        pos('Simulation Engineer', '仿真工程',
          'Own the simulation environment and the parameter sweeps. Pin the random seeds so any result can be reproduced.',
          '负责仿真环境与参数扫描。固定随机种子，保证任何结果都能复现。'),
      ]),
      node('Empirical', '实测组', '#f59e0b', [
        pos('Experiment Engineer', '实验工程',
          'Own the physical experiments and the rig. Log environment, parameters and raw readings on every run — including the failures.',
          '负责实测与设备。每次实验记录环境、参数与原始读数，失败的也要记。'),
      ]),
    ]),
    node('Writing', '论文写作部', '#ec4899', [
      pos('Paper Writer', '论文撰写',
        'Own the manuscript. Deliver the outline and figures first and the prose second — one point per paragraph.',
        '负责论文写作。先交提纲与图表，再写正文；每段只讲一件事。'),
    ]),
    node('Visualisation', '图表与可视化部', '#f97316', [
      pos('Visualisation Designer', '可视化设计',
        'Own the figures. A figure must explain itself: the caption states the finding, the axes carry units, and the colour carries meaning.',
        '负责图表。图要能自解释：标题写结论，坐标轴带单位，颜色有意义。'),
    ]),
    node('Internal Review', '同行审校部', '#f87171', [
      pos('Internal Reviewer', '内部审稿',
        'Review every draft before submission, judging it as a referee would. Separate rejection-level problems from nitpicks.',
        '负责投稿前的内部评审。按审稿人的标准挑毛病，并区分哪些是拒稿级问题、哪些只是细节。'),
    ]),
    node('Grants', '基金与投稿部', '#4ade80', [
      pos('Grant Writer', '基金申请',
        'Own grants and submission logistics. Keep one table of each funder criteria, deadline and required documents.',
        '负责基金与投稿事务。把每个基金的评审标准、截止时间和材料清单做成一张表。'),
    ]),
    node('Outreach', '学术交流部', '#818cf8', [
      pos('Outreach Coordinator', '学术交流',
        'Own conferences, talks and collaborations. After every talk, log the questions and suggestions and follow each one to closure.',
        '负责会议、报告与合作联络。每次报告后整理收到的质疑与建议，逐条跟进到闭环。'),
    ]),
  ]),
]
