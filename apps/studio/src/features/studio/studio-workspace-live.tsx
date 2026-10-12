"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Database, Menu, PanelRightClose, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Tooltip } from "../../components/ui/tooltip";
import { ReferenceAssetsPanel, type ReferenceAssetUploadIntent } from "../assets/reference-assets-panel";
import { RoughCutPanel } from "../exports/rough-cut-panel";
import { GenerationPanel } from "../generation/generation-panel";
import { ProjectNavigator } from "../project-navigator/project-navigator";
import { ReviewPanel } from "../reviews/review-decision-panel";
import { ShotDetail } from "../shot-detail/shot-detail";
import { loadStudioEpisodeExport, loadStudioGenerationRun, loadStudioReview, recordStudioReview, studioProjectQueryOptions, studioQueryKeys, submitStudioEpisodeExport, submitStudioGenerationRun, uploadStudioShotAsset } from "./studio-api";
import { initialReviewState, type ReviewKey } from "./studio-state";
import type { ReviewDecision, StudioEpisodeDto, StudioShotDto } from "./types";

export function StudioWorkspaceLive() {
  const queryClient = useQueryClient();
  const projectQuery = useQuery(studioProjectQueryOptions);
  const [episodeId, setEpisodeId] = useState<string>();
  const [shotId, setShotId] = useState<string>();
  const [reviewDecisions, setReviewDecisions] = useState(initialReviewState);
  const [notice, setNotice] = useState<string>();
  const [activeTab, setActiveTab] = useState("brief");
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[]>([]);

  const project = projectQuery.data;
  const episode = useMemo(
    () => project?.episodes.find((item) => item.id === episodeId) ?? project?.episodes[0],
    [episodeId, project],
  );
  const shot = useMemo(
    () => episode?.shots.find((item) => item.id === shotId) ?? episode?.shots[0],
    [episode, shotId],
  );
  const generationRunQuery = useQuery({
    queryKey: studioQueryKeys.generationRun(shot?.id ?? "unselected"),
    queryFn: ({ signal }) => loadStudioGenerationRun(shot!.id, signal),
    enabled: shot !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "submitting" || status === "provider_queued" || status === "running" || status === "cancel_requested" ? 5_000 : false;
    },
  });
  const outputAssetId = generationRunQuery.data?.outputAssetId;
  const reviewQuery = useQuery({
    queryKey: studioQueryKeys.review(generationRunQuery.data?.runId ?? "unselected", outputAssetId ?? "unselected"),
    queryFn: ({ signal }) => loadStudioReview(generationRunQuery.data!.runId, outputAssetId!, signal),
    enabled: generationRunQuery.data?.status === "succeeded" && outputAssetId !== undefined,
  });
  const episodeExportQuery = useQuery({
    queryKey: studioQueryKeys.episodeExport(episode?.id ?? "unselected"),
    queryFn: ({ signal }) => loadStudioEpisodeExport(episode!.id, signal),
    enabled: episode !== undefined,
  });

  useEffect(() => {
    if (project === undefined || project === null) return;
    const selectedEpisode = project.episodes.find((item) => item.id === episodeId) ?? project.episodes[0];
    const selectedShot = selectedEpisode?.shots.find((item) => item.id === shotId) ?? selectedEpisode?.shots[0];
    setEpisodeId(selectedEpisode?.id);
    setShotId(selectedShot?.id);
  }, [episodeId, project, shotId]);

  useEffect(() => {
    if (shot === undefined) return;
    setReviewDecisions(initialReviewState);
    setNotice(undefined);
    setActiveTab("brief");
    setSelectedReferenceAssetIds(shot.referenceAssets.slice(0, 5).map((asset) => asset.id));
  }, [shot?.id]);

  useEffect(() => {
    if (reviewQuery.data === undefined || reviewQuery.data === null) return;
    setReviewDecisions({ content: reviewQuery.data.content, rights: reviewQuery.data.rights, labeling: reviewQuery.data.labeling });
  }, [reviewQuery.data]);

  const uploadAssetMutation = useMutation({
    mutationFn: ({ currentShotId, file, role }: { currentShotId: string; file: File; role: ReferenceAssetUploadIntent["role"] }) => uploadStudioShotAsset(currentShotId, file, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: studioQueryKeys.project() });
    },
  });
  const submitGenerationMutation = useMutation({
    mutationFn: ({ currentShotId, idempotencyKey, referenceAssetIds }: { currentShotId: string; idempotencyKey: string; referenceAssetIds: string[] }) => submitStudioGenerationRun(currentShotId, idempotencyKey, referenceAssetIds),
    onSuccess: (run, variables) => {
      queryClient.setQueryData(studioQueryKeys.generationRun(variables.currentShotId), run);
      setNotice("Wan 生成任务已进入队列，页面会自动刷新运行状态。");
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "生成任务提交失败。"),
  });
  const recordReviewMutation = useMutation({
    mutationFn: () => recordStudioReview(generationRunQuery.data!.runId, generationRunQuery.data!.outputAssetId!, reviewDecisions),
    onSuccess: (review) => {
      queryClient.setQueryData(studioQueryKeys.review(review.sourceRunId, review.assetId), review);
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.episodeExport(episode!.id) });
      setNotice(review.status === "approved" ? "审核证据已记录。该视频成为发布候选，仍需通过后续导出流程。" : "审核证据已记录，当前视频尚不可发布。");
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "审核记录写入失败。"),
  });
  const submitEpisodeExportMutation = useMutation({
    mutationFn: () => submitStudioEpisodeExport(episode!.id),
    onSuccess: () => {
      setNotice("私有粗剪已交给 Worker。可继续编辑；完成后刷新本面板查看视频。");
      void queryClient.invalidateQueries({ queryKey: studioQueryKeys.episodeExport(episode!.id) });
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "粗剪提交失败。"),
  });

  if (projectQuery.isLoading) {
    return <WorkspaceMessage detail="正在从 PostgreSQL 加载项目与镜头计划。" icon={<RefreshCw className="animate-spin" size={20} />} title="正在读取工作台" />;
  }
  if (projectQuery.isError) {
    const detail = projectQuery.error instanceof Error ? projectQuery.error.message : "无法读取工作台数据。";
    return <WorkspaceMessage action={<Button onClick={() => void projectQuery.refetch()} variant="secondary"><RefreshCw size={15} />重试</Button>} detail={detail} icon={<Database size={20} />} title="工作台数据不可用" />;
  }
  if (project === null) {
    return <WorkspaceMessage action={<Button onClick={() => void projectQuery.refetch()} variant="secondary">刷新</Button>} detail="请先通过开发种子命令或后续项目创建 API 建立剧集计划。" icon={<Database size={20} />} title="还没有项目" />;
  }
  if (project === undefined || episode === undefined || shot === undefined) {
    return <WorkspaceMessage detail="项目中没有可展示的镜头。" icon={<Database size={20} />} title="工作台数据不可用" />;
  }

  function selectShot(nextEpisode: StudioEpisodeDto, nextShot: StudioShotDto) {
    setEpisodeId(nextEpisode.id);
    setShotId(nextShot.id);
  }

  function submitWanRun() {
    submitGenerationMutation.mutate({ currentShotId: shot!.id, idempotencyKey: crypto.randomUUID(), referenceAssetIds: selectedReferenceAssetIds });
  }

  async function uploadShotAsset(currentShotId: string, input: ReferenceAssetUploadIntent) {
    await uploadAssetMutation.mutateAsync({ currentShotId, file: input.file, role: input.role });
    setNotice("参考资产已保存，列表已在后台更新。");
  }

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Sparkles size={17} /></span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">AI 漫剧工作台</p><p className="hidden text-xs text-muted-foreground sm:block">内部制作环境</p></div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip content="刷新项目">
            <Button aria-label="刷新项目" onClick={() => void projectQuery.refetch()} size="icon" variant="ghost"><RefreshCw className={projectQuery.isFetching ? "animate-spin" : undefined} size={17} /></Button>
          </Tooltip>
          <Tooltip content="通知"><Button aria-label="通知" size="icon" variant="ghost"><Bell size={17} /></Button></Tooltip>
          <Tooltip content="收起检查器"><Button aria-label="收起检查器" size="icon" variant="ghost"><PanelRightClose size={17} /></Button></Tooltip>
          <Button aria-label="当前用户" className="ml-1 rounded-full text-xs" size="icon" variant="secondary">YU</Button>
        </div>
      </header>
      <div className="min-h-0 flex flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
        <ProjectNavigator activeEpisodeId={episode.id} activeShotId={shot.id} onSelectShot={selectShot} project={project} />
        <ShotDetail activeTab={activeTab} generationRun={generationRunQuery.data} onTabChange={setActiveTab} shot={shot} />
        <aside className="w-full shrink-0 border-t border-border bg-surface p-4 xl:min-h-0 xl:w-80 xl:overflow-y-auto xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold">镜头检查器</p><p className="mt-1 text-xs text-muted-foreground">{episode.code} · {shot.code}</p></div><Button aria-label="检查器菜单" size="icon" variant="ghost"><Menu size={17} /></Button></div>
          <div className="space-y-4">
            <GenerationPanel canSubmit={selectedReferenceAssetIds.length > 0 && !generationRunQuery.isLoading} isSubmitting={submitGenerationMutation.isPending} onSubmit={submitWanRun} run={generationRunQuery.data} selectedReferenceCount={selectedReferenceAssetIds.length} shotDurationSec={shot.durationSec} />
            <ReferenceAssetsPanel assets={shot.referenceAssets} onSelectionChange={setSelectedReferenceAssetIds} onUpload={(input) => uploadShotAsset(shot.id, input)} selectedAssetIds={selectedReferenceAssetIds} />
            <ReviewPanel decisions={reviewDecisions} disabled={generationRunQuery.data?.status !== "succeeded" || outputAssetId === undefined || reviewQuery.isLoading} isRecording={recordReviewMutation.isPending} review={reviewQuery.data} onDecisionChange={(key: ReviewKey, decision: ReviewDecision) => setReviewDecisions((current) => ({ ...current, [key]: decision }))} onRecord={() => recordReviewMutation.mutate()} />
            <RoughCutPanel error={episodeExportQuery.isError ? "粗剪状态读取失败，可刷新后重试。" : undefined} isSubmitting={submitEpisodeExportMutation.isPending} onRefresh={() => void episodeExportQuery.refetch()} onSubmit={() => submitEpisodeExportMutation.mutate()} status={episodeExportQuery.data} />
          </div>
          {notice && <p className="mt-4 rounded-md border border-info bg-info-surface px-3 py-2 text-xs leading-5 text-info" role="status">{notice}</p>}
        </aside>
      </div>
      <div className="border-t border-border bg-surface px-4 py-2 text-xs text-muted-foreground">项目和镜头计划来自 PostgreSQL；上传、生成输出与审核证据均为私有记录。</div>
    </div>
  );
}

function WorkspaceMessage({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-background p-4"><Card className="w-full max-w-md p-6 text-center"><span className="mx-auto grid size-10 place-items-center rounded-full bg-info-surface text-info">{icon}</span><h1 className="mt-4 text-lg font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>{action && <div className="mt-5">{action}</div>}</Card></main>;
}
