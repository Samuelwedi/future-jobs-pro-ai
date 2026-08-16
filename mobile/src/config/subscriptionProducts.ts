import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type PlanKey = 'basic' | 'professional' | 'enterprise';

// Create these exact IDs in App Store Connect and Google Play Console.
// Prices shown in the app come from the store, never from this source file.
export const STORE_PRODUCT_IDS: Record<PlanKey, string> = {
  basic: 'com.samuel33.futurejobspro.basic.monthly',
  professional: 'com.samuel33.futurejobspro.professional.monthly',
  enterprise: 'com.samuel33.futurejobspro.enterprise.monthly',
};

type PlanCopy = {
  name: string;
  audience: string;
  fallbackPrice: string;
  featured?: boolean;
  tint: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  features: string[];
};

export const FALLBACK_PLAN_COPY: Record<PlanKey, PlanCopy> = {
  basic: {
    name: 'Basic',
    audience: 'For small field teams',
    fallbackPrice: '$49',
    tint: '#3C74E6',
    icon: 'construct-outline',
    features: ['Up to 5 employees', 'Time tracking and GPS', 'Scheduling and task management', 'Essential workforce reports'],
  },
  professional: {
    name: 'Professional',
    audience: 'For growing operations',
    fallbackPrice: '$99',
    featured: true,
    tint: '#00AFC8',
    icon: 'sparkles-outline',
    features: ['Up to 20 employees', 'Lucy AI workspace assistant', 'AI photo compliance and voice notes', 'Advanced reports and integrations'],
  },
  enterprise: {
    name: 'Enterprise',
    audience: 'For multi-team organizations',
    fallbackPrice: '$199',
    tint: '#8B5CF6',
    icon: 'business-outline',
    features: ['Unlimited employees', 'Professional evidence packages', 'Priority support', 'Custom integrations and controls'],
  },
};

export function planKeyForProduct(productId: string): PlanKey | null {
  return (Object.keys(STORE_PRODUCT_IDS) as PlanKey[]).find(
    (key) => STORE_PRODUCT_IDS[key] === productId,
  ) || null;
}
