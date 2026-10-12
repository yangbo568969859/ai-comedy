import type { ExecutionStatus } from "@ai-manju/domain";

import type { ReviewDecision } from "./types";

export type ReviewKey = "content" | "rights" | "labeling";
export type ReviewState = Record<ReviewKey, ReviewDecision>;

export const initialReviewState: ReviewState = {
  content: "needs_changes",
  rights: "needs_changes",
  labeling: "needs_changes",
};

export function runStatusLabel(status?: ExecutionStatus): string {
  const labels: Record<ExecutionStatus, string> = {
    draft: "草稿",
    queued: "排队中",
    submitting: "提交中",
    provider_queued: "供应商排队",
    running: "生成中",
    cancel_requested: "取消中",
    succeeded: "已完成",
    failed: "失败",
    canceled: "已取消",
  };

  return status ? labels[status] : "未生成";
}

export function reviewSummary(decisions: ReviewState): "pending" | "approved" | "rejected" {
  const values = Object.values(decisions);
  if (values.includes("rejected")) return "rejected";
  if (values.every((value) => value === "approved")) return "approved";
  return "pending";
}
