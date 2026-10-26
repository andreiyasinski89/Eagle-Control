export interface StageDefault {
  name: string;
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
}

export const DEFAULT_PIPELINE_NAME = "Sales";

export const DEFAULT_STAGES: StageDefault[] = [
  { name: "New lead", probability: 10 },
  { name: "Qualification", probability: 20 },
  { name: "Meeting / presentation", probability: 40 },
  { name: "Proposal", probability: 60 },
  { name: "Negotiation", probability: 80 },
  { name: "Won", probability: 100, isWon: true },
  { name: "Lost", probability: 0, isLost: true },
];

export const DEFAULT_LOST_REASONS = [
  "Price too high",
  "Chose a competitor",
  "No budget",
  "No response",
  "Not a fit",
];
