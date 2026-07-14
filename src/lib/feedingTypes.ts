export type FeedType = "breast" | "bottle" | "formula" | "solid";

export const FEED_TYPE_ICONS: Record<FeedType, string> = {
  bottle: "🍼",
  breast: "🤱",
  formula: "🧴",
  solid: "🥄",
};

export function feedTypeIcon(feedType: string) {
  return FEED_TYPE_ICONS[feedType as FeedType] ?? FEED_TYPE_ICONS.bottle;
}
