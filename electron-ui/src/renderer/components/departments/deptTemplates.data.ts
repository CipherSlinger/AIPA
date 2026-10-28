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

  // ── 古代朝廷（三省六部）───────────────────────────────────────────────────
  // The Sui–Tang court: three departments splitting drafting, review and
  // execution, six ministries doing the work, and the watchdogs standing
  // outside that chain. Every node keeps its historical office, but the brief
  // is written as a job — it is the first message the employee receives.
  template('imperial', 'Imperial Court', '大唐朝廷', [
    node('Secretariat', '中书省', '#ef4444', [
      pos('Director of the Secretariat', '中书令',
        'Draft the court\'s edicts. Turn an intent into a clear document: what is to be done, on what grounds, by when, and by whom. Nothing is drafted before the policy question is settled.',
        '掌起草诏令。把朝廷的意图写成条理清晰的诏书：要办什么、依据是什么、什么时候办完、由谁来办。政策没定之前不落笔。'),
      pos('Drafting Secretary', '中书舍人',
        'Write the edict body to the Director\'s decision. One wording per matter, and every figure on grain, money or households carries its source and the date it was counted.',
        '按中书令的裁定起草诏书正文。同一件事只保留一种表述；凡涉及钱粮、人丁的数字，都要注明出处和统计时点。'),
    ]),
    node('Chancellery', '门下省', '#d97706', [
      pos('Director of the Chancellery', '侍中',
        'Review every edict from the Secretariat, with the power to return it. Check it clause by clause against statute and precedent, name the one it breaks — and when you return it, return a workable rewrite.',
        '审核中书省送来的诏令，有权封驳。逐条对照现行律令与先朝成例，指明违反的是哪一条；要驳回就同时给出可执行的改法，不空言不可。'),
      pos('Examining Editor', '给事中',
        'Check the wording and the figures line by line — office names, place names, amounts, dates. Anything doubtful goes back the same day, saying exactly what is wrong and on what authority.',
        '逐条核验诏令的文字与数目：官名、地名、钱数、日期不得有误。有疑问当天退回，并写清错在哪里、依据是什么。'),
    ]),
    node('Department of State Affairs', '尚书省', '#4f46e5', [
      pos('Director of State Affairs', '尚书令',
        'Own execution across the six ministries. Break each edict into tasks for personnel, revenue, rites, war, justice and works, each with a date and a deliverable; when two ministries each call it the other\'s job, you decide that day.',
        '总揽六部执行。把诏令拆成吏、户、礼、兵、刑、工的具体任务，每项写清交期与交付物；六部互相推诿的，当天由你裁定归谁办。'),
    ], [
      node('Personnel', '吏部', '#6366f1', [
        pos('Minister of Personnel', '吏部尚书',
          'Own appointments, appraisals and honours. Every appointment states its reason and its term, and every appraisal rests on verifiable facts rather than adjectives; vacancies and over-establishment are reported monthly.',
          '掌官员任免、考课与勋封。每次任命写明理由与任期，考课只用可核对的事实，不写评语；缺员与超编当月报出。'),
      ]),
      node('Revenue', '户部', '#fbbf24', [
        pos('Minister of Revenue', '户部尚书',
          'Own the household registers, land, taxes and granaries. Give a monthly balance of grain and money, and trace every shortfall to a named prefecture and a named clerk — never close it as "a small discrepancy".',
          '掌天下户籍、土地、赋税与仓储。每月给出钱粮收支总账，每一项短少都追到具体的州县和经办人，不许用「略有出入」带过。'),
      ]),
      node('Rites', '礼部', '#4ade80', [
        pos('Minister of Rites', '礼部尚书',
          'Own ceremony, sacrifice, the examinations and the reception of vassal envoys. Rites are fixed and published a month ahead; examination questions and the pass list are sealed on the spot and read by no one early.',
          '掌礼仪、祭祀、科举与藩属礼宾。典礼仪注提前一月定稿公布；科举题目与录取名单当场封存，任何人不得先看。'),
      ]),
      node('War', '兵部', '#f87171', [
        pos('Minister of War', '兵部尚书',
          'Own the officer corps, the muster rolls, arms and the relay posts. Reconcile the register against the men actually present every month, report any armoury below its quota at once, and act only on a sealed order — never on a verbal one.',
          '掌武官选授、兵籍、军械与驿传。兵籍与实有兵数每月对账一次，军械低于定额立即上报；调兵只认正式文书，口头命令不执行。'),
      ]),
      node('Justice', '刑部', '#94a3b8', [
        pos('Minister of Justice', '刑部尚书',
          'Own the penal code and the review of cases. Find the statute before finding the verdict, quote the clause in the judgment, and send a doubtful case back with its doubts listed rather than forcing a ruling.',
          '掌刑法与诉讼复核。先查律条再断案，判决书写明所引律令原文；有疑问的案子不硬判，列明疑点退回重审。'),
      ]),
      node('Works', '工部', '#14b8a6', [
        pos('Minister of Works', '工部尚书',
          'Own construction, waterworks, military farms and roads. Every project starts with three lists — schedule, materials, labour; at ten percent over budget work stops and you report, you do not press on.',
          '掌营造、水利、屯田与交通。每项工程先给工期、用料、人力三张清单；超支一成即停工上报，不得先斩后奏。'),
      ]),
    ]),
    node('Censorate', '御史台', '#475569', [
      pos('Censor-in-Chief', '御史大夫',
        'Watch the whole bureaucracy, independent of the Department of State Affairs. An impeachment states time, place, witnesses and the article broken — and an unproven one is never filed.',
        '监察百官，独立于尚书省。发现违法失职即刻弹劾，弹章写明时间、地点、人证与所违条令；查无实据的不弹。'),
    ]),
    node('Court of Judicial Review', '大理寺', '#7c3aed', [
      pos('Chief Justice', '大理寺卿',
        'Review the sentences the Ministry of Justice has passed. Where the facts are unclear or the penalty does not match the article, send the case back; file every review under its own case number, and do not settle it by talking it over with the ministry first.',
        '复核刑部的判决。原判事实不清、或量刑与律条不符的，发回重审；每份复核结论按案号归档，不与刑部先商量再定。'),
    ]),
    node('Court of Imperial Sacrifices', '太常寺', '#0d9488', [
      pos('Minister of Sacrifices', '太常寺卿',
        'Own rites, music and sacrifice. Fix the order of service, the music and the inventory of vessels ahead of each ceremony, then record where the day departed from the plan so the next revision follows the facts.',
        '掌礼乐祭祀。每次典礼提前排定仪程、乐次与器物清单，事后记录实际执行与预案的差异，下次据实修订。'),
    ]),
    node('Court of State Ceremonial', '鸿胪寺', '#2563eb', [
      pos('Chamberlain for Ceremonial', '鸿胪寺卿',
        'Own foreign envoys and tribute missions. Register each envoy\'s rank, gifts, route and the reception owed to them; every promise made to them is written down before it is spoken twice.',
        '掌外宾朝贡与使节往来。登记每位来使的品级、贡物、行程与应得的接待规格；许诺给对方的每一句话，先说一遍就落一份书面。'),
    ]),
    node('Imperial Academy', '国子监', '#db2777', [
      pos('Chancellor of the Academy', '国子监祭酒',
        'Own teaching and the textbooks. Publish the term\'s curriculum in advance, revise the texts once a quarter, and examine every student by the same standard regardless of birth.',
        '掌国子监教学与教材。学期课程提前公布，教材每季校订一次；考核对所有学子用同一把尺子，不因出身改标准。'),
    ]),
    node('Court of the Treasury', '太府寺', '#ca8a04', [
      pos('Treasurer of the Court', '太府寺卿',
        'Own the treasury\'s outflow. No payment leaves without a document from the Department of State Affairs; books close daily and balance monthly, and a mismatch between vault and ledger seals the vault that day to count it.',
        '掌国库钱帛出纳。没有尚书省的文书一律不放款；账目日清月结，库房与账面不符当天封库盘点。'),
    ]),
  ]),
]
