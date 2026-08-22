---
name: modern-web-designer
description: 现代高级前端与 UI/UX 视觉设计专家。精通 Apple / Linear / Vercel 风格设计规范、Bento Grid 便当盒布局、Dark Glassmorphism 2.0 极光毛玻璃、流体排版与色彩系统。
---

# 现代高级前端与 UI/UX 设计规范 (Modern Web Design Expert)

当设计或编写网页（HTML/CSS/JS/Vue/React）时，必须以国际一流科技产品（如 Apple, Linear, Vercel, Stripe, Raycast）的设计标准为基准，确保产出的界面具备极高的视觉质感与美学一致性。

---

## 1. 视觉基底与氛围 (Atmosphere & Materials)

### 1.1 深色背景层级体系 (Dark Theme Hierarchy)
避免使用单调的纯黑 (`#000000`)，建立丰富的深色色阶体系：
- **Canvas Base（底层画布）**: `#08090d` 或 `#0b0c10`（带极微弱的深蓝/冷紫冷调）
- **Surface Elevation 1（主要卡片）**: `rgba(255, 255, 255, 0.03)` ~ `rgba(255, 255, 255, 0.05)`
- **Surface Elevation 2（悬浮/激活卡片）**: `rgba(255, 255, 255, 0.07)` ~ `rgba(255, 255, 255, 0.1)`
- **Modal / Popover（弹窗与悬浮层）**: `rgba(18, 19, 26, 0.85)` + `backdrop-filter: blur(20px) saturate(180%)`

### 1.2 现代毛玻璃与微边框 (Glassmorphism & Micro-Borders)
- **精致描边 (Subtle Inset Borders)**:
  ```css
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.02) inset, 
              0 20px 40px -15px rgba(0, 0, 0, 0.5);
  ```
- **环境光晕 (Ambient Glow)**:
  在页面核心区域（如 Hero 区域或主卡片背后）使用柔和的径向渐变光斑：
  ```css
  background: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.15), transparent 70%);
  ```

---

## 2. 布局体系 (Layout Systems)

### 2.1 Bento Grid（便当盒网格布局）
在功能展示区、特性看板或声库展示中，采用非对称但视觉平衡的 Bento 卡片：
- 主次分明：核心特性占据 `span 2` 或 `span 3`，次要特性或指标占据 `span 1`。
- 卡片内部结构：
  - **顶部**: 徽标（Badge）+ 标题 + 简要副标题
  - **主体**: 交互预览区（图表、模拟操作界面、内嵌播放器或动态视觉）
  - **底部**: 辅助状态标签或跳转指示箭头（`→`）

### 2.2 流体排版与间距 (Fluid Typography & Spacing)
- **字体栈**: 优先使用现代高可读性字体：
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Outfit", "Plus Jakarta Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  ```
- **无级字阶**:
  - Hero 标题: `font-size: clamp(2.2rem, 5vw + 1rem, 4rem); font-weight: 800; letter-spacing: -0.03em;`
  - 区块标题: `font-size: clamp(1.5rem, 2.5vw + 0.5rem, 2.2rem); font-weight: 700; letter-spacing: -0.02em;`
  - 正文字体: `font-size: 15px ~ 16px; line-height: 1.6; color: rgba(255, 255, 255, 0.7);`

---

## 3. 颜色与对比度规范 (Color System)

- **主色与渐变 (Accents)**:
  - 推荐高饱和度冷暖交织渐变：`linear-gradient(135deg, #a78bfa 0%, #6366f1 50%, #3b82f6 100%)`
  - 文字渐变（Gradient Text）：
    ```css
    background: linear-gradient(135deg, #ffffff 30%, rgba(255, 255, 255, 0.6) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    ```
- **功能色**:
  - 成功 (Success): `#10b981` (Emerald)
  - 警告 (Warning): `#f59e0b` (Amber)
  - 危险 (Danger): `#ef4444` (Rose)

---

## 4. UI 细节打磨清单 (Checklist)

1. [ ] 是否消除了所有原生粗糙的滚动条，使用自定义细长深色滚动条？
2. [ ] 输入框聚焦（Focus）时是否有平滑的品牌色光晕外圈（`box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.4)`）？
3. [ ] 所有的圆角（Border-Radius）是否保持数学比例协调（大卡片 `16px~24px`，按钮 `10px~12px`，标签 `6px~8px`）？
4. [ ] 移动端是否具备自适应断点与手势触摸友好的点击区域（最小 `44px × 44px`）？
