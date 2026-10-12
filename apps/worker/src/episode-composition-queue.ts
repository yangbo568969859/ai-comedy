import { Worker, type ConnectionOptions } from "bullmq";

import { episodeCompositionQueueName } from "@ai-manju/execution";
import { episodeExportRequestSchema, type EpisodeExportRequest } from "@ai-manju/domain";

import type { PrivateEpisodeComposer } from "./private-episode-composer.js";

export function createEpisodeCompositionWorker(
  connection: ConnectionOptions,
  composer: PrivateEpisodeComposer,
): Worker<EpisodeExportRequest> {
  return new Worker<EpisodeExportRequest>(
    episodeCompositionQueueName,
    async (job) => composer.compose(episodeExportRequestSchema.parse(job.data)),
    { connection, concurrency: 1 },
  );
}
