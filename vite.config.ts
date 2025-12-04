import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vueDevTools from "vite-plugin-vue-devtools";
import { visualizer } from "rollup-plugin-visualizer";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue(),
    tailwindcss(),
    vueDevTools(),
    visualizer({
      open: true, // 构建完成后自动打开网页
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          // 拆分 monaco-editor (如果你非要留着它)
          if (id.includes("node_modules/monaco-editor")) {
            return "monaco";
          }
          // 拆分 shiki
          if (
            id.includes("node_modules/shiki") ||
            id.includes("node_modules/@shikijs")
          ) {
            return "shiki";
          }
          // 拆分 vue 相关的库
          if (id.includes("node_modules/vue")) {
            return "vue-vendor";
          }
          // 拆分其他大的依赖
          if (id.includes("node_modules")) {
            return "vendor"; // 其他所有 node_modules 打包到 vendor
          }
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
