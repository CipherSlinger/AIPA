import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import type { NavPluginManifest } from './nav-plugin-types'

const log = createLogger('default-plugins')

const DEFAULT_WELCOME_MANIFEST: NavPluginManifest = {
  id: 'welcome-dashboard',
  name: '插件中心',
  nameEn: 'Plugin Hub',
  version: '1.2.0',
  description: '浏览、管理和快速进入 AIPA 免编译扩展插件生态',
  icon: 'Blocks',
  location: 'bottom',
  order: 1,
  main: 'index.html',
  permissions: ['chat', 'storage', 'toast'],
}

const DEFAULT_NOTES_MANIFEST: NavPluginManifest = {
  id: 'aipa-notes',
  name: '便签笔记',
  nameEn: 'Quick Notes',
  version: '1.0.0',
  description: '轻量级 Markdown 便签笔记与灵感速记，支持多分类、置顶与一键联动 AI 对话',
  icon: 'NotebookPen',
  location: 'top',
  order: 2,
  main: 'index.html',
  permissions: ['chat', 'storage', 'toast'],
}

const DEFAULT_WELCOME_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIPA 插件中心</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --card-hover: #f1f5f9;
      --text: #0f172a;
      --text-muted: #64748b;
      --text-faint: #94a3b8;
      --border: #e2e8f0;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --success: #22c55e;
      --code-bg: #f1f5f9;
    }
    [data-theme="dark"] {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-hover: #24334a;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-faint: #64748b;
      --border: #334155;
      --accent: #818cf8;
      --accent-hover: #6366f1;
      --success: #4ade80;
      --code-bg: #0b1120;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px 32px; transition: background 0.2s, color 0.2s; min-height: 100vh; overflow-y: auto; }

    .header { margin-bottom: 24px; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
    .title-wrap { flex: 1; min-width: 280px; }
    .title { font-size: 22px; font-weight: 800; display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; }

    .header-actions { display: flex; gap: 8px; align-items: center; }
    .btn { display: inline-flex; align-items: center; gap: 6px; background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; text-decoration: none; }
    .btn:hover { background: var(--accent-hover); transform: translateY(-1px); }
    .btn-secondary { background: var(--card-bg); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--card-hover); border-color: var(--accent); color: var(--accent); }

    .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); margin: 24px 0 14px 0; display: flex; align-items: center; gap: 8px; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; margin-bottom: 32px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease; position: relative; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }

    .card-top { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 12px; }
    .card-icon { width: 44px; height: 44px; border-radius: 10px; background: rgba(99,102,241,0.1); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
    .card-meta { flex: 1; min-width: 0; }
    .card-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
    .card-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
    .tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: rgba(99,102,241,0.1); color: var(--accent); }
    .tag-success { background: rgba(34,197,94,0.1); color: var(--success); }

    .card-desc { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; flex: 1; }
    .card-actions { display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--border); padding-top: 14px; }

    .card-dashed { border: 2px dashed var(--border); background: transparent; cursor: pointer; align-items: center; justify-content: center; text-align: center; min-height: 180px; }
    .card-dashed:hover { border-color: var(--accent); background: rgba(99,102,241,0.03); }

    .guide-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 22px; margin-bottom: 30px; }
    .step-list { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
    .step-item { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; line-height: 1.6; }
    .step-num { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
    code { font-family: monospace; background: var(--code-bg); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-wrap">
      <div class="title">
        <span>🔌 AIPA 插件中心 (Plugin Hub)</span>
        <span class="tag tag-success">热插拔免编译架构</span>
      </div>
      <p class="desc">直接在本地目录编写 HTML、CSS 和 JavaScript，即可在 AIPA 左侧栏注册功能并在主界面呈现专属工具。</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick="openRootFolder()">📂 打开插件目录</button>
      <button class="btn btn-secondary" onclick="location.reload()">🔄 刷新列表</button>
    </div>
  </div>

  <div class="section-title">
    <span>📦 已安装插件 (Installed Plugins)</span>
  </div>

  <div class="grid">
    <!-- Card 1: Notes Plugin -->
    <div class="card">
      <div class="card-top">
        <div class="card-icon" style="background:rgba(99,102,241,0.12); color:#6366f1;">📝</div>
        <div class="card-meta">
          <div class="card-title">
            <span>便签笔记 (Quick Notes)</span>
          </div>
          <div class="card-badges">
            <span class="tag tag-success">官方预置</span>
            <span class="tag">免编译 HTML+JS</span>
            <span class="tag">左侧栏已启用</span>
          </div>
        </div>
      </div>
      <div class="card-desc">
        轻量级 Markdown 便签笔记与灵感速记工具。支持标题检索、多分类归档、置顶管理，并支持一键将笔记内容推送至 AI 对话框深度交互。
      </div>
      <div class="card-actions">
        <button class="btn" onclick="openPlugin('aipa-notes')">🚀 打开便签笔记</button>
        <button class="btn btn-secondary" onclick="openFolder('aipa-notes')">📂 查看源码</button>
      </div>
    </div>

    <!-- Card: Work Calendar Plugin -->
    <div class="card">
      <div class="card-top">
        <div class="card-icon" style="background:rgba(179,209,102,0.18); color:#7c9a2e;">📅</div>
        <div class="card-meta">
          <div class="card-title">
            <span>工作日历 (Work Calendar)</span>
          </div>
          <div class="card-badges">
            <span class="tag tag-success">官方预置</span>
            <span class="tag">AI 周报 / 月报</span>
            <span class="tag">工作源</span>
          </div>
        </div>
      </div>
      <div class="card-desc">
        月历视图管理跨天任务，一键由 AI 生成周报与月报；接入 GitHub 仓库与本地文件夹作为工作源自动汇总素材，并按周/月维护人天投入。
      </div>
      <div class="card-actions">
        <button class="btn" onclick="openPlugin('aipa-work-calendar')">🚀 打开工作日历</button>
        <button class="btn btn-secondary" onclick="openFolder('aipa-work-calendar')">📂 查看源码</button>
      </div>
    </div>

    <!-- Card 2: Plugin Center Plugin -->
    <div class="card">
      <div class="card-top">
        <div class="card-icon" style="background:rgba(139,92,246,0.12); color:#8b5cf6;">🧩</div>
        <div class="card-meta">
          <div class="card-title">
            <span>插件中心 (Plugin Hub)</span>
          </div>
          <div class="card-badges">
            <span class="tag tag-success">系统核心</span>
            <span class="tag">已激活</span>
          </div>
        </div>
      </div>
      <div class="card-desc">
        浏览、管理和快速进入 AIPA 免编译扩展插件生态。查看系统内置插件与开发者自定义工具，提供一键跳转与源码目录快速定位。
      </div>
      <div class="card-actions">
        <button class="btn btn-secondary" onclick="openFolder('welcome-dashboard')">📂 查看源码</button>
      </div>
    </div>

    <!-- Card 3: Create Custom Plugin -->
    <div class="card card-dashed" onclick="openRootFolder()">
      <div style="font-size:32px; margin-bottom:8px;">➕</div>
      <div style="font-size:15px; font-weight:700; color:var(--text); margin-bottom:6px;">创建你的专属微工具</div>
      <div style="font-size:12px; color:var(--text-muted); max-width:280px; margin-bottom:12px;">
        在插件目录新建文件夹，放入 <code>plugin.json</code> 与 <code>index.html</code>，保存即自动出现在左侧栏！
      </div>
      <span class="btn btn-secondary" style="pointer-events:none;">📂 打开插件根目录开始创建</span>
    </div>
  </div>

  <div class="section-title">
    <span>💡 插件开发极简指引 (Developer Guide)</span>
  </div>

  <div class="guide-box">
    <div style="font-size:14px; font-weight:700; color:var(--text);">只需 3 步，打造专属于你的桌面 AI 扩展工具：</div>
    <div class="step-list">
      <div class="step-item">
        <div class="step-num">1</div>
        <div>
          <strong>创建文件夹与清单配置</strong><br/>
          在 <code>~/.aipa/plugins/</code> 下新建一个文件夹（如 <code>my-tool</code>），创建 <code>plugin.json</code>，定义插件名称、图标（如 <code>Terminal</code>、<code>NotebookPen</code>、<code>Blocks</code>）与摆放位置（<code>bottom</code> 或 <code>top</code>）。
        </div>
      </div>
      <div class="step-item">
        <div class="step-num">2</div>
        <div>
          <strong>编写原生网页界面</strong><br/>
          在同目录下创建 <code>index.html</code>，使用原生 HTML5、CSS3 和 JavaScript 编写任何你想要的界面或小工具。无需 Node.js、Vite 或 Webpack 打包，任意文本编辑器修改保存后即刻热生效。
        </div>
      </div>
      <div class="step-item">
        <div class="step-num">3</div>
        <div>
          <strong>与 AIPA 核心驾驶舱双向通信</strong><br/>
          插件运行在安全独立的沙箱环境中，可直接调用 <code>window.parent.postMessage</code>：<br/>
          • <code>{ type: 'aipa:sendPrompt', payload: { prompt: '...' } }</code> —— 自动填入主对话框并唤起 AI；<br/>
          • <code>{ type: 'aipa:toast', payload: { type: 'success', message: '...' } }</code> —— 触发桌面轻提示；<br/>
          • <code>{ type: 'aipa:storage:set', payload: { key, value } }</code> —— 跨会话持久化存储插件数据。
        </div>
      </div>
    </div>
  </div>

  <script>
    function openPlugin(pluginId) {
      if (window.parent) {
        window.parent.postMessage({ type: 'aipa:openPlugin', payload: { pluginId: pluginId } }, '*');
      }
    }

    function openFolder(pluginId) {
      if (window.parent) {
        window.parent.postMessage({ type: 'aipa:openFolder', payload: { pluginId: pluginId } }, '*');
      }
    }

    function openRootFolder() {
      if (window.parent) {
        window.parent.postMessage({ type: 'aipa:openFolder', payload: {} }, '*');
      }
    }

    // Theme synchronization
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'aipa:theme') {
        document.documentElement.setAttribute('data-theme', e.data.theme);
      }
    });

    if (window.parent) {
      window.parent.postMessage({ type: 'aipa:ready' }, '*');
    }
  </script>
</body>
</html>`

const DEFAULT_NOTES_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>便签笔记 - AIPA 原生插件</title>
  <style>
    :root {
      --bg: #ffffff;
      --sidebar-bg: #f8fafc;
      --sidebar-hover: #f1f5f9;
      --sidebar-active: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --text-faint: #94a3b8;
      --border: #e2e8f0;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --danger: #ef4444;
      --code-bg: #f1f5f9;
    }
    [data-theme="dark"] {
      --bg: #0f172a;
      --sidebar-bg: #1e293b;
      --sidebar-hover: #24334a;
      --sidebar-active: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-faint: #64748b;
      --border: #334155;
      --accent: #818cf8;
      --accent-hover: #6366f1;
      --danger: #f87171;
      --code-bg: #0b1120;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text); }
    .app { display: flex; height: 100%; width: 100%; }

    /* Left Sidebar */
    .sidebar { width: 280px; flex-shrink: 0; border-right: 1px solid var(--border); background: var(--sidebar-bg); display: flex; flex-direction: column; height: 100%; }
    .sidebar-header { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .sidebar-title { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
    .btn-new { background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .btn-new:hover { background: var(--accent-hover); transform: translateY(-1px); }

    .search-wrap { padding: 8px 12px; border-bottom: 1px solid var(--border); }
    .search-input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 12px; color: var(--text); outline: none; }
    .search-input:focus { border-color: var(--accent); }

    .cat-bar { display: flex; gap: 6px; padding: 8px 12px; overflow-x: auto; border-bottom: 1px solid var(--border); scrollbar-width: none; }
    .cat-bar::-webkit-scrollbar { display: none; }
    .cat-chip { font-size: 11px; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); color: var(--text-muted); cursor: pointer; white-space: nowrap; transition: all 0.15s; user-select: none; }
    .cat-chip:hover { color: var(--text); border-color: var(--accent); }
    .cat-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }

    .notes-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .note-card { padding: 10px 12px; border-radius: 8px; border: 1px solid transparent; background: transparent; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 4px; }
    .note-card:hover { background: var(--sidebar-hover); }
    .note-card.active { background: var(--sidebar-active); border-color: var(--border); border-left: 3px solid var(--accent); }
    .card-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .card-title { font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .card-excerpt { font-size: 11px; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card-footer { display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: var(--text-faint); margin-top: 4px; }
    .cat-badge { padding: 1px 5px; border-radius: 4px; background: rgba(99,102,241,0.1); color: var(--accent); font-weight: 600; font-size: 9px; }

    /* Right Main Editor */
    .main { flex: 1; display: flex; flex-direction: column; height: 100%; background: var(--bg); overflow: hidden; }
    .toolbar { height: 46px; border-bottom: 1px solid var(--border); padding: 0 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0; }
    .title-input { font-size: 15px; font-weight: 700; color: var(--text); border: none; outline: none; background: transparent; flex: 1; min-width: 120px; }
    .tools { display: flex; align-items: center; gap: 6px; }
    .btn-action { background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 11px; color: var(--text); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s; }
    .btn-action:hover { background: var(--sidebar-hover); border-color: var(--accent); color: var(--accent); }
    .btn-ai { background: linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85)); color: #fff; border: none; font-weight: 600; }
    .btn-ai:hover { opacity: 0.95; transform: translateY(-1px); color: #fff; }
    .cat-select { font-size: 11px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); outline: none; }
    .mode-switch { display: flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .mode-btn { background: transparent; border: none; padding: 4px 8px; font-size: 11px; color: var(--text-muted); cursor: pointer; }
    .mode-btn.active { background: var(--accent); color: #fff; font-weight: 600; }

    .content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
    .editor-text { width: 100%; height: 100%; border: none; outline: none; padding: 18px 22px; font-size: 13px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Consolas, monospace; background: transparent; color: var(--text); resize: none; }
    .preview-box { width: 100%; height: 100%; padding: 18px 22px; overflow-y: auto; font-size: 13px; line-height: 1.6; color: var(--text); }
    .preview-box h1 { font-size: 20px; margin: 14px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
    .preview-box h2 { font-size: 16px; margin: 12px 0 6px; }
    .preview-box h3 { font-size: 14px; margin: 10px 0 4px; }
    .preview-box p { margin-bottom: 10px; }
    .preview-box blockquote { border-left: 3px solid var(--accent); padding-left: 10px; color: var(--text-muted); margin-bottom: 10px; font-style: italic; }
    .preview-box code { background: var(--code-bg); padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 12px; }
    .preview-box pre { background: var(--code-bg); padding: 10px; border-radius: 6px; overflow-x: auto; margin-bottom: 10px; }
    .preview-box pre code { background: transparent; padding: 0; }
    .preview-box ul, .preview-box ol { padding-left: 18px; margin-bottom: 10px; }
    .preview-box li { margin-bottom: 3px; }
    .preview-box hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

    .statusbar { height: 26px; border-top: 1px solid var(--border); padding: 0 16px; display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: var(--text-faint); flex-shrink: 0; background: var(--sidebar-bg); }
  </style>
</head>
<body>
  <div class="app">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title">
          <span>📝 便签笔记</span>
        </div>
        <button class="btn-new" onclick="createNewNote()">+ 新建</button>
      </div>

      <div class="search-wrap">
        <input class="search-input" id="search-input" placeholder="搜索笔记标题或内容..." oninput="onSearchChange()">
      </div>

      <div class="cat-bar" id="cat-bar">
        <span class="cat-chip active" onclick="setCategoryFilter('all')">全部</span>
        <span class="cat-chip" onclick="setCategoryFilter('pinned')">📌 置顶</span>
        <span class="cat-chip" onclick="setCategoryFilter('work')">💼 工作</span>
        <span class="cat-chip" onclick="setCategoryFilter('ideas')">💡 灵感</span>
        <span class="cat-chip" onclick="setCategoryFilter('study')">📚 学习</span>
        <span class="cat-chip" onclick="setCategoryFilter('prompts')">🤖 提示词</span>
        <span class="cat-chip" onclick="setCategoryFilter('todo')">✅ 待办</span>
      </div>

      <div class="notes-list" id="notes-list"></div>
    </div>

    <!-- Main Editor -->
    <div class="main">
      <div class="toolbar">
        <input class="title-input" id="note-title" placeholder="输入笔记标题..." oninput="onTitleChange()">
        <div class="tools">
          <select class="cat-select" id="note-cat" onchange="onCatChange()">
            <option value="work">💼 工作</option>
            <option value="ideas">💡 灵感</option>
            <option value="study">📚 学习</option>
            <option value="prompts">🤖 提示词</option>
            <option value="todo">✅ 待办</option>
          </select>
          <button class="btn-action" id="btn-pin" onclick="togglePin()" title="置顶">📌</button>

          <div class="mode-switch">
            <button class="mode-btn active" id="btn-edit-mode" onclick="setMode('edit')">编辑</button>
            <button class="mode-btn" id="btn-preview-mode" onclick="setMode('preview')">预览</button>
          </div>

          <button class="btn-action btn-ai" onclick="sendToAI()" title="发送给 AI 对话分析">🤖 发送给 AI</button>
          <button class="btn-action" onclick="copyContent()" title="复制正文">📋 复制</button>
          <button class="btn-action" onclick="deleteCurrentNote()" style="color:var(--danger)" title="删除此笔记">🗑️</button>
        </div>
      </div>

      <div class="content-area">
        <textarea class="editor-text" id="note-body" placeholder="在此编写 Markdown 笔记内容..." oninput="onContentChange()"></textarea>
        <div class="preview-box" id="note-preview" style="display:none;"></div>
      </div>

      <div class="statusbar">
        <span id="stats-text">共 0 篇笔记 · 0 字</span>
        <span id="save-status">● 已自动保存</span>
      </div>
    </div>
  </div>

  <script>
    // AIPA Client SDK Bridge
    window.AIPA = {
      sendPrompt: function(prompt) {
        window.parent.postMessage({ type: 'aipa:sendPrompt', payload: { prompt: prompt } }, '*');
      },
      toast: function(type, message) {
        window.parent.postMessage({ type: 'aipa:toast', payload: { type: type, message: message } }, '*');
      },
      storage: {
        set: function(key, val) {
          localStorage.setItem('aipa_notes_' + key, JSON.stringify(val));
          window.parent.postMessage({ type: 'aipa:storage:set', payload: { key: key, value: val } }, '*');
        },
        get: function(key) {
          const v = localStorage.getItem('aipa_notes_' + key);
          return v ? JSON.parse(v) : null;
        }
      }
    };

    const DEFAULT_NOTES = [
      {
        id: 'note-starter-1',
        title: '💡 欢迎使用便签笔记原生插件',
        content: '# 欢迎体验 AIPA 免编译原生插件！\\n\\n这是 AIPA **热插拔插件生态**的官方示例。本插件完全使用原生 **HTML5 + CSS3 + Vanilla JavaScript** 构建，无需任何打包构建链，修改保存后即改即生效！\\n\\n### 核心特性：\\n- 📝 **Markdown 即写即看**：支持标题、粗体、代码块、引用与待办清单；\\n- 🤖 **一键与 AI 对话联动**：点击右上角「发送给 AI」，把当前笔记内容发送给智能助手进行扩展、润色或代码审查；\\n- 📌 **多维度分类与置顶**：工作、灵感、学习、提示词、待办多分类聚合；\\n- 💾 **本地安全持久化**：笔记数据自动保存在本地，跨会话永不丢失。',
        category: 'ideas',
        pinned: true,
        updatedAt: Date.now() - 1000 * 60 * 10
      },
      {
        id: 'note-starter-2',
        title: '🤖 常用 AI 高效提示词收集',
        content: '### 精选常用 AI 指令\\n\\n1. **代码审查 (Code Review)**：\\n> 请审查以下代码逻辑，重点关注边界溢出、异常处理、资源未释放以及并发安全性。\\n\\n2. **重构提炼**：\\n> 在保证现有单元行为完全一致的前提下，重构以下函数以降低复杂度并提高可读性。\\n\\n3. **架构分析**：\\n> 分析当前模块的数据流向，指出潜在的单点瓶颈并给出优化方案。',
        category: 'prompts',
        pinned: false,
        updatedAt: Date.now() - 1000 * 60 * 60
      },
      {
        id: 'note-starter-3',
        title: '📋 本周任务备忘清单',
        content: '### 本周核心事项：\\n\\n- [x] 体验 AIPA 免编译热插拔插件中心\\n- [x] 将便签笔记接入插件体系\\n- [ ] 为团队编写专属微工具插件\\n- [ ] 探索 Canvas 工作流编排能力',
        category: 'todo',
        pinned: false,
        updatedAt: Date.now() - 1000 * 60 * 120
      }
    ];

    let notes = [];
    let activeId = null;
    let activeCatFilter = 'all';
    let currentMode = 'edit';
    let saveTimeout = null;

    function init() {
      try {
        const saved = localStorage.getItem('aipa_notes_list');
        if (saved) {
          notes = JSON.parse(saved);
        }
      } catch (e) {}

      if (!notes || notes.length === 0) {
        notes = DEFAULT_NOTES;
        persist();
      }

      activeId = notes[0] ? notes[0].id : null;
      renderNotesList();
      loadActiveNote();

      // Listen for theme
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'aipa:theme') {
          document.documentElement.setAttribute('data-theme', e.data.theme);
        }
      });

      // Report ready
      if (window.parent) {
        window.parent.postMessage({ type: 'aipa:ready' }, '*');
      }
    }

    function persist() {
      localStorage.setItem('aipa_notes_list', JSON.stringify(notes));
      if (window.AIPA && window.AIPA.storage) {
        window.AIPA.storage.set('notes_list', notes);
      }
      updateSaveIndicator('● 已自动保存');
    }

    function updateSaveIndicator(text) {
      const el = document.getElementById('save-status');
      if (el) el.innerText = text;
    }

    function getActiveNote() {
      return notes.find(n => n.id === activeId) || null;
    }

    function renderNotesList() {
      const listEl = document.getElementById('notes-list');
      const search = (document.getElementById('search-input').value || '').trim().toLowerCase();

      let filtered = notes.filter(n => {
        if (activeCatFilter === 'pinned') return n.pinned;
        if (activeCatFilter !== 'all' && n.category !== activeCatFilter) return false;
        if (!search) return true;
        return (n.title || '').toLowerCase().includes(search) || (n.content || '').toLowerCase().includes(search);
      });

      // Sort: pinned first, then updatedAt desc
      filtered.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      listEl.innerHTML = '';
      if (filtered.length === 0) {
        listEl.innerHTML = '<div style="padding:24px 12px; text-align:center; color:var(--text-faint); font-size:12px;">暂无相关笔记</div>';
        return;
      }

      filtered.forEach(n => {
        const item = document.createElement('div');
        item.className = 'note-card' + (n.id === activeId ? ' active' : '');
        item.onclick = () => selectNote(n.id);

        const timeStr = formatRelativeTime(n.updatedAt);
        const excerpt = (n.content || '').replace(/[#*\`~>]/g, '').trim() || '无内容...';
        const catLabel = getCatLabel(n.category);

        item.innerHTML =
          '<div class="card-top">' +
            '<span class="card-title">' + (n.pinned ? '📌 ' : '') + escapeHtml(n.title || '无标题笔记') + '</span>' +
          '</div>' +
          '<div class="card-excerpt">' + escapeHtml(excerpt) + '</div>' +
          '<div class="card-footer">' +
            '<span class="cat-badge">' + catLabel + '</span>' +
            '<span>' + timeStr + '</span>' +
          '</div>';
        listEl.appendChild(item);
      });

      updateStats();
    }

    function selectNote(id) {
      activeId = id;
      loadActiveNote();
      renderNotesList();
    }

    function loadActiveNote() {
      const note = getActiveNote();
      const titleInput = document.getElementById('note-title');
      const bodyInput = document.getElementById('note-body');
      const catSelect = document.getElementById('note-cat');
      const pinBtn = document.getElementById('btn-pin');

      if (!note) {
        titleInput.value = '';
        bodyInput.value = '';
        titleInput.disabled = true;
        bodyInput.disabled = true;
        return;
      }

      titleInput.disabled = false;
      bodyInput.disabled = false;
      titleInput.value = note.title || '';
      bodyInput.value = note.content || '';
      catSelect.value = note.category || 'work';
      pinBtn.style.opacity = note.pinned ? '1' : '0.4';

      if (currentMode === 'preview') {
        renderPreview();
      }
      updateStats();
    }

    function onTitleChange() {
      const note = getActiveNote();
      if (!note) return;
      note.title = document.getElementById('note-title').value;
      note.updatedAt = Date.now();
      scheduleSave();
      renderNotesList();
    }

    function onContentChange() {
      const note = getActiveNote();
      if (!note) return;
      note.content = document.getElementById('note-body').value;
      note.updatedAt = Date.now();
      scheduleSave();
      updateStats();
    }

    function onCatChange() {
      const note = getActiveNote();
      if (!note) return;
      note.category = document.getElementById('note-cat').value;
      note.updatedAt = Date.now();
      persist();
      renderNotesList();
    }

    function togglePin() {
      const note = getActiveNote();
      if (!note) return;
      note.pinned = !note.pinned;
      note.updatedAt = Date.now();
      document.getElementById('btn-pin').style.opacity = note.pinned ? '1' : '0.4';
      persist();
      renderNotesList();
      window.AIPA.toast('info', note.pinned ? '已置顶该笔记' : '已取消置顶');
    }

    function scheduleSave() {
      updateSaveIndicator('● 保存中...');
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        persist();
      }, 400);
    }

    function createNewNote() {
      const newNote = {
        id: 'note-' + Date.now(),
        title: '新笔记 ' + new Date().toLocaleDateString(),
        content: '',
        category: activeCatFilter !== 'all' && activeCatFilter !== 'pinned' ? activeCatFilter : 'work',
        pinned: false,
        updatedAt: Date.now()
      };
      notes.unshift(newNote);
      activeId = newNote.id;
      persist();
      renderNotesList();
      loadActiveNote();
      document.getElementById('note-title').focus();
      window.AIPA.toast('success', '已创建新笔记');
    }

    function deleteCurrentNote() {
      const note = getActiveNote();
      if (!note) return;
      if (!confirm('确定要删除笔记「' + (note.title || '无标题') + '」吗？')) return;
      notes = notes.filter(n => n.id !== activeId);
      activeId = notes[0] ? notes[0].id : null;
      persist();
      renderNotesList();
      loadActiveNote();
      window.AIPA.toast('info', '笔记已删除');
    }

    function setCategoryFilter(cat) {
      activeCatFilter = cat;
      const chips = document.querySelectorAll('.cat-chip');
      chips.forEach(c => c.classList.remove('active'));
      const activeChip = Array.from(chips).find(c => c.innerText.toLowerCase().includes(cat) || (cat === 'all' && c.innerText === '全部') || (cat === 'pinned' && c.innerText.includes('置顶')));
      if (activeChip) activeChip.classList.add('active');
      renderNotesList();
    }

    function onSearchChange() {
      renderNotesList();
    }

    function setMode(mode) {
      currentMode = mode;
      document.getElementById('btn-edit-mode').classList.toggle('active', mode === 'edit');
      document.getElementById('btn-preview-mode').classList.toggle('active', mode === 'preview');

      const editEl = document.getElementById('note-body');
      const prevEl = document.getElementById('note-preview');

      if (mode === 'preview') {
        editEl.style.display = 'none';
        prevEl.style.display = 'block';
        renderPreview();
      } else {
        editEl.style.display = 'block';
        prevEl.style.display = 'none';
      }
    }

    function renderPreview() {
      const note = getActiveNote();
      const prevEl = document.getElementById('note-preview');
      if (!note || !note.content.trim()) {
        prevEl.innerHTML = '<div style="color:var(--text-faint); font-style:italic;">无预览内容</div>';
        return;
      }
      prevEl.innerHTML = parseMarkdown(note.content);
    }

    function parseMarkdown(md) {
      let html = escapeHtml(md);
      // Code blocks
      html = html.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      // Headings
      html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
      // Blockquotes
      html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
      // Checkboxes
      html = html.replace(/- \\[x\\] (.*$)/gim, '<div style="margin:3px 0;">☑️ <s>$1</s></div>');
      html = html.replace(/- \\[ \\] (.*$)/gim, '<div style="margin:3px 0;">⬜ $1</div>');
      // Lists
      html = html.replace(/^[-*] (.*$)/gim, '<li>$1</li>');
      // Bold & Italic
      html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/\\*(.*?)\\*/g, '<em>$1</em>');
      // Newlines
      html = html.replace(/\\n/g, '<br/>');
      return html;
    }

    function sendToAI() {
      const note = getActiveNote();
      if (!note || !note.content.trim()) {
        window.AIPA.toast('warn', '笔记内容为空，无法发送给 AI');
        return;
      }
      const prompt = '【便签笔记 · ' + (note.title || '无标题') + '】：\\n\\n' + note.content + '\\n\\n请针对以上笔记内容进行分析、润色或按要求处理。';
      window.AIPA.sendPrompt(prompt);
      window.AIPA.toast('success', '已将笔记发送至 AI 智能助手！');
    }

    function copyContent() {
      const note = getActiveNote();
      if (!note || !note.content) return;
      navigator.clipboard.writeText(note.content).then(() => {
        window.AIPA.toast('success', '已复制笔记正文到剪贴板');
      });
    }

    function updateStats() {
      const note = getActiveNote();
      const count = (note && note.content) ? note.content.length : 0;
      document.getElementById('stats-text').innerText = '共 ' + notes.length + ' 篇笔记 · 当前 ' + count + ' 字';
    }

    function getCatLabel(c) {
      const map = { work: '💼 工作', ideas: '💡 灵感', study: '📚 学习', prompts: '🤖 提示词', todo: '✅ 待办' };
      return map[c] || '默认';
    }

    function formatRelativeTime(ts) {
      if (!ts) return '';
      const diff = Date.now() - ts;
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
      return new Date(ts).toLocaleDateString();
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.onload = init;
  </script>
</body>
</html>`

/** Compare dotted versions numerically; missing/invalid parts count as 0. */
function compareVersions(a: string | undefined, b: string | undefined): number {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function readInstalledVersion(manifestPath: string): string | undefined {
  try {
    return (JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as NavPluginManifest).version
  } catch {
    return undefined
  }
}

/**
 * Multi-file plugins shipped with the app (src/main/plugins/builtin/<dir>,
 * copied to dist by `npm run build:plugins`). Installed when missing and
 * upgraded only when the bundled manifest version is newer, so local edits
 * to an up-to-date plugin are never clobbered. Plugin data lives in
 * ~/.aipa/plugin-data and survives upgrades.
 */
function ensureBundledPlugins(globalDir: string): void {
  const bundledRoot = path.join(__dirname, 'builtin')
  if (!fs.existsSync(bundledRoot)) return
  for (const entry of fs.readdirSync(bundledRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      const src = path.join(bundledRoot, entry.name)
      const bundledVersion = readInstalledVersion(path.join(src, 'plugin.json'))
      const dst = path.join(globalDir, entry.name)
      const installedVersion = readInstalledVersion(path.join(dst, 'plugin.json'))
      if (installedVersion && compareVersions(bundledVersion, installedVersion) <= 0) continue
      fs.cpSync(src, dst, { recursive: true })
      log.info(`Installed bundled plugin ${entry.name} v${bundledVersion} (was ${installedVersion ?? 'none'})`)
    } catch (err) {
      log.warn(`Failed to install bundled plugin ${entry.name}:`, err)
    }
  }
}

/**
 * Ensure default starter plugins (Plugin Hub, Notes and bundled plugins) exist in ~/.aipa/plugins
 */
export function ensureDefaultPlugins(globalDir: string): void {
  try {
    // 1. Welcome / Plugin Hub (upgraded when the built-in version is newer)
    const welcomeDir = path.join(globalDir, 'welcome')
    if (!fs.existsSync(welcomeDir)) {
      fs.mkdirSync(welcomeDir, { recursive: true })
    }
    const welcomeManifestPath = path.join(welcomeDir, 'plugin.json')
    const welcomeHtmlPath = path.join(welcomeDir, 'index.html')
    const welcomeOutdated = compareVersions(DEFAULT_WELCOME_MANIFEST.version, readInstalledVersion(welcomeManifestPath)) > 0
    if (!fs.existsSync(welcomeManifestPath) || welcomeOutdated) {
      fs.writeFileSync(welcomeManifestPath, JSON.stringify(DEFAULT_WELCOME_MANIFEST, null, 2), 'utf-8')
    }
    if (!fs.existsSync(welcomeHtmlPath) || welcomeOutdated) {
      fs.writeFileSync(welcomeHtmlPath, DEFAULT_WELCOME_HTML, 'utf-8')
    }

    // 2. Notes Plugin
    const notesDir = path.join(globalDir, 'notes')
    if (!fs.existsSync(notesDir)) {
      fs.mkdirSync(notesDir, { recursive: true })
    }
    const notesManifestPath = path.join(notesDir, 'plugin.json')
    if (!fs.existsSync(notesManifestPath)) {
      fs.writeFileSync(notesManifestPath, JSON.stringify(DEFAULT_NOTES_MANIFEST, null, 2), 'utf-8')
    }
    const notesHtmlPath = path.join(notesDir, 'index.html')
    if (!fs.existsSync(notesHtmlPath)) {
      fs.writeFileSync(notesHtmlPath, DEFAULT_NOTES_HTML, 'utf-8')
    }

    // 3. Bundled multi-file plugins (Work Calendar, …)
    ensureBundledPlugins(globalDir)
  } catch (err) {
    log.warn('ensureDefaultPlugins failed:', err)
  }
}
