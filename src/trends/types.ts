export type TrendRow = {
  date: string;
  source: string;
  territory: string;
  kind: 'engagement' | 'downloads';
  impressions: number;
  pageViews: number;
  firstDownloads: number;
  redownloads: number;
  processingDate?: string;
};

export type RevenueReport = {
  status: string;
  message?: string;
  syncedAt?: string;
  coverage: string[];
  rows: { date: string; source: string; territory: string; salesUsd: number; proceedsUsd: number }[];
};

export type Insights = {
  analysis?: {
    body: string;
    at: string;
    scope: { days: number; end: string; source: string; territory: string };
  };
  appId: string;
  checkedAt: string;
  trends: {
    status: string;
    message?: string;
    checkedAt?: string;
    reportSyncFailed?: boolean;
    syncedAt?: string;
    rows: TrendRow[];
    coverage: Record<string, string[]>;
    revenue?: RevenueReport;
  };
  aso: {
    status: string;
    message?: string;
    syncedAt?: string;
    localizations: {
      locale: string;
      versionId: string;
      infoId: string;
      version: string;
      platform: string;
      createdDate?: string;
      fields: {
        name: string;
        subtitle: string;
        keywords: string;
        description: string;
        promotionalText: string;
      };
    }[];
  };
};

export type Period = {
  days: number;
  end: string;
};

export type Metric = 'impressions' | 'pageViews' | 'firstDownloads' | 'redownloads';

export type AnalyticsTab = 'overview' | 'sources' | 'territories' | 'funnel' | 'daily';

export type Milestone = {
  date: string;
  type: 'release' | 'aso' | 'content' | 'manual';
  label: string;
  detail?: string;
  version?: string;
  url?: string;
  channel?: string;
  tags?: string[];
  hasAso?: boolean;
  hasAsoCopy?: boolean;
  hasAsoMedia?: boolean;
};

export type SourceSummary = {
  source: string;
  label: string;
  impressions: number;
  pageViews: number;
  firstDownloads: number;
  redownloads: number;
  totalDownloads: number;
  conversionRate: number; // firstDownloads / impressions
  installRate: number; // firstDownloads / pageViews
  share: number; // % of first downloads or impressions
};

export type TerritorySummary = {
  code: string;
  name: string;
  flag: string;
  impressions: number;
  pageViews: number;
  firstDownloads: number;
  redownloads: number;
  totalDownloads: number;
  conversionRate: number;
  share: number;
};

export type FunnelStage = {
  key: string;
  label: string;
  subtitle: string;
  count: number | null;
  prevCount: number | null;
  rateToNext?: number;
  prevRateToNext?: number;
  rateLabel?: string;
};

