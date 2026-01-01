// src/schema/chat/composables/useChatScroll.ts
import { nextTick, type Ref, ref, watch } from "vue";
import type { ScrollArea } from "@/components/ui/scroll-area";

export function useChatScroll(messageCount: Ref<number>) {
	const messageListRef = ref<InstanceType<typeof ScrollArea> | null>(null);
	const isAtBottom = ref(true);

	async function scrollToBottom(behavior: ScrollBehavior = "smooth") {
		await nextTick();
		const viewport = messageListRef.value?.$el.querySelector(
			"[data-radix-scroll-area-viewport]",
		);
		if (viewport) {
			viewport.scrollTo({ top: viewport.scrollHeight, behavior });
		}
	}

	function handleScroll(event: Event) {
		const el = event.target as HTMLElement;
		if (!el) return;
		const threshold = 50;
		const isScrolledToBottom =
			el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
		isAtBottom.value = isScrolledToBottom;
	}

	watch(
		messageCount,
		(newLength, oldLength) => {
			if (newLength > oldLength && isAtBottom.value) {
				scrollToBottom("smooth");
			}
		},
		{ flush: "post" },
	);

	return {
		messageListRef,
		isAtBottom,
		scrollToBottom,
		handleScroll,
	};
}
