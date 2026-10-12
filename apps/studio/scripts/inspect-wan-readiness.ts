import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });

const requiredEnvironment = ["WAN_API_KEY", "WAN_WORKSPACE_ID", "WAN_REGION", "WAN_REFERENCE_MODEL"] as const;
for (const name of requiredEnvironment) {
  if (process.env[name] === undefined || process.env[name] === "") {
    throw new Error(`${name} is required`);
  }
}

const workspaceId = process.env.WAN_WORKSPACE_ID!;
const region = process.env.WAN_REGION!;
const model = process.env.WAN_REFERENCE_MODEL!;
const headers = {
  Authorization: `Bearer ${process.env.WAN_API_KEY!}`,
  "Content-Type": "application/json",
};
const baseUrl = `https://${workspaceId}.${region}.maas.aliyuncs.com/api/v1`;

type ReadinessResult = {
  endpoint: "models" | "permissions";
  status: number;
  ok: boolean;
  code: string | null;
  message: string | null;
  modelPresent: boolean;
  inferenceGranted: boolean;
};

async function inspect(endpoint: ReadinessResult["endpoint"]): Promise<ReadinessResult> {
  const response = await fetch(`${baseUrl}/${endpoint}?model=${encodeURIComponent(model)}`, { headers });
  const payload: unknown = await response.json().catch(() => ({}));
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const serialized = JSON.stringify(body);
  return {
    endpoint,
    status: response.status,
    ok: response.ok,
    code: typeof body.code === "string" ? body.code : null,
    message: typeof body.message === "string" ? body.message.slice(0, 200) : null,
    modelPresent: serialized.includes(model),
    inferenceGranted: serialized.includes('"inference":true'),
  };
}

async function main(): Promise<void> {
  const results = await Promise.all([inspect("models"), inspect("permissions")]);
  process.stdout.write(`${JSON.stringify({ model, region, results }, null, 2)}\n`);
}

void main();
