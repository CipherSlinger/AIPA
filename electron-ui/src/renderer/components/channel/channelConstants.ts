// Channel panel constants — Iteration 321

export type ChannelType = 'feishu' | 'wechat'

export interface FeishuConfig {
  appId: string
  appSecret: string
  botWebhookUrl: string   // Feishu custom bot webhook URL (outgoing)
  verifyToken: string     // incoming webhook verify token
  connected: boolean
  lastTestedAt?: number
}

export interface WechatConfig {
  appId: string
  appSecret: string
  token: string
  encodingAESKey: string
  connected: boolean
  lastTestedAt?: number
}

export interface ChannelMessage {
  id: string
  channel: ChannelType
  sender: string
  content: string
  timestamp: number
  direction: 'in' | 'out'
}

export const DEFAULT_FEISHU_CONFIG: FeishuConfig = {
  appId: '',
  appSecret: '',
  botWebhookUrl: '',
  verifyToken: '',
  connected: false,
}

export const DEFAULT_WECHAT_CONFIG: WechatConfig = {
  appId: '',
  appSecret: '',
  token: '',
  encodingAESKey: '',
  connected: false,
}

export const FEISHU_DOCS_URL = 'https://open.feishu.cn/document/home/index'
export const WECHAT_DOCS_URL = 'https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html'
