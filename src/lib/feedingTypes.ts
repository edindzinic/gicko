export type FeedType = "breast" | "bottle" | "formula" | "solid";

export const FEED_TYPE_ICONS: Record<FeedType, string> = {
  bottle: "🍼",
  breast: "🤱",
  formula: "🧴",
  solid: "🥄",
};

/**
 * The types offered when logging a feeding. Bottle and breast are retired but stay in
 * FeedType, so entries logged before the switch keep their own icon and label everywhere.
 */
export const LOGGABLE_FEED_TYPES: FeedType[] = ["formula", "solid"];

export const DEFAULT_FEED_TYPE: FeedType = "formula";

export function feedTypeIcon(feedType: string) {
  return FEED_TYPE_ICONS[feedType as FeedType] ?? FEED_TYPE_ICONS[DEFAULT_FEED_TYPE];
}
