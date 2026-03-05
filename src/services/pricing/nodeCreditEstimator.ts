import nodePricingRaw from '@/config/pricing/node-pricing.json';
import { AppNode } from '@/types';
import {
  buildNodePricingContext,
  type PricingInputAsset,
  type PricingFeatureKey,
} from './nodePricingContext';
import {
  nodePricingConfigSchema,
  type NodePricingConfig,
  type PricingOperand,
  type PricingRoundingMode,
  type PricingRule,
} from './nodePricingSchema';

export interface EstimateNodeCreditsResult {
  value: number | null;
  label: string;
  breakdown?: string[];
}

const FALLBACK_CONFIG: NodePricingConfig = {
  version: 1,
  features: {},
};

const parsedPricingConfig = nodePricingConfigSchema.safeParse(nodePricingRaw);
const pricingConfig: NodePricingConfig = parsedPricingConfig.success
  ? parsedPricingConfig.data
  : (() => {
      console.warn('[PricingEstimator] Invalid node-pricing.json, fallback to defaults', parsedPricingConfig.error);
      return FALLBACK_CONFIG;
    })();

function resolveOperandValue(
  operand: PricingOperand,
  rule: PricingRule,
  params: Record<string, string>
): number {
  if (typeof operand === 'number') return operand;

  const table = rule.paramTables[operand.param];
  if (!table) return 0;

  const rawValue = params[operand.param];
  if (rawValue === undefined || rawValue === null) {
    return table.default ?? 0;
  }

  const keyedValue = table[String(rawValue)];
  if (typeof keyedValue === 'number') return keyedValue;

  return table.default ?? 0;
}

function applyRounding(value: number, mode: PricingRoundingMode): number {
  if (!Number.isFinite(value)) return 0;

  switch (mode) {
    case 'none':
      return value;
    case 'floor':
      return Math.floor(value);
    case 'round':
      return Math.round(value);
    case 'ceil':
    default:
      return Math.ceil(value);
  }
}

function formatCreditLabel(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(5);
  const trimmed = fixed.replace(/\.?0+$/, '');
  return trimmed || '0';
}

function getRule(featureKey: PricingFeatureKey): PricingRule | null {
  return pricingConfig.features[featureKey] || null;
}

function getSafeDuration(rawDuration: string | undefined): number {
  const duration = Number(rawDuration);
  if (!Number.isFinite(duration) || duration <= 0) return 5;
  return Math.max(1, Math.round(duration));
}

function getFallbackResolution(
  resolutionMap: Record<string, number | object>,
  preferred: string
): string {
  if (resolutionMap[preferred]) return preferred;
  if (resolutionMap['720p']) return '720p';
  const keys = Object.keys(resolutionMap);
  return keys[0] || preferred;
}

function calculateTieredCreditsByFormula(
  duration: number,
  formula: {
    firstSecondCredits: number;
    secondSecondTotalCredits?: number | null;
    incrementAfterSecondCredits?: number | null;
    incrementAfterFirstCredits?: number | null;
  }
): number {
  if (duration <= 1) return formula.firstSecondCredits;

  if (formula.secondSecondTotalCredits !== undefined && formula.secondSecondTotalCredits !== null) {
    if (duration === 2) return formula.secondSecondTotalCredits;
    const inc = formula.incrementAfterSecondCredits ?? 0;
    return formula.secondSecondTotalCredits + (duration - 2) * inc;
  }

  const inc = formula.incrementAfterFirstCredits ?? 0;
  return formula.firstSecondCredits + (duration - 1) * inc;
}

function tryEstimateViduCredits(params: Record<string, string>): EstimateNodeCreditsResult | null {
  const viduPricing = pricingConfig.viduPricing;
  if (!viduPricing) return null;

  const model = params.model || '';
  if (!model.startsWith('vidu')) return null;

  const resolution = params.resolution || '720p';
  const generationMode = params.generationMode || 'text2video';
  const duration = getSafeDuration(params.duration);
  const isOffPeak = params.serviceTier === 'flex';
  const audioEnabled = params.audio === 'on';

  let credits: number | null = null;
  const breakdown: string[] = [];

  if (model === viduPricing.q3.model) {
    const q3ResKey = getFallbackResolution(viduPricing.q3.resolutionPerSecondCredits, resolution);
    const perSecondCredits = viduPricing.q3.resolutionPerSecondCredits[q3ResKey] || 0;
    credits = perSecondCredits * duration;
    breakdown.push(`q3:${q3ResKey}@${perSecondCredits}/s`);

    if (isOffPeak && (!viduPricing.q3.offPeakRequiresAudio || audioEnabled)) {
      credits *= viduPricing.q3.offPeakFactor;
      breakdown.push(`offPeak*x${viduPricing.q3.offPeakFactor}`);
    }
  } else {
    const q2ModelRules = viduPricing.q2.rules[model];
    if (!q2ModelRules) return null;

    const q2ModeRules = q2ModelRules[generationMode] || q2ModelRules['img2video'] || q2ModelRules['text2video'];
    if (!q2ModeRules) return null;

    const q2ResKey = getFallbackResolution(q2ModeRules, resolution);
    const formula = q2ModeRules[q2ResKey] as {
      firstSecondCredits: number;
      secondSecondTotalCredits?: number | null;
      incrementAfterSecondCredits?: number | null;
      incrementAfterFirstCredits?: number | null;
    };
    credits = calculateTieredCreditsByFormula(duration, formula);
    breakdown.push(`q2:${generationMode}:${q2ResKey}`);

    if (isOffPeak) {
      const offPeakRaw = credits * viduPricing.q2.offPeakFactor;
      if (
        viduPricing.q2.offPeakRoundMode === 'ceil' &&
        viduPricing.q2.offPeakRoundUnit &&
        viduPricing.q2.offPeakRoundUnit > 0
      ) {
        credits = Math.ceil(offPeakRaw / viduPricing.q2.offPeakRoundUnit) * viduPricing.q2.offPeakRoundUnit;
      } else {
        credits = applyRounding(offPeakRaw, viduPricing.q2.offPeakRoundMode);
      }
      breakdown.push(`offPeak*x${viduPricing.q2.offPeakFactor}:${viduPricing.q2.offPeakRoundMode}`);
    }

    if (audioEnabled && viduPricing.q2.audioExtraModes.includes(generationMode)) {
      credits += viduPricing.q2.audioExtraCredits;
      breakdown.push(`audio+${viduPricing.q2.audioExtraCredits}`);
    }
  }

  if (credits === null) return null;

  const points = Math.max(0, credits * viduPricing.creditUnit);
  return {
    value: points,
    label: formatCreditLabel(points),
    breakdown: [...breakdown, `unit:${viduPricing.creditUnit}`],
  };
}

export function estimateNodeCredits(
  node: AppNode,
  inputAssets: PricingInputAsset[] = []
): EstimateNodeCreditsResult {
  const context = buildNodePricingContext(node, inputAssets);
  if (!context.featureKey) {
    return { value: null, label: '--' };
  }

  if (context.featureKey === 'video_generate' || context.featureKey === 'video_factory') {
    const fixedCreditsMap = pricingConfig.fixedModelCredits?.[context.featureKey];
    const modelKey = context.params.model;
    if (fixedCreditsMap && modelKey && typeof fixedCreditsMap[modelKey] === 'number') {
      const fixedValue = Math.max(0, fixedCreditsMap[modelKey]);
      return {
        value: fixedValue,
        label: formatCreditLabel(fixedValue),
        breakdown: [`fixedModel:${modelKey}`],
      };
    }

    const viduEstimate = tryEstimateViduCredits(context.params);
    if (viduEstimate) return viduEstimate;
  }

  const rule = getRule(context.featureKey);
  if (!rule) {
    return { value: 0, label: '0', breakdown: [`missing-rule:${context.featureKey}`] };
  }

  const addValues = rule.add.map((item) => resolveOperandValue(item, rule, context.params));
  const multiplyValues = rule.multiply.map((item) => resolveOperandValue(item, rule, context.params));

  const addTotal = addValues.reduce((sum, value) => sum + value, 0);
  const multiplyTotal = multiplyValues.reduce((result, value) => result * value, 1);
  const rawTotal = (rule.base + addTotal) * multiplyTotal;

  const rounded = applyRounding(rawTotal, rule.rounding);
  const safeValue = Number.isFinite(rounded) ? Math.max(0, rounded) : Math.max(0, rule.default);

  return {
    value: safeValue,
    label: formatCreditLabel(safeValue),
    breakdown: [`base:${rule.base}`, `add:${addTotal}`, `multiply:${multiplyTotal}`],
  };
}
