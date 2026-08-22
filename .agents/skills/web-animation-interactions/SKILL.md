---
name: web-animation-interactions
description: 现代前端高阶动效与微交互专家。精通 Aceternity UI 风格动效、鼠标聚光灯（Spotlight）、3D 卡片视差倾斜、流光边框、平滑缓动曲线与粒子特效。
---

# 现代前端高阶动效与微交互规范 (Web Animation & Interactions Expert)

动效不是单纯的视觉装饰，而是为用户提供清晰的界面层级感、空间感与即时反馈。所有动效需保持丝滑（60+ FPS）、轻盈且富有物理质感。

---

## 1. 动效曲线与时间法则 (Timing & Easing)

- **高级缓动曲线 (Custom Cubic-Bezier)**:
  - **流畅滑入 (Smooth Deceleration)**: `cubic-bezier(0.16, 1, 0.3, 1)`（推荐用于菜单、抽屉、页面切换）
  - **弹性反馈 (Spring Bounce)**: `cubic-bezier(0.34, 1.56, 0.64, 1)`（推荐用于按钮点击、徽标弹出、Toast 提示）
  - **微弱悬浮 (Gentle Hover)**: `cubic-bezier(0.4, 0, 0.2, 1)`（推荐用于卡片悬浮、图标位移）
- **时间节奏**:
  - 微交互（Hover / Click）：`150ms ~ 250ms`
  - 弹窗 / 抽屉展开：`300ms ~ 450ms`
  - 骨架屏流动 / 极光渐变旋转：`3s ~ 8s`（持续循环）

---

## 2. 经典高阶动效模式实现 (Interaction Patterns)

### 2.1 鼠标跟随聚光灯效果 (Spotlight Hover)
卡片在鼠标滑过时，背景呈现随光标移动的柔和光斑：
```javascript
// 监听卡片鼠标移动事件
document.querySelectorAll('.spotlight-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  });
});
```
```css
.spotlight-card {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.spotlight-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(400px circle at var(--mouse-x, -999px) var(--mouse-y, -999px), rgba(167, 139, 250, 0.15), transparent 80%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.spotlight-card:hover::before {
  opacity: 1;
}
```

### 2.2 3D 视差倾斜 (3D Tilt Effect)
卡片随鼠标位置产生轻微 3D 倾角：
```css
.tilt-card {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
  transform-style: preserve-3d;
}
.tilt-card:hover {
  transform: perspective(1000px) rotateX(var(--rotate-x, 0deg)) rotateY(var(--rotate-y, 0deg)) translateY(-4px);
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.2);
}
```

### 2.3 流光边框 (Moving / Shimmer Border)
```css
@keyframes shimmer-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.shimmer-border-box {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  padding: 1px;
}
.shimmer-border-box::before {
  content: '';
  position: absolute;
  top: -50%; left: -50%; width: 200%; height: 200%;
  background: conic-gradient(transparent, rgba(167, 139, 250, 0.8), transparent 30%);
  animation: shimmer-spin 4s linear infinite;
}
```

### 2.4 交错进场动效 (Staggered Animation)
页面加载或 Tab 切换时，列表元素依次淡入上升：
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.stagger-item {
  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.stagger-item:nth-child(1) { animation-delay: 0.05s; }
.stagger-item:nth-child(2) { animation-delay: 0.10s; }
.stagger-item:nth-child(3) { animation-delay: 0.15s; }
.stagger-item:nth-child(4) { animation-delay: 0.20s; }
```

---

## 3. 性能守则 (Performance Rules)

1. **只在 GPU 加速属性上做动画**：严格限制在 `transform` 和 `opacity` 上，禁止频繁过渡 `height`, `width`, `top`, `left`, `margin` 或 `padding`。
2. **预声明优化**：对于高频复杂动画元素，添加 `will-change: transform, opacity;`，动画结束后适时释放。
3. **尊重用户的无障碍偏好 (prefers-reduced-motion)**：
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```
