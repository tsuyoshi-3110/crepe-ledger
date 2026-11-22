/*
 * レシートの費目。原価（売り物になる材料と包装）と販管費に分ける。
 * 人件費・販売手数料・固定費はレシートではなく、それぞれの入力から数える。
 */

/** 原価に入れる費目 */
export const COST_CATEGORIES = ["材料費", "包装資材費"] as const;

/** 販管費に入れる費目 */
export const SGA_CATEGORIES = ["消耗品費", "水道光熱費", "通信費", "広告宣伝費", "修繕費", "雑費"] as const;

export const ALL_CATEGORIES: readonly string[] = [...COST_CATEGORIES, ...SGA_CATEGORIES];

/** 新しく入れるときの既定。スーパーの食材がいちばん多いので材料費 */
export const DEFAULT_CATEGORY = "材料費";

export function isCostCategory(category: string): boolean {
  return (COST_CATEGORIES as readonly string[]).includes(category);
}
