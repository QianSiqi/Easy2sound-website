---
name: advanced-component-patterns
description: 现代前端高级组件设计模式与交互架构专家。精通高级模态弹窗系统、流媒体播放器集成、无障碍 a11y、Toast 通知系统与响应式适配。
---

# 高级现代 Web 组件设计模式 (Advanced Component Patterns)

构建健壮、美观且符合现代 Web 标准的高级 UI 组件库，具备高度可复用性、可访问性（a11y）与交互平滑度。

---

## 1. 核心高级组件规范

### 1.1 高级模态系统 (Glass Modal & Dialog)
- **遮罩层 (Backdrop)**:
  ```css
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  ```
- **进出场动效**: 配合缩放与透明度（`scale(0.95) -> scale(1)`），带有弹性缓动曲线。
- **行为规范**:
  - 按下 `Escape` 键自动关闭。
  - 点击遮罩外部安全区域自动关闭。
  - 自动聚焦于首个可交互输入框或按钮，并锁定页面滚动（`overflow: hidden`）。

### 1.2 现代卡片与媒体预览 (Media & Audio/Video Cards)
- **声库/音乐卡片**:
  - 封面高保真圆角、封面微放大 Hover 效果（`transform: scale(1.05)`）。
  - 内置精巧的波形动效（Animated Wave Bars）与直接播放/暂停悬浮快捷键。
  - 标签（Tags）使用微渐变色胶囊样式（Pill Badge）。
- **视频嵌入 (Iframe Embed Container)**:
  - 保持 16:9 响应式比例（`aspect-ratio: 16 / 9`），杜绝因屏幕尺寸缩放导致的黑边与变形。

### 1.3 现代浮动通知系统 (Glass Toast Notifications)
- 右上角或底部居中弹出，支持堆叠显示。
- 自动倒计时淡出，支持滑动手势或点击关闭。
- 玻璃磨砂质感配合微发光指示条（状态指示：成功绿、警告橙、错误红）。

---

## 2. 无障碍与健壮性 (Accessibility & Resilience)

1. **焦点管理 (Focus Visible)**:
   ```css
   :focus-visible {
     outline: 2px solid #a78bfa;
     outline-offset: 2px;
   }
   ```
2. **语义化与 ARIA 标注**:
   - 模态弹窗添加 `role="dialog"` 与 `aria-modal="true"`。
   - 纯图标按钮必须配置 `aria-label` 或隐藏的无障碍文本。
3. **高 DPI / Retina 屏图标与图片适配**:
   - 优先使用矢量图标（SVG / Lucide Icons）。
   - 图片支持懒加载（`loading="lazy"`）与错误占位（`onerror` fallback）。
