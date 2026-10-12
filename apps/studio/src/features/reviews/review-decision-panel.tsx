"use client";

import { ShieldCheck } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import type { ReviewKey, ReviewState } from "../studio/studio-state";
import { reviewSummary } from "../studio/studio-state";
import type { ReviewDecision, StudioReviewDto } from "../studio/types";

type ReviewPanelProps = { decisions: ReviewState; disabled: boolean; isRecording: boolean; review: StudioReviewDto | null | undefined; onDecisionChange: (key: ReviewKey, decision: ReviewDecision) => void; onRecord: () => void };
const decisionItems = [{ value: "needs_changes", label: "待修改" }, { value: "approved", label: "通过" }, { value: "rejected", label: "拒绝" }] as const;
const rows: Array<{ key: ReviewKey; label: string; description: string }> = [{ key: "content", label: "内容审核", description: "画面、人物与叙事一致性" }, { key: "rights", label: "权利审核", description: "素材授权与可用范围" }, { key: "labeling", label: "AI 标识", description: "导出标识与追溯信息" }];

export function ReviewPanel({ decisions, disabled, isRecording, review, onDecisionChange, onRecord }: ReviewPanelProps) {
  const summary = reviewSummary(decisions);
  const badge = summary === "approved" ? { variant: "success" as const, label: "审核通过" } : summary === "rejected" ? { variant: "danger" as const, label: "已拦截" } : { variant: "warning" as const, label: "待决策" };
  const reviewDetail = review === undefined ? "正在读取最近审核记录。" : review === null ? "本次决定会新增不可覆盖的审核证据。" : `最近审核：${review.decidedBy} · ${new Date(review.decidedAt).toLocaleString("zh-CN")}`;
  return <Card className="p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="text-primary" size={17} /><div><p className="text-sm font-semibold">人工审核</p><p className="mt-1 text-xs text-muted-foreground">三项均通过才可进入发布候选</p></div></div><Badge variant={badge.variant}>{badge.label}</Badge></div><div className="mt-4 divide-y divide-border border-y border-border">{rows.map((row) => <div className="flex items-center justify-between gap-3 py-3" key={row.key}><div className="min-w-0"><p className="text-xs font-medium">{row.label}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.description}</p></div><Select ariaLabel={`${row.label}决定`} disabled={disabled || isRecording} items={decisionItems} onValueChange={(value) => onDecisionChange(row.key, value as ReviewDecision)} value={decisions[row.key]} /></div>)}</div><Button className="mt-4 w-full" disabled={disabled || isRecording} onClick={onRecord} variant="secondary">{isRecording ? "正在记录..." : "记录审核决定"}</Button><p className="mt-3 text-xs leading-5 text-muted-foreground">{disabled ? "请等待生成视频入库后再审核。" : reviewDetail}</p></Card>;
}
