// The ten services the company ran before it let coding agents in: written by
// people, one team per domain. factory/catalog.ts builds the whole catalogue
// on these (and keeps their names and traffic), so this is the file to swap
// for your own service registry's starting point.
//
// No positions here: where a service stands is the layout's job (plan.ts).

export type Domain = "edge" | "commerce" | "payments" | "platform";

export interface ServiceDef {
  name: string;
  domain: Domain;
  /** Normal traffic, requests per second. */
  baseRps: number;
  baseP99: number;
  replicas: number;
}

export const SERVICES: readonly ServiceDef[] = [
  { name: "web-frontend", domain: "edge", baseRps: 2400, baseP99: 120, replicas: 4 },
  { name: "api-gateway", domain: "edge", baseRps: 3100, baseP99: 45, replicas: 5 },
  { name: "auth", domain: "edge", baseRps: 900, baseP99: 22, replicas: 3 },
  { name: "catalog", domain: "commerce", baseRps: 1500, baseP99: 38, replicas: 3 },
  { name: "search", domain: "commerce", baseRps: 1100, baseP99: 70, replicas: 3 },
  { name: "orders", domain: "commerce", baseRps: 420, baseP99: 95, replicas: 3 },
  { name: "payments", domain: "payments", baseRps: 180, baseP99: 140, replicas: 3 },
  { name: "billing", domain: "payments", baseRps: 60, baseP99: 210, replicas: 2 },
  { name: "notifications", domain: "platform", baseRps: 310, baseP99: 30, replicas: 2 },
  { name: "analytics-worker", domain: "platform", baseRps: 800, baseP99: 600, replicas: 4 },
];
