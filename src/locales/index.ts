import { createI18n } from 'vue-i18n'
// 虚拟模块由 unplugin-vue-i18n 插件根据 include 目录自动生成
import messages from '@intlify/unplugin-vue-i18n/messages'

// 获取持久化存储的语言设置，默认为中文
const savedLocale = localStorage.getItem('pulsar-lang') || 'zh-CN'

const i18n = createI18n({
  // 必须设置为 false 才能在 Vue 3 中使用 Composition API
  legacy: false, 
  // 全局注入 $t 函数到 template
  globalInjection: true,
  // 当前语言
  locale: savedLocale,
  // 备用语言
  fallbackLocale: 'en-US',
  // 导入自动合并后的语言包
  messages
})

export default i18n