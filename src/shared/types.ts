// ── 爬取相关 ──
export interface RawTopic {
  sourceId: number;
  sourceRank: number;
  title: string;
  url: string;
  heatIndex: number;
  rawHeat: number | null;
  fetchedAt: number;
}

// ── API 请求/响应 ──
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface StatsResponse {
  activeTopics: number;
  velocityBreakouts: number;
  alertsToday: number;
  sourcesOnline: number;
  sourcesTotal: number;
}

export interface KeywordInput {
  keyword: string;
  category?: string;
  growthThreshold?: number;
}

export interface SettingInput {
  value: string;
}

// ── 实时事件 ──
export interface SocketEvents {
  new_topic: (topic: TopicSummary) => void;
  alert: (alert: AlertSummary) => void;
  source_status: (data: { sourceId: number; status: string }) => void;
  subscribe_category: (category: string) => void;
  subscribe_keyword: (keywordId: number) => void;
}

export interface TopicSummary {
  id: number;
  title: string;
  normalizedTitle: string;
  sourceId: number;
  sourceName?: string;
  sourceRank: number | null;
  url: string | null;
  heatIndex: number;
  rawHeat: number | null;
  growthRate: number | null;
  velocityScore: number | null;
  aiVerified: number;
  aiSummary: string | null;
  aiCategory: string | null;
  tier: string | null;
  matchedKeyword: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  publishedAt?: string | null;
  recommendScore?: number | null;
  peakHeat: number;
  mentionCount: number;
}

export interface TopicTier {
  tier: 'burst' | 'hot' | 'rising' | null;
  label: string;
  icon: string;
  color: string;
}

export interface AlertSummary {
  id: number;
  topicId: number;
  keywordId: number | null;
  alertType: string;
  severity: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  topicTitle?: string;
}

export interface SourceSummary {
  id: number;
  slug: string;
  name: string;
  url: string;
  accessType: string;
  isActive: boolean;
  status: string;
  lastFetchedAt: string | null;
  topicsFound24h?: number;
}

export interface AgentSearchResult {
  topics: TopicSummary[];
  query: string;
  total: number;
}
