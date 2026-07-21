import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("new", "routes/create.tsx"),
  route("runs/:runId/plan", "routes/plan.tsx"),
  route("runs/:runId/progress", "routes/progress.tsx"),
  route("runs/:runId/atlas", "routes/atlas.tsx"),
] satisfies RouteConfig;
