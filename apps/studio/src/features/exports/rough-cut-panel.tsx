"use client";

import { Clapperboard, Play, RefreshCw } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import type { StudioEpisodeExportStatusDto } from "../studio/types";

type RoughCutPanelProps = {
  status: StudioEpisodeExportStatusDto | undefined;
  error?: string | undefined;
  isSubmitting: boolean;
  onSubmit: () => void;
  onRefresh: () => void;
};

const availability = {
  ready: { label: "可导出", variant: "success" as const },
  missing_output: { label: "缺少镜头", variant: "warning" as const },
  review_required: { label: "待审核", variant: "warning" as const },
};

export function RoughCutPanel({ status, error, isSubmitting, onSubmit, onRefresh }: RoughCutPanelProps) {
  const state = status === undefined ? null : availability[status.reason ?? "missing_output"];
  const detail = error ?? (status === undefined
    ? "正在检查本集镜头与人工审核记录。"
    : status.eligible
      ? `已确认 ${status.inputCount} 个镜头均满足导出条件。`
      : status.reason === "missing_output"
        ? "每个镜头需要至少一个成功入库的视频输出。"
        : "每个镜头都需内容、权利和 AI 标识三项审核通过。");
  return <Card className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <Clapperboard className="text-primary" size={17} />
        <div><p className="text-sm font-semibold">私有粗剪</p><p className="mt-1 text-xs text-muted-foreground">按镜头顺序合成，无音轨</p></div>
      </div>
      {state && <Badge variant={state.variant}>{state.label}</Badge>}
    </div>
    {status?.export && <video className="mt-4 aspect-[9/16] w-full rounded-md bg-surface-muted object-contain" controls preload="metadata" src={status.export.outputContentPath} />}
    <div className="mt-4 flex gap-2">
      <Button className="min-w-0 flex-1" disabled={!status?.eligible || isSubmitting || error !== undefined} onClick={onSubmit} variant="secondary">
        <Play size={15} />{isSubmitting ? "正在提交..." : "提交粗剪"}
      </Button>
      <Button aria-label="刷新粗剪状态" onClick={onRefresh} size="icon" variant="ghost"><RefreshCw size={15} /></Button>
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{detail}</p>
  </Card>;
}
