import { Queue } from "bullmq";

import { episodeCompositionQueueName } from "@ai-manju/execution";
import { episodeExportRequestSchema, type EpisodeExportRequest } from "@ai-manju/domain";

/** Server-side producer only. The Worker owns private media and FFmpeg execution. */
export function createStudioEpisodeExportRuntime(redisUrl: string) {
  const queue = new Queue<EpisodeExportRequest>(episodeCompositionQueueName, {
    connection: { url: redisUrl, maxRetriesPerRequest: null },
    defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
  });
  return {
    async enqueue(request: EpisodeExportRequest) {
      const parsed = episodeExportRequestSchema.parse(request);
      await queue.add("compose", parsed, { jobId: `compose-${parsed.exportId}` });
    },
    close: async () => queue.close(),
  };
}
