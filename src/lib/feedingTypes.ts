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

export const FEED_TYPE_LABELS: Record<FeedType, string> = {
  bottle: "Bottle",
  breast: "Breast",
  formula: "Formula",
  solid: "Solid",
};

export function feedTypeLabel(feedType: string) {
  return FEED_TYPE_LABELS[feedType as FeedType] ?? feedType;
}
