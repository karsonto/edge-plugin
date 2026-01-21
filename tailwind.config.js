/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./sidepanel.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 参考债券管理系统设计规范配色
        primary: {
          DEFAULT: '#3B82F6',  // 主蓝 Primary Blue
          dark: '#1e3a8a',     // 深蓝 Dark Blue
          light: '#60a5fa',    // 浅蓝
        },
        brand: {
          red: '#8B1919',      // 品牌红 Brand Red
        },
        success: {
          DEFAULT: '#108981',  // 成功 Success（青绿色）
          light: '#14b8a6',
        },
        warning: {
          DEFAULT: '#F59E0B',  // 警告 Warning
          light: '#fbbf24',
        },
        danger: {
          DEFAULT: '#EF4444',  // 错误/删除 Error
          light: '#f87171',
        },
        neutral: {
          heading: '#1f2937',  // 标题黑
          body: '#6b7280',     // 正文灰
          border: '#e5e7eb',   // 边框灰
        },
        bg: {
          main: '#ffffff',     // 主背景
          secondary: '#f9fafb', // 浅灰背景
          hover: '#f3f4f6',    // 悬浮背景
          stripe: '#f0f9ff',   // 表格斑马纹
        },
      },
    },
  },
  plugins: [],
}
