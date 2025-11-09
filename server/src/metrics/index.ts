import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const metrics = {
  generationCost: new Counter({
    name: 'generation_cost_cents_total',
    help: 'Total cents reported by generation providers',
    labelNames: ['provider', 'policy'],
    registers: [register],
  }),
  generationProviderRequests: new Counter({
    name: 'gen_provider_requests_total',
    help: 'External generation provider calls grouped by provider/action/outcome',
    labelNames: ['provider', 'action', 'outcome'],
    registers: [register],
  }),
  generationRouteDecision: new Counter({
    name: 'gen_route_decision_total',
    help: 'Routing decisions grouped by policy and provider transitions',
    labelNames: ['policy', 'from', 'to'],
    registers: [register],
  }),
  generationFallback: new Counter({
    name: 'gen_fallback_total',
    help: 'Fallbacks between providers',
    labelNames: ['from', 'to', 'reason'],
    registers: [register],
  }),
};
