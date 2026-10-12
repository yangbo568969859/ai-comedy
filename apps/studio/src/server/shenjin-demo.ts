import { z } from "zod";

const assetIdSchema = z.string().uuid();

export const shenjinDemoAssetsSchema = z.object({
  characterAnchorAssetId: assetIdSchema,
  faceAnchorAssetId: assetIdSchema,
  styleReferenceAssetId: assetIdSchema,
}).strict().refine((assets) => new Set(Object.values(assets)).size === 3, {
  message: "Shenjin validation assets must use three distinct asset IDs.",
});
export type ShenjinDemoAssets = z.infer<typeof shenjinDemoAssetsSchema>;

/** Assets are local environment configuration, never committed into the plan. */
export function parseShenjinDemoAssets(environment: Record<string, string | undefined>): ShenjinDemoAssets {
  return shenjinDemoAssetsSchema.parse({
    characterAnchorAssetId: environment.SHENJIN_CHARACTER_ANCHOR_ASSET_ID,
    faceAnchorAssetId: environment.SHENJIN_FACE_ANCHOR_ASSET_ID,
    styleReferenceAssetId: environment.SHENJIN_STYLE_REFERENCE_ASSET_ID,
  });
}

export const shenjinDemoPlan = {
  title: "沈烬 · 月下初现",
  logline: "用于验证沈烬角色锚点、国风玄幻半写实风格与万相 2.7 短镜头控制的私有验收项目。",
  episodeTitle: "验收短章：月下初现",
  shots: [
    {
      title: "月下回眸",
      script: "月光穿过庭院薄雾，沈烬停步，缓缓抬眼看向镜头。",
      durationSec: 5,
      visualPrompt: "参考图片中的沈烬，国风玄幻半写实动漫质感，夜色庭院，冷月与薄雾，人物中近景，镜头缓慢向前推进。沈烬缓缓抬眼看向镜头，黑色长发与深色衣摆只有轻微自然摆动，保持面部五官、发型、服装纹样与参考图一致。单人画面，不出现文字、水印、第二角色、额外手臂或肢体变形。",
    },
    {
      title: "侧身转向",
      script: "沈烬由三分之二侧身，平稳转向正面，目光停留在远处。",
      durationSec: 4,
      visualPrompt: "参考图片中的沈烬，国风玄幻半写实动漫质感，延续同一月下庭院、冷色薄雾与服装细节。中近景固定机位，沈烬从三分之二侧身平稳转向正面，动作克制连贯，发丝和衣摆轻微随动作摆动。保持脸型、五官、发型、服装和画风一致。单人画面，不切镜，不出现文字、水印、第二角色或身体畸变。",
    },
    {
      title: "踏入月影",
      script: "沈烬向前踏出一步，衣摆掠过石阶上的月影。",
      durationSec: 4,
      visualPrompt: "参考图片中的沈烬，国风玄幻半写实动漫质感，月下庭院石阶与薄雾。全身中景，稳定的轻微跟随镜头，沈烬向前自然踏出一步，衣摆与长发产生克制的物理摆动，石阶月影保持稳定。保持角色面容、发型、服装纹样和场景风格一致。单人画面，不战斗，不使用武器，不出现文字、水印、第二角色或额外肢体。",
    },
  ],
} as const;
