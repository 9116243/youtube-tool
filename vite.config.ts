import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

// 兼容 __dirname 在 ESM 下不可用
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  // 读取 .env / .env.local 等环境变量（不加第三个参数，全部变量都会读取）
  const env = loadEnv(mode, process.cwd(), '')

  // 自定义基础路径：Web 用 '/'，若打桌面壳可设为 './'
  const base = env.VITE_BASE?.trim() || '/'

  // 后端 API 基址（用于 dev 代理）
  const apiBase = env.VITE_API_BASE?.trim() || 'http://localhost:3001'

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      // 避免多份 React 产生的 hooks 冲突
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: Number(env.VITE_DEV_PORT || 5173),
      open: true,
      strictPort: true,
      host: true,
      hmr: { overlay: true },
      proxy: {
        // 前端以 /api 开头的请求会被代理到后端（SSE 也可透传）
        '/api': {
          target: apiBase,
          changeOrigin: true,
          ws: true,
          // 若后端实际没有 /api 前缀，这里可以重写：
          // rewrite: p => p.replace(/^\/api/, '')
        },
      },
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT || 5173),
      host: true,
    },
    define: {
      // 在代码里可用：__APP_VERSION__
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      // 让部分库认为在浏览器环境
      'process.env': {},
    },
    css: {
      // 可选：CSS Modules 规则
      modules: {
        localsConvention: 'camelCaseOnly',
        generateScopedName: mode === 'development'
          ? '[name]__[local]__[hash:base64:5]'
          : '[hash:base64:8]',
      },
      // PostCSS 会自动读取 postcss.config.*
    },
    optimizeDeps: {
      include: [
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-slot',
        '@radix-ui/react-popover',
        '@radix-ui/react-tooltip',
        '@radix-ui/react-tabs',
        'lucide-react',
        'clsx',
        'tailwind-merge',
        'zustand',
        'axios',
        'framer-motion',
      ],
      esbuildOptions: {
        target: 'es2020',
      },
    },
    esbuild: {
      target: 'es2020',
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode === 'development',
      cssCodeSplit: true,
      // 更细的分包策略，便于浏览器缓存
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            motion: ['framer-motion'],
            radix: [
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-tooltip',
              '@radix-ui/react-tabs',
              '@radix-ui/react-slot',
            ],
            vendor: ['axios', 'zustand'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    // Tauri/Electron 打包常见要求：关闭经常性的文件系统警告
    // worker: { format: 'es' },
  }
})
