// src/main.ts

import { createNotivue } from "notivue";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";

import "notivue/notification.css";
import "notivue/animations.css";
import "katex/dist/katex.min.css";

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
