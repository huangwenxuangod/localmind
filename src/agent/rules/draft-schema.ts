import { z } from "zod";

export const BusinessTypeSchema = z.enum([
  "restaurant",
  "cafe",
  "shopping",
  "entertainment",
  "leisure",
  "sport",
  "culture",
]);

export const PlanDraftSchema = z.object({
  userGoal: z.string().min(1).optional(),
  preferences: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
  participantNotes: z.array(z.string()).default([]),
  itinerary: z.array(
    z.object({
      businessType: BusinessTypeSchema,
      durationMin: z.number().int().min(20).max(150).optional(),
      goal: z.string().optional(),
      whyRecommended: z.string().optional(),
      suitabilityTags: z.array(z.string()).default([]),
    })
  ).min(1).max(4),
  whyThisWorks: z.array(z.string()).default([]),
  hiddenInsights: z.array(z.string()).default([]),
});

export type PlanDraft = z.infer<typeof PlanDraftSchema>;
export type PlanDraftStep = PlanDraft["itinerary"][number];
