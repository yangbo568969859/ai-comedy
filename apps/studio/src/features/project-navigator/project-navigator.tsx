"use client";

import { ChevronDown, ChevronRight, Clapperboard, FolderPlus, MoreHorizontal } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Tooltip } from "../../components/ui/tooltip";
import type { StudioEpisodeDto, StudioProjectDto, StudioShotDto } from "../studio/types";

type ProjectNavigatorProps = {
  project: StudioProjectDto;
  activeEpisodeId: string;
  activeShotId: string;
  onSelectShot: (episode: StudioEpisodeDto, shot: StudioShotDto) => void;
};

function planBadgeVariant(status: StudioShotDto["planStatus"]): "neutral" | "success" | "warning" {
  if (status === "ready") return "success";
  if (status === "review") return "warning";
  return "neutral";
}

export function ProjectNavigator({ project, activeEpisodeId, activeShotId, onSelectShot }: ProjectNavigatorProps) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col" aria-label="项目与镜头">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Clapperboard size={17} /></span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">项目素材库</p><p className="truncate text-xs text-muted-foreground">制作工作台</p></div>
        </div>
        <Tooltip content="新建项目">
          <Button aria-label="新建项目" size="icon" variant="ghost"><FolderPlus size={17} /></Button>
        </Tooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
        <div className="mb-4 flex items-center justify-between gap-2 px-1"><div className="min-w-0"><p className="truncate text-sm font-semibold">{project.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{project.label}</p></div><Badge variant="info">2 集</Badge></div>
        <nav className="space-y-3">
          {project.episodes.map((episode) => {
            const isActiveEpisode = episode.id === activeEpisodeId;
            return <section key={episode.id}>
              <div className="flex h-8 items-center gap-1 px-1 text-xs font-semibold text-muted-foreground">
                {isActiveEpisode ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>{episode.code} · {episode.title}</span><span className="ml-auto">{episode.shots.length}</span>
              </div>
              {isActiveEpisode && <div className="space-y-1">
                {episode.shots.map((shot) => {
                  const selected = shot.id === activeShotId;
                  return <button className={`group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${selected ? "bg-surface-selected" : "hover:bg-surface-muted"}`} key={shot.id} onClick={() => onSelectShot(episode, shot)} type="button">
                    <span className="grid size-8 shrink-0 place-items-center rounded bg-surface-muted text-[11px] font-semibold text-muted-foreground">{shot.code.split("-")[1]}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{shot.title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{shot.location}</span></span>
                    <Badge className="px-1.5 py-0 text-[10px]" variant={planBadgeVariant(shot.planStatus)}>{shot.planStatus === "ready" ? "就绪" : shot.planStatus === "review" ? "待审" : "草稿"}</Badge>
                  </button>;
                })}
              </div>}
            </section>;
          })}
        </nav>
      </div>
      <div className="border-t border-border px-3 py-3"><Button className="w-full justify-between" variant="ghost"><span>项目设置</span><MoreHorizontal size={16} /></Button></div>
    </aside>
  );
}
