#!/usr/bin/env python3
"""
AIPA Promotional Video Generator
自动生成 AIPA 产品推广视频（85 秒 MP4）
"""

import asyncio
import os
import textwrap
from pathlib import Path

import edge_tts
import numpy as np
from moviepy import (
    AudioFileClip,
    CompositeVideoClip,
    ImageClip,
    TextClip,
    VideoFileClip,
    concatenate_videoclips,
)
import moviepy.video.fx as vfx_module
from PIL import Image, ImageDraw, ImageFont

# ─── 配置 ────────────────────────────────────────────────────────────────────

WIDTH, HEIGHT = 1920, 1080
FPS = 30
OUTPUT = "aipa_promo.mp4"
ASSETS_DIR = Path("promo_assets")

# 颜色（RGB）
C_BG        = (10,  17,  40)   # 深蓝背景
C_BLUE      = (59, 130, 246)   # 品牌蓝
C_BLUE2     = (99, 179, 255)   # 亮蓝强调
C_WHITE     = (255, 255, 255)
C_GRAY      = (148, 163, 184)
C_GRAY_DIM  = ( 71,  85, 105)
C_GREEN     = ( 52, 211, 153)
C_ORANGE    = (251, 146,  60)
C_RED       = (248, 113, 113)

# 字体路径
FONT_BOLD   = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG    = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

# TTS 声音
TTS_VOICE   = "zh-CN-XiaoxiaoNeural"  # 女声，自然流畅

# ─── 分镜定义 ─────────────────────────────────────────────────────────────────

SCENES = [
    # (id, duration, type, title, subtitle, tag_text, tag_color, narration)
    {
        "id": "hook1",
        "dur": 5,
        "type": "hook",
        "title": "你每天要在\nAI 窗口和工作环境\n之间反复切换？",
        "sub": "",
        "tag": "痛点",
        "tag_color": C_RED,
        "narration": "你是不是每天在 AI 聊天窗口和工作环境之间反复切换？",
    },
    {
        "id": "hook2",
        "dur": 5,
        "type": "hook",
        "title": "复制粘贴\n手动执行\n上下文断裂",
        "sub": "AI 本该替你做这些",
        "tag": "痛点",
        "tag_color": C_RED,
        "narration": "复制粘贴、手动执行、上下文断裂——AI 本该替你做这些。",
    },
    {
        "id": "vs",
        "dur": 5,
        "type": "split",
        "left_title": "普通 AI",
        "left_items": ["我来告诉你怎么做", "你来复制代码", "你来执行命令", "你来检查结果"],
        "right_title": "AIPA",
        "right_items": ["直接读写你的文件", "自己运行命令", "分析并修复问题", "全程你来审批"],
        "narration": "大多数 AI 工具是回答机器——它们告诉你怎么做，但真正动手的还是你。",
    },
    {
        "id": "intro",
        "dur": 5,
        "type": "product",
        "title": "AIPA",
        "sub": "你桌面上的 AI 行动者",
        "desc": "不只回答问题，而是直接帮你把事做了",
        "narration": "AIPA——你桌面上的 AI 行动者。不只回答问题，而是直接帮你把事做了。",
    },
    {
        "id": "demo_file",
        "dur": 8,
        "type": "demo",
        "icon": "📂",
        "feature": "文件操作",
        "steps": [
            ('用户输入', '帮我把 src/ 下所有 TODO 注释整理成清单'),
            ('AI 思考', '分析项目结构，定位所有 TODO...'),
            ('权限请求', '允许读取 src/ 目录？  [允许] [拒绝]'),
            ('执行中',   '读取 12 个文件，提取 34 条 TODO...'),
            ('完成',     '✅ TODO 清单已生成，共 34 条，按优先级排序'),
        ],
        "narration": "告诉它你要做什么——它自己去读文件、分析内容、输出结果。",
    },
    {
        "id": "demo_code",
        "dur": 8,
        "type": "demo",
        "icon": "⚡",
        "feature": "代码执行",
        "steps": [
            ('用户输入', '运行测试并修复所有失败的用例'),
            ('执行命令', '$ npm test  →  3 failed, 14 passed'),
            ('AI 分析',  '发现 TypeError: undefined is not a function...'),
            ('自动修复', '修改 auth.ts:47，补全空值检查'),
            ('重新验证', '✅ $ npm test  →  17 passed, 0 failed'),
        ],
        "narration": "它能运行命令、分析结果、修复问题——一气呵成，你只需要看着它工作。",
    },
    {
        "id": "demo_hotkey",
        "dur": 6,
        "type": "feature_card",
        "icon": "⌨️",
        "feature": "全局热键召唤",
        "highlight": "Ctrl + Shift + Space",
        "desc": "在任何应用中随时召唤 AIPA\n选中文字 → 一键翻译 / 总结 / 改写",
        "narration": "在任何应用中，一个快捷键召唤 AI。剪贴板里的内容，一键翻译、总结、改写。",
    },
    {
        "id": "demo_session",
        "dur": 6,
        "type": "feature_card",
        "icon": "💾",
        "feature": "会话永久保存",
        "highlight": "关掉重开，对话还在",
        "desc": "完整的历史记录，随时恢复上次的工作现场\n上下文不断线，思路不丢失",
        "narration": "关掉重开，对话还在。它记住你的每一次工作，随时继续。",
    },
    {
        "id": "demo_persona",
        "dur": 6,
        "type": "feature_card",
        "icon": "🎭",
        "feature": "AI 角色系统",
        "highlight": "打造你的专属 AI 助手",
        "desc": "代码审查员  ·  写作助手  ·  研究分析师\n每个场景用对应的角色，系统提示词自动切换",
        "narration": "创建你的专属 AI 角色——代码审查、写作润色、研究分析，每个场景用对应的人格。",
    },
    {
        "id": "features",
        "dur": 6,
        "type": "grid",
        "title": "每个细节都为效率而生",
        "items": [
            ("📝", "智能笔记",   "随手记录，一键发送到对话"),
            ("🔍", "对话搜索",   "历史消息全文检索"),
            ("⌘",  "命令面板",   "键盘驱动，极速操作"),
            ("🛒", "技能市场",   "一键安装 46+ 专业技能"),
            ("📌", "书签管理",   "重要消息随时收藏"),
            ("🌐", "多语言支持", "中英日等多语言界面"),
        ],
        "narration": "笔记、搜索、命令面板、技能市场——每个细节都为效率而生。",
    },
    {
        "id": "trust",
        "dur": 6,
        "type": "trust",
        "title": "安全透明，你做主",
        "items": [
            ("🔒", "API 密钥加密存储，从不明文传输"),
            ("✋", "每个文件操作都需要你批准"),
            ("👁️", "所有工具调用实时可见"),
            ("📖", "MIT 开源协议，代码完全透明"),
        ],
        "narration": "API 密钥加密存储，每个操作需要你批准，代码完全开源。",
    },
    {
        "id": "opensource",
        "dur": 5,
        "type": "opensource",
        "title": "开源免费，社区驱动",
        "sub": "你的反馈直接影响产品方向",
        "stats": [("MIT", "开源协议"), ("免费", "永久免费"), ("GitHub", "完全开放")],
        "narration": "开源免费，社区驱动。你的反馈直接影响产品方向。",
    },
    {
        "id": "cta",
        "dur": 8,
        "type": "cta",
        "title": "AIPA",
        "sub": "让 AI 真正为你工作",
        "cta1": "立即下载",
        "cta2": "GitHub ⭐ Star",
        "narration": "AIPA，让 AI 真正为你工作。现在就下载，或到 GitHub 给我们一颗 Star。",
    },
]

# ─── 工具函数 ──────────────────────────────────────────────────────────────────

def font(size, bold=True):
    path = FONT_BOLD if bold else FONT_REG
    return ImageFont.truetype(path, size)


def new_frame(bg=C_BG):
    img = Image.new("RGB", (WIDTH, HEIGHT), bg)
    return img, ImageDraw.Draw(img)


def draw_text_centered(draw, text, y, size=60, color=C_WHITE, bold=True, max_width=1600):
    f = font(size, bold)
    lines = text.split("\n")
    line_h = size * 1.4
    total_h = line_h * len(lines)
    start_y = y - total_h / 2
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=f)
        w = bbox[2] - bbox[0]
        x = (WIDTH - w) / 2
        draw.text((x, start_y + i * line_h), line, font=f, fill=color)


def draw_tag(draw, text, x, y, color=C_BLUE):
    f = font(28, bold=True)
    bbox = draw.textbbox((0, 0), text, font=f)
    pw, ph = bbox[2] - bbox[0] + 32, bbox[3] - bbox[1] + 16
    draw.rounded_rectangle([x, y, x + pw, y + ph], radius=8, fill=color)
    draw.text((x + 16, y + 8), text, font=f, fill=C_WHITE)


def draw_gradient_bar(draw, y=HEIGHT - 4, color=C_BLUE):
    for i in range(WIDTH):
        alpha = int(255 * (1 - abs(i / WIDTH - 0.5) * 2))
        r = int(color[0] * alpha / 255)
        g = int(color[1] * alpha / 255)
        b = int(color[2] * alpha / 255)
        draw.line([(i, y), (i, y + 4)], fill=(r, g, b))


def draw_logo_mark(draw, cx, cy, r=40):
    """Draw AIPA logo mark - blue hexagon"""
    import math
    pts = [(cx + r * math.cos(math.radians(60 * i - 30)),
            cy + r * math.sin(math.radians(60 * i - 30))) for i in range(6)]
    draw.polygon(pts, fill=C_BLUE)
    f = font(28, bold=True)
    draw.text((cx - 14, cy - 16), "AI", font=f, fill=C_WHITE)


def img_to_clip(img, duration):
    arr = np.array(img)
    return ImageClip(arr).with_duration(duration)


# ─── 帧生成器 ──────────────────────────────────────────────────────────────────

def make_hook(scene):
    img, draw = new_frame()
    # 背景网格点
    for x in range(0, WIDTH, 80):
        for y in range(0, HEIGHT, 80):
            draw.ellipse([x - 1, y - 1, x + 1, y + 1], fill=C_GRAY_DIM)
    # 标签
    draw_tag(draw, scene.get("tag", ""), 80, 80, scene.get("tag_color", C_RED))
    # 主标题
    draw_text_centered(draw, scene["title"], HEIGHT // 2 - 20, size=72, bold=True)
    # 副标题
    if scene.get("sub"):
        draw_text_centered(draw, scene["sub"], HEIGHT // 2 + 120, size=44, color=C_BLUE2)
    draw_gradient_bar(draw)
    return img


def make_split(scene):
    img, draw = new_frame()
    # 中线
    draw.line([(WIDTH // 2, 100), (WIDTH // 2, HEIGHT - 100)], fill=C_GRAY_DIM, width=2)
    f_title = font(44, bold=True)
    f_item  = font(34, bold=False)

    def draw_side(x_center, title, items, accent):
        bbox = draw.textbbox((0, 0), title, font=f_title)
        w = bbox[2] - bbox[0]
        draw.text((x_center - w // 2, 140), title, font=f_title, fill=accent)
        for i, item in enumerate(items):
            bbox2 = draw.textbbox((0, 0), item, font=f_item)
            w2 = bbox2[2] - bbox2[0]
            draw.text((x_center - w2 // 2, 240 + i * 80), item, font=f_item, fill=C_GRAY)

    draw_side(WIDTH // 4,     scene["left_title"],  scene["left_items"],  C_GRAY)
    draw_side(WIDTH * 3 // 4, scene["right_title"], scene["right_items"], C_BLUE)
    draw_gradient_bar(draw)
    return img


def make_product(scene):
    img, draw = new_frame()
    # 发光圆
    for r in range(300, 0, -30):
        alpha = int(15 * (300 - r) / 300)
        color = (C_BLUE[0], C_BLUE[1], C_BLUE[2])
        draw.ellipse([WIDTH // 2 - r, HEIGHT // 2 - r,
                      WIDTH // 2 + r, HEIGHT // 2 + r],
                     outline=(*color, alpha), width=1)

    draw_logo_mark(draw, WIDTH // 2, HEIGHT // 2 - 140, r=60)
    draw_text_centered(draw, scene["title"], HEIGHT // 2 - 20, size=110, bold=True)
    draw_text_centered(draw, scene["sub"],   HEIGHT // 2 + 90, size=52, color=C_BLUE2)
    draw_text_centered(draw, scene["desc"],  HEIGHT // 2 + 180, size=36, color=C_GRAY)
    draw_gradient_bar(draw)
    return img


def make_demo(scene):
    img, draw = new_frame()
    f_icon    = font(56, bold=True)
    f_feature = font(42, bold=True)
    f_tag     = font(26, bold=True)
    f_step    = font(32, bold=False)
    f_content = font(30, bold=False)

    # 顶部标题
    icon_text = scene["icon"] + "  " + scene["feature"]
    draw.text((80, 70), icon_text, font=f_feature, fill=C_BLUE2)

    # 终端风格面板
    panel_x, panel_y = 80, 160
    panel_w, panel_h = WIDTH - 160, HEIGHT - 260
    draw.rounded_rectangle([panel_x, panel_y, panel_x + panel_w, panel_y + panel_h],
                            radius=16, fill=(18, 28, 58))
    # 标题栏
    draw.rounded_rectangle([panel_x, panel_y, panel_x + panel_w, panel_y + 48],
                            radius=16, fill=(30, 45, 80))
    for ci, cc in enumerate([(239, 68, 68), (234, 179, 8), (34, 197, 94)]):
        draw.ellipse([panel_x + 20 + ci * 28, panel_y + 14,
                      panel_x + 34 + ci * 28, panel_y + 34], fill=cc)
    draw.text((panel_x + 120, panel_y + 12), "AIPA  —  Chat", font=f_tag, fill=C_GRAY)

    # 步骤
    for i, (label, content) in enumerate(scene["steps"]):
        y = panel_y + 72 + i * 100
        # 标签
        tag_colors = {
            "用户输入": C_BLUE,  "AI 思考": C_GRAY_DIM, "权限请求": C_ORANGE,
            "执行中": C_GRAY_DIM, "完成": C_GREEN, "执行命令": C_GRAY_DIM,
            "AI 分析": C_GRAY_DIM, "自动修复": C_ORANGE, "重新验证": C_GREEN,
        }
        tc = tag_colors.get(label, C_GRAY_DIM)
        bbox = draw.textbbox((0, 0), label, font=f_tag)
        tw = bbox[2] - bbox[0] + 20
        draw.rounded_rectangle([panel_x + 24, y, panel_x + 24 + tw, y + 34],
                                radius=6, fill=tc)
        draw.text((panel_x + 34, y + 4), label, font=f_tag, fill=C_WHITE)
        # 内容
        draw.text((panel_x + 24 + tw + 16, y + 2), content, font=f_content, fill=C_WHITE)

    draw_gradient_bar(draw)
    return img


def make_feature_card(scene):
    img, draw = new_frame()
    f_icon = font(96, bold=True)
    f_hi   = font(64, bold=True)
    f_desc = font(38, bold=False)
    f_feat = font(36, bold=True)

    draw.text((WIDTH // 2 - 50, 140), scene["icon"], font=f_icon, fill=C_BLUE)
    draw_text_centered(draw, scene["feature"],   380, size=40, color=C_GRAY, bold=False)
    draw_text_centered(draw, scene["highlight"], 500, size=64, color=C_BLUE2, bold=True)
    draw_text_centered(draw, scene["desc"],      650, size=38, color=C_GRAY, bold=False)
    draw_gradient_bar(draw)
    return img


def make_grid(scene):
    img, draw = new_frame()
    f_title = font(52, bold=True)
    f_icon  = font(48, bold=True)
    f_name  = font(36, bold=True)
    f_desc  = font(28, bold=False)

    bbox = draw.textbbox((0, 0), scene["title"], font=f_title)
    w = bbox[2] - bbox[0]
    draw.text(((WIDTH - w) // 2, 60), scene["title"], font=f_title, fill=C_WHITE)

    cols, rows = 3, 2
    cw, ch = WIDTH // cols, (HEIGHT - 180) // rows
    for i, (icon, name, desc) in enumerate(scene["items"]):
        col, row = i % cols, i // cols
        cx = col * cw + cw // 2
        cy = 180 + row * ch + ch // 2 - 40
        # 卡片背景
        pad = 20
        draw.rounded_rectangle(
            [col * cw + pad, 180 + row * ch + pad,
             (col + 1) * cw - pad, 180 + (row + 1) * ch - pad],
            radius=16, fill=(18, 28, 58)
        )
        draw.text((cx - 28, cy - 30), icon, font=f_icon, fill=C_BLUE)
        bbox2 = draw.textbbox((0, 0), name, font=f_name)
        nw = bbox2[2] - bbox2[0]
        draw.text((cx - nw // 2, cy + 30), name, font=f_name, fill=C_WHITE)
        bbox3 = draw.textbbox((0, 0), desc, font=f_desc)
        dw = bbox3[2] - bbox3[0]
        draw.text((cx - dw // 2, cy + 80), desc, font=f_desc, fill=C_GRAY)

    draw_gradient_bar(draw)
    return img


def make_trust(scene):
    img, draw = new_frame()
    f_title = font(56, bold=True)
    f_icon  = font(44, bold=True)
    f_item  = font(36, bold=False)

    draw_text_centered(draw, scene["title"], 120, size=56, color=C_WHITE)
    for i, (icon, text) in enumerate(scene["items"]):
        y = 230 + i * 130
        # 卡片
        draw.rounded_rectangle([160, y, WIDTH - 160, y + 100],
                                radius=14, fill=(18, 28, 58))
        draw.text((200, y + 24), icon, font=f_icon, fill=C_BLUE)
        draw.text((310, y + 28), text, font=f_item, fill=C_WHITE)

    draw_gradient_bar(draw)
    return img


def make_opensource(scene):
    img, draw = new_frame()
    f_title = font(56, bold=True)
    f_sub   = font(38, bold=False)
    f_stat  = font(52, bold=True)
    f_label = font(30, bold=False)

    draw_text_centered(draw, scene["title"], 200, size=56)
    draw_text_centered(draw, scene["sub"],   310, size=38, color=C_GRAY)

    # 统计数据卡
    n = len(scene["stats"])
    card_w = 320
    total_w = n * card_w + (n - 1) * 40
    start_x = (WIDTH - total_w) // 2
    for i, (val, label) in enumerate(scene["stats"]):
        cx = start_x + i * (card_w + 40)
        draw.rounded_rectangle([cx, 420, cx + card_w, 600],
                                radius=16, fill=(18, 28, 58))
        bbox = draw.textbbox((0, 0), val, font=f_stat)
        vw = bbox[2] - bbox[0]
        draw.text((cx + (card_w - vw) // 2, 445), val, font=f_stat, fill=C_BLUE2)
        bbox2 = draw.textbbox((0, 0), label, font=f_label)
        lw = bbox2[2] - bbox2[0]
        draw.text((cx + (card_w - lw) // 2, 535), label, font=f_label, fill=C_GRAY)

    draw_gradient_bar(draw)
    return img


def make_cta(scene):
    img, draw = new_frame()
    # 背景光晕
    for r in range(500, 0, -40):
        alpha = int(8 * (500 - r) / 500)
        draw.ellipse([WIDTH // 2 - r, HEIGHT // 2 - r,
                      WIDTH // 2 + r, HEIGHT // 2 + r],
                     outline=(*C_BLUE, alpha), width=2)

    draw_logo_mark(draw, WIDTH // 2, HEIGHT // 2 - 200, r=70)
    draw_text_centered(draw, scene["title"], HEIGHT // 2 - 80, size=120, bold=True)
    draw_text_centered(draw, scene["sub"],   HEIGHT // 2 + 60,  size=52, color=C_BLUE2)

    # CTA 按钮
    btn_y = HEIGHT // 2 + 170
    # 主按钮
    draw.rounded_rectangle([WIDTH // 2 - 320, btn_y, WIDTH // 2 - 20, btn_y + 80],
                            radius=40, fill=C_BLUE)
    f_btn = font(36, bold=True)
    bbox1 = draw.textbbox((0, 0), scene["cta1"], font=f_btn)
    bw1 = bbox1[2] - bbox1[0]
    draw.text((WIDTH // 2 - 320 + (300 - bw1) // 2, btn_y + 22),
              scene["cta1"], font=f_btn, fill=C_WHITE)
    # 副按钮
    draw.rounded_rectangle([WIDTH // 2 + 20, btn_y, WIDTH // 2 + 320, btn_y + 80],
                            radius=40, outline=C_GRAY, width=2, fill=(18, 28, 58))
    bbox2 = draw.textbbox((0, 0), scene["cta2"], font=f_btn)
    bw2 = bbox2[2] - bbox2[0]
    draw.text((WIDTH // 2 + 20 + (300 - bw2) // 2, btn_y + 22),
              scene["cta2"], font=f_btn, fill=C_GRAY)

    draw_gradient_bar(draw)
    return img


FRAME_MAKERS = {
    "hook":         make_hook,
    "split":        make_split,
    "product":      make_product,
    "demo":         make_demo,
    "feature_card": make_feature_card,
    "grid":         make_grid,
    "trust":        make_trust,
    "opensource":   make_opensource,
    "cta":          make_cta,
}


# ─── TTS 生成 ─────────────────────────────────────────────────────────────────

async def generate_tts(scenes, assets_dir):
    audio_paths = {}
    for scene in scenes:
        narration = scene.get("narration", "")
        if not narration:
            continue
        path = assets_dir / f"audio_{scene['id']}.mp3"
        if path.exists():
            print(f"  [TTS] 跳过已存在: {path.name}")
            audio_paths[scene["id"]] = str(path)
            continue
        print(f"  [TTS] 生成: {scene['id']} ...")
        communicate = edge_tts.Communicate(narration, TTS_VOICE, rate="+8%")
        await communicate.save(str(path))
        audio_paths[scene["id"]] = str(path)
    return audio_paths


# ─── 主流程 ───────────────────────────────────────────────────────────────────

def build_clip(scene, audio_path=None):
    stype = scene["type"]
    maker = FRAME_MAKERS.get(stype)
    if maker is None:
        print(f"  [WARN] 未知场景类型: {stype}，跳过")
        return None

    img = maker(scene)
    dur = scene["dur"]
    clip = img_to_clip(img, dur)

    if audio_path and os.path.exists(audio_path):
        audio = AudioFileClip(audio_path)
        # 音频时长可能超过视频时长，以视频为准截断
        if audio.duration > dur:
            audio = audio.subclipped(0, dur)
        clip = clip.with_audio(audio)

    # 淡入淡出
    from moviepy.video.fx import FadeIn, FadeOut
    clip = FadeIn(0.4).apply(clip)
    clip = FadeOut(0.4).apply(clip)
    return clip


def main():
    print("=" * 60)
    print("  AIPA 推广视频生成器")
    print("=" * 60)

    ASSETS_DIR.mkdir(exist_ok=True)

    # 1. 生成 TTS 音频
    print("\n[1/3] 生成旁白语音 ...")
    audio_paths = asyncio.run(generate_tts(SCENES, ASSETS_DIR))

    # 2. 生成视频片段
    print("\n[2/3] 渲染视频帧 ...")
    clips = []
    for scene in SCENES:
        print(f"  渲染场景: {scene['id']} ({scene['dur']}s)")
        audio_path = audio_paths.get(scene["id"])
        clip = build_clip(scene, audio_path)
        if clip:
            clips.append(clip)

    # 3. 合成输出
    print(f"\n[3/3] 合成视频 → {OUTPUT} ...")
    final = concatenate_videoclips(clips, method="compose")
    final.write_videofile(
        OUTPUT,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile="temp_audio.m4a",
        remove_temp=True,
        preset="fast",
        ffmpeg_params=["-crf", "20"],
        logger="bar",
    )

    print(f"\n✅ 完成！视频已保存到: {OUTPUT}")
    print(f"   总时长: {final.duration:.1f} 秒")
    print(f"   分辨率: {WIDTH}x{HEIGHT} @ {FPS}fps")


if __name__ == "__main__":
    main()
