"use client";

import { Check, FileImage, FileVideo, LoaderCircle, Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import type { ReferenceAssetRole, StudioAssetDto } from "../studio/types";
import {
  defaultReferenceAssetRole,
  referenceAssetRoleItems,
  referenceAssetRoleLabel,
} from "./reference-asset-roles";

export const maximumReferenceAssetBytes = 25 * 1024 * 1024;

const supportedReferenceAssetTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
  "video/mp4", "video/webm", "video/quicktime",
]);

type ReferenceAssetsPanelProps = {
  assets: StudioAssetDto[];
  selectedAssetIds: readonly string[];
  onSelectionChange: (assetIds: string[]) => void;
  onUpload: (input: ReferenceAssetUploadIntent) => Promise<void>;
};

export type ReferenceAssetUploadIntent = {
  file: File;
  role: ReferenceAssetRole;
};

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "success"; fileName: string; role: ReferenceAssetRole }
  | { kind: "error"; message: string };

export function validateReferenceAssetFile(file: Pick<File, "type" | "size">): string | undefined {
  if (!supportedReferenceAssetTypes.has(file.type.toLowerCase())) {
    return "仅支持 JPEG、PNG、WebP、GIF、AVIF、MP4、WebM 或 MOV 文件。";
  }
  if (file.size === 0) return "请选择非空文件。";
  if (file.size > maximumReferenceAssetBytes) return "单个参考资产不能超过 25 MB。";
  return undefined;
}

export function ReferenceAssetsPanel({ assets, selectedAssetIds, onSelectionChange, onUpload }: ReferenceAssetsPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" });
  const [selectedRole, setSelectedRole] = useState<ReferenceAssetRole>(defaultReferenceAssetRole);
  const isUploading = uploadState.kind === "uploading";

  function toggleAsset(assetId: string) {
    if (selectedAssetIds.includes(assetId)) {
      onSelectionChange(selectedAssetIds.filter((candidate) => candidate !== assetId));
      return;
    }
    if (selectedAssetIds.length < 5) onSelectionChange([...selectedAssetIds, assetId]);
  }

  async function handleFile(file: File) {
    const validationError = validateReferenceAssetFile(file);
    if (validationError !== undefined) {
      setUploadState({ kind: "error", message: validationError });
      return;
    }

    setUploadState({ kind: "uploading", fileName: file.name });
    try {
      await onUpload({ file, role: selectedRole });
      setUploadState({ kind: "success", fileName: file.name, role: selectedRole });
    } catch (error) {
      setUploadState({
        kind: "error",
        message: error instanceof Error ? error.message : "参考资产上传失败，请稍后重试。",
      });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">参考资产</p>
          <p className="mt-1 text-xs text-muted-foreground">选择 1 至 5 项作为本次输入</p>
        </div>
        <Badge variant="neutral">{selectedAssetIds.length}/5</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {assets.map((asset) => (
          <button aria-pressed={selectedAssetIds.includes(asset.id)} className="min-w-0 rounded-md border border-border bg-surface p-2 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring aria-pressed:border-primary aria-pressed:bg-info-surface disabled:cursor-not-allowed disabled:opacity-60" disabled={!selectedAssetIds.includes(asset.id) && selectedAssetIds.length >= 5} key={asset.id} onClick={() => toggleAsset(asset.id)} type="button">
            <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded bg-surface-muted text-muted-foreground">
              {asset.previewKind === "image" ? (
                <img alt={asset.label} className="h-full w-full object-cover" loading="lazy" src={`/api/studio/assets/${asset.id}/content`} />
              ) : <FileVideo size={20} />}
              {selectedAssetIds.includes(asset.id) && <Check className="absolute right-1 top-1 text-success" size={14} />}
            </div>
            <span className="mt-2 block truncate text-xs font-medium">{asset.label}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">{referenceAssetRoleLabel(asset.role)}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2">
        <Select
          ariaLabel="新参考资产角色"
          disabled={isUploading}
          items={referenceAssetRoleItems}
          onValueChange={(value) => setSelectedRole(value as ReferenceAssetRole)}
          value={selectedRole}
        />
        <Button className="w-full" disabled={isUploading} onClick={() => fileInput.current?.click()} variant="secondary">
          {isUploading ? <LoaderCircle className="animate-spin" size={15} /> : <Upload size={15} />}
          {isUploading ? "正在上传" : "添加参考资产"}
        </Button>
      </div>
      <input
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
        aria-label="选择参考资产"
        className="sr-only"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
        ref={fileInput}
        type="file"
      />

      {uploadState.kind === "uploading" && <p className="mt-3 text-xs leading-5 text-muted-foreground" role="status">正在私密上传 {uploadState.fileName}。</p>}
      {uploadState.kind === "success" && <p className="mt-3 text-xs leading-5 text-success" role="status">{uploadState.fileName} 上传完成，已保存为{referenceAssetRoleLabel(uploadState.role)}。</p>}
      {uploadState.kind === "error" && <p className="mt-3 text-xs leading-5 text-danger" role="alert">{uploadState.message}</p>}
      <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Plus className="mt-0.5 shrink-0" size={14} />
        支持单个 25 MB 以内的图片或视频；上传后由服务端校验、私密保存，并记录所选角色。
      </div>
    </Card>
  );
}
