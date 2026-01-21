# 设计配色方案

基于债券管理系统设计规范更新的配色系统

## 颜色对比

### 主色系 Primary Colors

| 用途 | 旧配色 | 新配色 | 变化说明 |
|------|--------|--------|----------|
| 主色 | `#6366f1` (紫色) | `#3B82F6` (蓝色) | 从紫色系改为蓝色系，更专业 |
| 主色深色 | `#4f46e5` | `#1e3a8a` | 深蓝色，用于表格表头、强调元素 |
| 品牌红 | - | `#8B1919` | 新增品牌红，可用于重要标识 |

### 功能色 Functional Colors

| 用途 | 旧配色 | 新配色 | 变化说明 |
|------|--------|--------|----------|
| 成功 | `#10b981` (绿色) | `#108981` (青绿色) | 改为更专业的青绿色 |
| 警告 | `#f59e0b` | `#F59E0B` | 保持不变 |
| 危险 | `#ef4444` | `#EF4444` | 保持不变 |

### 中性色 Neutral Colors

| 用途 | 旧配色 | 新配色 | 变化说明 |
|------|--------|--------|----------|
| 标题文本 | `#0f172a` | `#1f2937` | 调整为更平衡的深灰色 |
| 正文文本 | `#64748b` | `#6b7280` | 稍微加深，提高可读性 |
| 边框 | `#e2e8f0` | `#e5e7eb` | 更柔和的边框色 |

### 背景色 Background Colors

| 用途 | 旧配色 | 新配色 | 变化说明 |
|------|--------|--------|----------|
| 主背景 | `#ffffff` | `#ffffff` | 保持不变 |
| 次要背景 | `#f8fafc` | `#f9fafb` | 微调为更中性的灰色 |
| 悬浮背景 | `#f1f5f9` | `#f3f4f6` | 更温和的悬浮效果 |
| 表格斑马纹 | - | `#f0f9ff` | 新增浅蓝色斑马纹 |

## 使用方式

### Tailwind CSS 类名

```jsx
// 主色按钮
<button className="bg-primary hover:bg-primary-dark">主要操作</button>

// 成功按钮（新的青绿色）
<button className="bg-success hover:bg-success-light">确认</button>

// 品牌红标题

// 中性色文本
<h2 className="text-neutral-heading">标题</h2>
<p className="text-neutral-body">正文内容</p>

// 背景色
<div className="bg-bg-secondary">次要区域</div>
<div className="hover:bg-bg-hover">悬浮效果</div>
```

### CSS 变量

```css
/* 使用 CSS 变量 */
.custom-element {
  color: var(--primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
}

/* 成功状态 */
.success-message {
  color: var(--success);
  background: var(--success-light);
}
```

## 设计原则

1. **色彩一致性**：统一使用蓝色系作为主色调，保持专业感
2. **功能性**：成功（青绿）、警告（橙）、危险（红）清晰区分
3. **可访问性**：确保文字与背景有足够对比度（WCAG AA 标准）
4. **品牌识别**：品牌红 (#8B1919) 用于重要品牌标识

## 视觉效果

新配色方案带来的视觉改进：

- ✅ 更专业的蓝色系主色调
- ✅ 成功色从绿色改为青绿色，更符合金融行业风格
- ✅ 统一的中性色体系，提高整体一致性
- ✅ 新增品牌红色，可用于重要标识和强调
- ✅ 优化的背景色系统，包括表格斑马纹

## 更新日期

2026-01-21
