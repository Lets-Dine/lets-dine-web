import { IS_LIVE_API, apiRequest } from './http';
import { authHeaders } from './live-admin';

/** The first-run checklist exists only on the live backend; the offline demo has nothing to derive it from. */
export const ONBOARDING_ENABLED = IS_LIVE_API;

export type OnboardingStepKey = 'brand' | 'fees' | 'categories' | 'dishes' | 'tables' | 'staff' | 'first-order';

export interface OnboardingStep {
  key: OnboardingStepKey;
  done: boolean;
  optional: boolean;
}

export interface OnboardingProgress {
  steps: OnboardingStep[];
  completed: number;
  total: number;
}

export async function fetchOnboarding(): Promise<OnboardingProgress> {
  return apiRequest<OnboardingProgress>('/restaurant/onboarding', { headers: authHeaders() });
}
