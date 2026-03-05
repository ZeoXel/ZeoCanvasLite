import { z } from 'zod';

export const ROUNDING_MODES = ['none', 'ceil', 'floor', 'round'] as const;

export const pricingOperandSchema = z.union([
  z.number(),
  z.object({
    param: z.string().min(1),
  }),
]);

export const paramTableSchema = z.record(z.string(), z.number());

export const pricingRuleSchema = z.object({
  base: z.number().default(0),
  add: z.array(pricingOperandSchema).default([]),
  multiply: z.array(pricingOperandSchema).default([]),
  paramTables: z.record(z.string(), paramTableSchema).default({}),
  default: z.number().default(0),
  rounding: z.enum(ROUNDING_MODES).default('ceil'),
});

const q2FormulaEntrySchema = z.object({
  firstSecondCredits: z.number(),
  secondSecondTotalCredits: z.number().nullable().optional(),
  incrementAfterSecondCredits: z.number().nullable().optional(),
  incrementAfterFirstCredits: z.number().nullable().optional(),
});

const q2ResolutionFormulaMapSchema = z.record(z.string(), q2FormulaEntrySchema);
const q2ModeFormulaMapSchema = z.record(z.string(), q2ResolutionFormulaMapSchema);
const q2ModelFormulaMapSchema = z.record(z.string(), q2ModeFormulaMapSchema);

const viduPricingSchema = z.object({
  creditUnit: z.number().positive(),
  q3: z.object({
    model: z.string(),
    resolutionPerSecondCredits: z.record(z.string(), z.number()),
    offPeakFactor: z.number().positive().default(0.5),
    offPeakRequiresAudio: z.boolean().default(true),
  }),
  q2: z.object({
    offPeakFactor: z.number().positive().default(0.5),
    offPeakRoundMode: z.enum(ROUNDING_MODES).default('ceil'),
    offPeakRoundUnit: z.number().positive().optional(),
    audioExtraCredits: z.number().default(15),
    audioExtraModes: z.array(z.string()).default(['img2video', 'reference']),
    rules: q2ModelFormulaMapSchema,
  }),
});

export const nodePricingConfigSchema = z.object({
  version: z.number().int().positive(),
  features: z.record(z.string(), pricingRuleSchema),
  fixedModelCredits: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  viduPricing: viduPricingSchema.optional(),
});

export type PricingOperand = z.infer<typeof pricingOperandSchema>;
export type PricingRule = z.infer<typeof pricingRuleSchema>;
export type NodePricingConfig = z.infer<typeof nodePricingConfigSchema>;
export type PricingRoundingMode = z.infer<typeof pricingRuleSchema>['rounding'];
