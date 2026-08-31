import { DEFAULT_DSA_CONFIG, type DsaProgramConfig } from '@/lib/dsa/types';
import { isCodingLanguageId, type CodingLanguageId } from '@/lib/coding/languages';

export function parseProgramConfig(raw: unknown): DsaProgramConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_DSA_CONFIG;
  const o = raw as Record<string, unknown>;
  const langs = Array.isArray(o.supportedLanguages)
    ? (o.supportedLanguages.filter((x) => typeof x === 'string' && isCodingLanguageId(x)) as CodingLanguageId[])
    : DEFAULT_DSA_CONFIG.supportedLanguages;
  const mix = o.difficultyMix && typeof o.difficultyMix === 'object'
    ? (o.difficultyMix as Record<string, unknown>)
    : {};
  const day = o.dayCompletion && typeof o.dayCompletion === 'object'
    ? (o.dayCompletion as Record<string, unknown>)
    : {};
  const week = o.weekQualification && typeof o.weekQualification === 'object'
    ? (o.weekQualification as Record<string, unknown>)
    : {};
  return {
    supportedLanguages: langs.length ? langs : DEFAULT_DSA_CONFIG.supportedLanguages,
    defaultLanguage:
      typeof o.defaultLanguage === 'string' && isCodingLanguageId(o.defaultLanguage)
        ? o.defaultLanguage
        : DEFAULT_DSA_CONFIG.defaultLanguage,
    dayCompletion: {
      minCodingSolved: Number(day.minCodingSolved) || DEFAULT_DSA_CONFIG.dayCompletion.minCodingSolved,
      minCodingPassFraction:
        Number(day.minCodingPassFraction) || DEFAULT_DSA_CONFIG.dayCompletion.minCodingPassFraction,
      minMcqAttempted: Number(day.minMcqAttempted) || DEFAULT_DSA_CONFIG.dayCompletion.minMcqAttempted,
      minMcqPercent: Number(day.minMcqPercent) || DEFAULT_DSA_CONFIG.dayCompletion.minMcqPercent,
    },
    weekQualification: {
      requireAllDaysCompleted:
        week.requireAllDaysCompleted !== false,
      weeklyAssessmentMinPercent:
        Number(week.weeklyAssessmentMinPercent) ||
        DEFAULT_DSA_CONFIG.weekQualification.weeklyAssessmentMinPercent,
    },
    difficultyMix: {
      easy: Number(mix.easy) || DEFAULT_DSA_CONFIG.difficultyMix.easy,
      medium: Number(mix.medium) || DEFAULT_DSA_CONFIG.difficultyMix.medium,
      advanced: Number(mix.advanced) || DEFAULT_DSA_CONFIG.difficultyMix.advanced,
    },
    codingProblemsPerDay:
      Number(o.codingProblemsPerDay) || DEFAULT_DSA_CONFIG.codingProblemsPerDay,
    mcqsPerDay: Number(o.mcqsPerDay) || DEFAULT_DSA_CONFIG.mcqsPerDay,
    weeklyAssessmentMcqs:
      Number(o.weeklyAssessmentMcqs) || DEFAULT_DSA_CONFIG.weeklyAssessmentMcqs,
    mixTolerancePercent:
      Number(o.mixTolerancePercent) || DEFAULT_DSA_CONFIG.mixTolerancePercent,
  };
}
