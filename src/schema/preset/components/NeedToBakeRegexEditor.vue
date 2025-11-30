<!-- src/schema/preset/components/NeedToBakeRegexEditor.vue -->
<script setup lang="ts">
import { ref, watch } from "vue";
import draggable from "vuedraggable";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { GripVertical, Trash2, ChevronDown, ArrowRight } from "lucide-vue-next";
import { nanoid } from "nanoid";

// Based on src/schema/preset/preset.types.ts
type NeedToBakeRegex = {
    id: string; // Add id for keying in draggable
    find_regex: string;
    replace_string: string;
    applyOn: "rendering" | "generating";
};

type NeedToBakeRegexGroup = Omit<NeedToBakeRegex, "id">[];

const props = defineProps<{
    modelValue: NeedToBakeRegexGroup;
}>();

const emit = defineEmits(["update:modelValue"]);

// Add unique IDs for v-for and draggable
const internalRules = ref(
    props.modelValue.map((rule) => ({ ...rule, id: nanoid() })),
);

watch(
    () => props.modelValue,
    (newValue) => {
        // Sync with external changes, preserving IDs if possible
        internalRules.value = newValue.map((rule) => ({
            ...rule,
            id: nanoid(),
        }));
    },
    { deep: true },
);

const updateRules = (newRules: NeedToBakeRegex[]) => {
    internalRules.value = newRules;
    // Strip the id before emitting the update
    const rulesToEmit = newRules.map(({ id, ...rest }) => rest);
    emit("update:modelValue", rulesToEmit);
};

const addRule = () => {
    const newRule: NeedToBakeRegex = {
        id: nanoid(),
        find_regex: "",
        replace_string: "",
        applyOn: "rendering",
    };
    const newRules = [...internalRules.value, newRule];
    updateRules(newRules);
};

const removeRule = (id: string) => {
    const newRules = internalRules.value.filter((rule) => rule.id !== id);
    updateRules(newRules);
};
</script>

<template>
    <div class="w-full space-y-2">
        <draggable
            v-model="internalRules"
            item-key="id"
            handle=".handle"
            @end="updateRules(internalRules)"
        >
            <template #item="{ element: rule, index }">
                <div class="mb-2">
                    <Accordion type="single" collapsible>
                        <AccordionItem :value="rule.id">
                            <AccordionTrigger
                                class="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-md"
                            >
                                <div class="flex items-center gap-4 grow">
                                    <GripVertical
                                        class="handle cursor-move text-gray-500"
                                    />
                                    <span class="font-semibold"
                                        >Rule #{{ index + 1 }}:
                                        {{
                                            rule.find_regex || "New Rule"
                                        }}</span
                                    >
                                </div>
                                <div class="flex items-center gap-4">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        @click.stop="removeRule(rule.id)"
                                    >
                                        <Trash2 class="h-4 w-4" />
                                    </Button>
                                    <ChevronDown
                                        class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200"
                                    />
                                </div>
                            </AccordionTrigger>
                            <AccordionContent class="p-4 border rounded-b-md">
                                <div class="space-y-4">
                                    <div
                                        class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4"
                                    >
                                        <div class="space-y-1">
                                            <Label
                                                :for="`find-regex-${rule.id}`"
                                                >Find Regex</Label
                                            >
                                            <Input
                                                :id="`find-regex-${rule.id}`"
                                                v-model="rule.find_regex"
                                                placeholder="e.g., /<(?:user|assistant)>/g"
                                                class="flex-1"
                                            />
                                        </div>

                                        <ArrowRight
                                            class="h-5 w-5 text-gray-500 mt-6 hidden md:block"
                                        />

                                        <div class="space-y-1">
                                            <Label
                                                :for="`replace-string-${rule.id}`"
                                                >Replace String</Label
                                            >
                                            <Input
                                                :id="`replace-string-${rule.id}`"
                                                v-model="rule.replace_string"
                                                placeholder="e.g., ''"
                                                class="flex-1"
                                            />
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-8">
                                        <div class="w-full space-y-1">
                                            <Label :for="`apply-on-${rule.id}`"
                                                >Apply On</Label
                                            >
                                            <Select v-model="rule.applyOn">
                                                <SelectTrigger
                                                    :id="`apply-on-${rule.id}`"
                                                >
                                                    <SelectValue
                                                        placeholder="Select when to apply"
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem
                                                        value="rendering"
                                                        >Rendering</SelectItem
                                                    >
                                                    <SelectItem
                                                        value="generating"
                                                        >Generating</SelectItem
                                                    >
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </template>
        </draggable>
        <Button variant="outline" @click="addRule" class="w-full">
            Add New Bake Rule
        </Button>
    </div>
</template>

<style scoped>
.handle {
    cursor: grab;
}
.handle:active {
    cursor: grabbing;
}
</style>
