import { queryString, type Handler } from '../http/context.js';
import { target } from './shared.js';

interface ResourceRule {
  verbs?: string[];
  apiGroups?: string[];
  resources?: string[];
  resourceNames?: string[];
}

interface RulesReview {
  status?: {
    resourceRules?: ResourceRule[];
    nonResourceRules?: Array<Record<string, any>>;
    incomplete?: boolean;
  };
}

interface Identity {
  username?: string;
  uid?: string;
  groups?: string[];
  extra?: Record<string, string[]>;
}

interface SelfSubjectReview {
  status?: {
    userInfo?: Identity;
  };
}

export const accessHandler: Handler = async (ctx) => {
  const t = target(ctx);
  const namespace = queryString(ctx, 'namespace') ?? 'default';
  const warnings: string[] = [];

  let rules: ResourceRule[] = [];
  let incomplete = false;
  let rulesError: string | undefined;

  try {
    const review = await t.client.request<RulesReview>(
      '/apis/authorization.k8s.io/v1/selfsubjectrulesreviews',
      {
        method: 'POST',
        body: {
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SelfSubjectRulesReview',
          spec: { namespace },
        },
        timeoutMs: 20_000,
      },
    );
    rules = review.status?.resourceRules ?? [];
    incomplete = Boolean(review.status?.incomplete);
  } catch (error) {
    rulesError = (error as Error).message;
    warnings.push(`Could not evaluate permissions: ${rulesError}`);
  }

  let identity: Identity | null = null;
  try {
    const review = await t.client.request<SelfSubjectReview>(
      '/apis/authentication.k8s.io/v1/selfsubjectreviews',
      {
        method: 'POST',
        body: {
          apiVersion: 'authentication.k8s.io/v1',
          kind: 'SelfSubjectReview',
        },
        timeoutMs: 15_000,
      },
    );
    identity = review.status?.userInfo ?? null;
  } catch (error) {
    warnings.push(`Could not identify the current user: ${(error as Error).message}`);
  }

  const capabilities: Record<string, string[]> = {};
  for (const rule of rules) {
    const groups = rule.apiGroups?.length ? rule.apiGroups : [''];
    for (const group of groups) {
      for (const resource of rule.resources ?? []) {
        const key = `${group}/${resource}`;
        const set = new Set(capabilities[key] ?? []);
        for (const verb of rule.verbs ?? []) set.add(verb);
        capabilities[key] = [...set].sort();
      }
    }
  }

  const allVerbs = capabilities['*/*'] ?? [];

  return {
    body: {
      cluster: t.clusterId,
      namespace,
      identity,
      capabilities,
      allVerbs,
      rules,
      incomplete,
      error: rulesError ?? null,
      warnings,
    },
  };
};
