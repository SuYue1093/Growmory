export type AsoFields = { name: string; subtitle: string; keywords: string; description: string; promotionalText: string };
export type AsoPlan = {
  origin?: 'mcp';
  id: string;
  platform?: string;
  title: string;
  objective: string;
  market: string;
  analysis: string;
  createdAt: string;
  appliedAt?: string;
  status: string;
  target: { versionId: string; infoId: string; locale: string; platform?: string };
  before: AsoFields;
  fields: AsoFields;
  sources: { docs: { id: string; title: string; updatedAt: string }[] };
  executions: { at: string; outcome: string; completed?: string[]; error?: string }[];
};

export type AsoMediaItem = {
  order: number;
  type?: string;
  title: string;
  caption?: string;
  subcaption?: string;
  visualConcept?: string;
  rationale?: string;
  device?: string;
};

export type AsoMediaPlan = {
  title: string;
  platform?: string;
  locale?: string;
  overview?: string;
  testingHypothesis?: string;
  items: AsoMediaItem[];
};
