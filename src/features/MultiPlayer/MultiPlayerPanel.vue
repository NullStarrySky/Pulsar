<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- Header -->
    <div
      class="p-3 border-b border-border flex justify-between items-center bg-muted/40"
    >
      <h2
        class="font-semibold text-sm tracking-wide text-muted-foreground flex items-center gap-2"
      >
        <Users class="w-4 h-4" />
        联机
      </h2>
      <div class="flex items-center gap-1">
        <div class="text-[10px] text-muted-foreground max-w-[100px] truncate" :title="store.selfPeerId">
            {{ store.selfPeerId }}
        </div>
        <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            @click="copyMyId"
            title="复制我的 ID"
        >
            <Copy class="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>

    <!-- Controls -->
    <div class="p-3 border-b border-border space-y-3">
      <div class="space-y-1">
        <label class="text-[10px] font-medium text-muted-foreground">昵称</label>
        <Input 
            v-model="selfNameInput" 
            @blur="updateSelfName" 
            @keyup.enter="updateSelfName"
            class="h-7 text-xs bg-muted/20" 
            placeholder="设置昵称"
        />
      </div>
      
      <div class="space-y-1">
        <label class="text-[10px] font-medium text-muted-foreground">添加好友</label>
        <div class="flex flex-col gap-2">
           <div class="flex gap-2">
                <Input v-model="newFriendId" placeholder="Peer ID" class="h-7 text-xs flex-1 bg-muted/20" />
                <Button @click="handleAddFriend" size="sm" variant="secondary" class="h-7 px-3 text-xs">
                    <Plus class="w-3.5 h-3.5 mr-1" /> 添加
                </Button>
           </div>
           <Input v-if="newFriendId" v-model="newFriendName" placeholder="好友备注 (选填)" class="h-7 text-xs bg-muted/20" />
        </div>
        
      </div>
    </div>

    <!-- Friend List -->
    <ScrollArea class="flex-1 p-2">
      <div v-if="store.friends.length === 0" class="text-center text-xs text-muted-foreground py-8">
        暂无好友，添加一个好友开始聊天吧。
      </div>
      <div class="space-y-1.5" v-else>
        <Item
          v-for="friend in sortedFriends"
          :key="friend.peerId"
          size="sm"
          variant="outline"
          class="group relative transition-all duration-200 hover:border-primary/50"
        >
          <ItemContent>
            <ItemTitle class="truncate text-xs font-medium">
              {{ friend.name || 'Unknown' }}
            </ItemTitle>
            <ItemDescription class="text-[10px] truncate opacity-70" :title="friend.peerId">
              {{ friend.peerId }}
            </ItemDescription>
          </ItemContent>

          <ItemActions class="flex items-center gap-1">
             <!-- Status Indicator -->
            <div class="relative flex h-2 w-2 mr-1" :title="isConnected(friend.peerId) ? 'Connected' : 'Disconnected'">
              <span
                v-if="isConnected(friend.peerId)"
                class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-green-500"
              ></span>
              <span
                class="relative inline-flex rounded-full h-2 w-2"
                :class="isConnected(friend.peerId) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'"
              ></span>
            </div>

            <Button
                v-if="!isConnected(friend.peerId)"
                size="icon"
                variant="ghost"
                class="h-6 w-6 text-muted-foreground hover:text-primary"
                @click="store.connectToFriend(friend.peerId)"
                title="重连"
            >
                <RefreshCw class="w-3 h-3" />
            </Button>
             
            <Button
                size="icon"
                variant="ghost"
                class="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                @click="store.removeFriend(friend.peerId)"
                title="删除好友"
            >
                <Trash2 class="w-3 h-3" />
            </Button>
          </ItemActions>
        </Item>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useMultiPlayerStore } from "./MultiPlayer.store";
import { Users, Copy, Plus, Trash2, RefreshCw } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const store = useMultiPlayerStore();
const selfNameInput = ref("");
const newFriendId = ref("");
const newFriendName = ref("");

onMounted(() => {
    store.init();
    selfNameInput.value = store.selfName;
});

watch(() => store.selfName, (newVal) => {
    if (newVal !== selfNameInput.value) {
        selfNameInput.value = newVal;
    }
});

const updateSelfName = () => {
    if (selfNameInput.value.trim()) {
        store.setSelfName(selfNameInput.value.trim());
    }
};

const handleAddFriend = () => {
    if (!newFriendId.value.trim()) return;
    const name = newFriendName.value.trim() || `User ${newFriendId.value.substring(0, 5)}`;
    store.addFriend(newFriendId.value.trim(), name);
    newFriendId.value = "";
    newFriendName.value = "";
};

const copyMyId = async () => {
    if (store.selfPeerId) {
        try {
            await writeText(store.selfPeerId);
            // Could add toast notification here
        } catch (e) {
            console.error(e);
        }
    }
};

const isConnected = (peerId: string) => {
    const conn = store.connections[peerId];
    return conn && conn.open;
};

const sortedFriends = computed(() => {
    return [...store.friends].sort((a, b) => {
        const aConn = isConnected(a.peerId);
        const bConn = isConnected(b.peerId);
        if (aConn && !bConn) return -1;
        if (!aConn && bConn) return 1;
        return 0;
    });
});
</script>
