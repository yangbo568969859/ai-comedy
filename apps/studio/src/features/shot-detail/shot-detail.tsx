"use client";

import { Expand, Play, Sparkles } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Tabs } from "../../components/ui/tabs";
import { Tooltip } from "../../components/ui/tooltip";
import type { StudioGenerationRunDto, StudioShotDto } from "../studio/types";

type ShotDetailProps = {
  shot: StudioShotDto;
  generationRun: StudioGenerationRunDto | null | undefined;
  activeTab: string;
  onTabChange: (value: string) => void;
};

export function ShotDetail({ shot, generationRun, activeTab, onTabChange }: ShotDetailProps) {
  return (
    <main className="min-w-0 flex-1 bg-background px-4 py-5 sm:px-6 lg:px-8 xl:min-h-0 xl:overflow-y-auto">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>雨夜便利店</span><span>/</span><span>EP01</span><span>/</span><span className="font-medium text-foreground">{shot.code}</span><Badge variant="info">Mock 数据</Badge></div>
        <div className="mt-4 flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold sm:text-2xl">{shot.code} · {shot.title}</h1><Badge variant="neutral">{shot.version}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{shot.location} · {shot.durationSec} 秒 · {shot.aspectRatio} · {shot.resolution}</p></div><Tooltip content="更多镜头操作"><Button aria-label="更多镜头操作" size="icon" variant="ghost"><Expand size={18} /></Button></Tooltip></div>

        <Card className="mt-6 overflow-hidden">
          {generationRun?.outputContentPath ? <video className="aspect-[9/16] max-h-[620px] w-full bg-foreground object-contain sm:mx-auto sm:w-[min(100%,390px)] xl:w-[min(100%,320px)]" controls preload="metadata" src={generationRun.outputContentPath} /> : <div className="mock-shot-preview relative aspect-[9/14] max-h-[620px] min-h-96 w-full overflow-hidden sm:mx-auto sm:w-[min(100%,390px)] xl:min-h-0 xl:w-[min(100%,320px)]">
            <div className="mock-shot-store" />
            <div className="mock-shot-figure"><span /></div>
            <div className="mock-shot-ground" />
            <div className="mock-shot-sky" />
            <div className="absolute left-3 top-3"><Badge variant="neutral">演示预览</Badge></div>
            <Button aria-label="播放镜头预览" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" size="icon"><Play fill="currentColor" size={17} /></Button>
            <span className="absolute bottom-3 left-3 rounded bg-foreground/80 px-2 py-1 text-xs text-primary-foreground">00:00 / 00:0{shot.durationSec}</span>
          </div>}
        </Card>

        <section className="mt-6"><Tabs value={activeTab} onValueChange={onTabChange} items={[
          { value: "brief", label: "镜头说明", content: <div className="space-y-4"><Card className="p-4"><p className="text-xs font-medium text-muted-foreground">剧本</p><p className="mt-2 text-sm leading-6">{shot.script}</p></Card><Card className="p-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Sparkles size={14} />视觉提示词</div><p className="mt-2 text-sm leading-6">{shot.visualPrompt}</p></Card></div> },
          { value: "prompt", label: "生成参数", content: <Card className="p-4"><dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><div><dt className="text-xs text-muted-foreground">画幅</dt><dd className="mt-1 font-medium">{shot.aspectRatio}</dd></div><div><dt className="text-xs text-muted-foreground">时长</dt><dd className="mt-1 font-medium">{shot.durationSec} 秒</dd></div><div><dt className="text-xs text-muted-foreground">分辨率</dt><dd className="mt-1 font-medium">{shot.resolution}</dd></div><div><dt className="text-xs text-muted-foreground">提示词版本</dt><dd className="mt-1 font-medium">{shot.version}</dd></div></dl></Card> },
          { value: "events", label: "执行记录", content: <Card className="p-4">{generationRun === null || generationRun === undefined ? <p className="text-sm text-muted-foreground">当前镜头还没有生成记录。</p> : <ol className="space-y-3">{generationRun.events.map((event) => <li className="flex items-start justify-between gap-3 text-xs" key={event.sequence}><span><span className="font-medium">{event.from} → {event.to}</span>{event.reasonCode && <span className="ml-2 text-danger">{event.reasonCode}</span>}</span><time className="shrink-0 text-muted-foreground">{new Date(event.occurredAt).toLocaleString("zh-CN")}</time></li>)}</ol>}</Card> },
        ]} /></section>
      </div>
    </main>
  );
}
