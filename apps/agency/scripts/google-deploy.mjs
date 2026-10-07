import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const project = "eco-azimuth-441108-s4";
const region = "asia-southeast1";
const service = "vidicy-agency";
const options = process.argv.slice(2);
if (options.some(option => option !== "--build-only")) {
  throw new Error("Supported deployment option: --build-only");
}
const imageTag = process.env.IMAGE_TAG ?? `manual-${new Date().toISOString().replace(/[^0-9]/g, "")}`;
if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(imageTag)) throw new Error("Invalid IMAGE_TAG");
const image = `${region}-docker.pkg.dev/${project}/vidicy/agency:${imageTag}`;

function runGcloud({ args, capture = false }) {
  const result = spawnSync("gcloud", args, {
    cwd: repositoryRoot,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    shell: false,
  });
  if (result.error) throw new Error(`Could not start gcloud: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return capture ? result.stdout.trim() : "";
}

// Building an image does not apply database migrations. Complete any required
// PostgreSQL migration before rolling out an incompatible application change.
runGcloud({ args: [
  "builds", "submit", ".",
  `--project=${project}`,
  `--region=${region}`,
  "--config=apps/agency/cloudbuild.yaml",
  "--gcs-source-staging-dir=gs://eco-azimuth-441108-s4-vidicy-build-source/source",
  `--substitutions=_IMAGE_TAG=${imageTag}`,
  "--quiet",
] });

const digest = runGcloud({ capture: true, args: [
  "artifacts", "docker", "images", "describe", image,
  `--project=${project}`,
  "--format=value(image_summary.digest)",
] });
if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("Artifact Registry did not return a valid image digest");
const immutableImage = `${region}-docker.pkg.dev/${project}/vidicy/agency@${digest}`;

if (!options.includes("--build-only")) {
  // Update only the image. Keep the configured service identity, SQL/network
  // attachments, environment variables, secrets, limits and access policy.
  runGcloud({ args: [
    "run", "services", "update", service,
    `--project=${project}`,
    `--region=${region}`,
    `--image=${immutableImage}`,
    "--quiet",
  ] });
}

console.info(`${options.includes("--build-only") ? "Built" : "Deployed"} ${immutableImage}`);
