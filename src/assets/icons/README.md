# 图标文件

需要创建以下尺寸的 PNG 图标：

- icon-16.png (16x16 像素)
- icon-48.png (48x48 像素)
- icon-128.png (128x128 像素)

## 创建方法

### 选项 1: 使用在线工具
访问 https://www.favicon-generator.org/ 或类似工具，上传一个 SVG 或图片，生成不同尺寸的图标。

### 选项 2: 使用 ImageMagick
如果有 SVG 文件，可以使用 ImageMagick 转换：

```bash
convert icon.svg -resize 16x16 icon-16.png
convert icon.svg -resize 48x48 icon-48.png
convert icon.svg -resize 128x128 icon-128.png
```

### 选项 3: 使用 Figma/Sketch/Photoshop
手动创建并导出不同尺寸的图标。

## 临时方案

在开发阶段，可以创建简单的占位图标，或在 manifest.json 中暂时注释掉图标引用。
