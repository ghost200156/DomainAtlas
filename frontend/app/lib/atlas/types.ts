import type { AtlasDocument, ConceptNode, DemoRun } from "../types";

export type AtlasEvidence = NonNullable<DemoRun["research_pack"]>["evidence"][number];
export type AtlasRelation = AtlasDocument["relations"][number];
export type AtlasSource = AtlasDocument["sources"][number];
export type AtlasModule = AtlasDocument["modules"][number];
export type AtlasPosition = { x: number; y: number };

export type AtlasIndex = {
  conceptsById: Map<string, ConceptNode>;
  modulesById: Map<string, AtlasModule>;
  conceptsByModule: Map<string, ConceptNode[]>;
  relationsByConcept: Map<string, AtlasRelation[]>;
  evidenceById: Map<string, AtlasEvidence>;
  sourcesById: Map<string, AtlasSource>;
  conceptOrder: Map<string, number>;
  learningOrder: string[];
};

export type AtlasLayout = {
  width: number;
  height: number;
  positions: Map<string, AtlasPosition>;
  modulePositions: Map<string, AtlasPosition>;
};

export type ViewState = { x: number; y: number; scale: number };

export type SourceSearchResult = {
  id?: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  isNew?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "tutor";
  text: string;
};

export type VerifyResult = { passed: boolean; feedback: string };

export type VerifyState = {
  mode: boolean;
  text: string;
  result: VerifyResult | null;
  loading: boolean;
};

export type SearchableDemoRun = DemoRun & {
  pre_search_results?: Record<string, SourceSearchResult[]>;
};
