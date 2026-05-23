/** Bundled IconScout-style assets under /public/iconscout (see ATTRIBUTION.md). */
export const ICONSCOUT = {
  lottie: {
    loadingIngest: "/iconscout/lottie/loading-ingest.json",
    aiToolPending: "/iconscout/lottie/ai-tool-pending.json",
    successGeneric: "/iconscout/lottie/success-generic.json",
  },
  illustrations: {
    emptyChat: "/iconscout/illustrations/empty-chat.svg",
    emptyWiki: "/iconscout/illustrations/empty-wiki.svg",
    emptyPlanner: "/iconscout/illustrations/empty-planner.svg",
    emptyGraph: "/iconscout/illustrations/empty-graph.svg",
    emptyIngest: "/iconscout/illustrations/empty-ingest.svg",
    onboardingWelcome: "/iconscout/illustrations/onboarding-welcome.svg",
    heroTeamwork: "/iconscout/marketing/hero-teamwork.svg",
  },
} as const;

export type IconscoutIllustrationKey = keyof typeof ICONSCOUT.illustrations;
