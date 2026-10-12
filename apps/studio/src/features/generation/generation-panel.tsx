"use client";

import { Check, LoaderCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { runStatusLabel } from "../studio/studio-state";
import type { StudioGenerationRunDto } from "../studio/types";

type GenerationPanelProps = {
  run: StudioGenerationRunDto | null | undefined;
  shotDurationSec: number;
  selectedReferenceCount: number;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
};

function statusVariant(status: StudioGenerationRunDto["status"] | undefined): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "canceled") return "danger";
  if (status === "running" || status === "queued" || status === "submitting" || status === "provider_queued" || status === "cancel_requested") return "warning";
  return "neutral";
}

function formatCny(minorUnits: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(minorUnits / 100);
}

export function GenerationPanel({ run, shotDurationSec, selectedReferenceCount, canSubmit, isSubmitting, onSubmit }: GenerationPanelProps) {
  const [chargeConfirmed, setChargeConfirmed] = useState(false);
  const status = run?.status;
  const processing = status === "queued" || status === "submitting" || status === "provider_queued" || status === "running" || status === "cancel_requested";
  const estimatedCost = run?.estimatedCostMinorUnits ?? shotDurationSec * 60;

  useEffect(() => setChargeConfirmed(false), [run?.runId]);

  return <Card className="p-4">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">生成任务</p><p className="mt-1 text-xs text-muted-foreground">当前镜头 · 人工确认提交</p></div><Badge variant={statusVariant(status)}>{runStatusLabel(status)}</Badge></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3 text-xs">
      <div><dt className="text-muted-foreground">供应商</dt><dd className="mt-1 font-medium">阿里云百炼</dd></div>
      <div><dt className="text-muted-foreground">模型</dt><dd className="mt-1 truncate font-medium" title={run?.providerModel ?? "wan2.7-r2v-2026-06-12"}>{run?.providerModel ?? "wan2.7-r2v-2026-06-12"}</dd></div>
      <div><dt className="text-muted-foreground">规格</dt><dd className="mt-1 font-medium">720P · {shotDurationSec} 秒</dd></div>
      <div><dt className="text-muted-foreground">预估原价</dt><dd className="mt-1 font-medium">{formatCny(estimatedCost)}</dd></div>
    </dl>
    {!processing && <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input checked={chargeConfirmed} className="mt-0.5 size-4 accent-primary" onChange={(event) => setChargeConfirmed(event.target.checked)} type="checkbox" /><span>我确认本次调用可能产生费用，价格按百炼实际账单结算。</span></label>}
    <Button className="mt-4 w-full" disabled={!canSubmit || !chargeConfirmed || processing || isSubmitting} onClick={onSubmit}>{processing || isSubmitting ? <LoaderCircle className="animate-spin" size={15} /> : status === "succeeded" ? <Check size={15} /> : <Send size={15} />}{processing || isSubmitting ? "任务处理中" : status === "succeeded" ? "重新生成候选" : "提交 Wan 生成"}</Button>
    {selectedReferenceCount === 0 && <p className="mt-2 text-xs text-warning">请先选择至少一项参考资产。</p>}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">北京区 720P 当前公开原价为 0.6 元/秒；失败任务不计费。输出只会进入私有候选资产，仍需三项人工审核。</p>
  </Card>;
}
