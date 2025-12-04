// src/main.ts
import { createApp } from "vue";
import { createNotivue } from "notivue";
import { createPinia } from "pinia";
import App from "./App.vue";

import "notivue/notification.css";
import "notivue/animations.css";
// import "markstream-vue/style.css";
import "katex/dist/katex.min.css";

if (typeof window !== "undefined" && !window.process) {
  // @ts-ignore
  window.process = {
    env: {},
    // 伪造一个 stderr，让 isTTY 检查安全地失败
    stderr: {
      isTTY: false,
      // @ts-ignore

      write: (msg: string) => {
        console.error(msg);
      }, // 还可以把 write 映射到 console.error
    },
  };
}

const pinia = createPinia();
const notivue = createNotivue({
  position: "top-right",
  limit: 6,
  enqueue: true,
  avoidDuplicates: true,
  notifications: {
    global: {
      duration: 10000,
    },
  },
});
const app = createApp(App);

app.use(pinia);
app.use(notivue);
app.mount("#app");
