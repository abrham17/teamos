"use client";

import { Bot, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { CollapsibleThoughtBlock } from "@/components/chat/CollapsibleThoughtBlock";
import { QuestionCard } from "@/components/chat/QuestionCard";
import { AgentActivityFeed } from "@/components/chat/AgentActivityFeed";
import { PlanSummaryCard } from "./PlanSummaryCard";
import { ReasoningPanel } from "./ReasoningPanel";
import { PlanPreviewPanel } from "./PlanPreviewPanel";
import type { ChatMessage } from "./types";
import type { ReviewMutation, ReviewPlanPreview } from "@/components/chat/chatTypes";

interface ChatMessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  isReviewOpen: boolean;
  reviewMutations: ReviewMutation[];
  reviewPlanPreview: ReviewPlanPreview | null;
  onApproveReview: (approvedIndices?: string[]) => void;
  onRejectReview: () => void;
  onReviseReview: (feedback: string) => void;
  onSend: (text: string) => void;
  onOpenProject: (msg: ChatMessage) => void;
  PlanReviewPanel: React.ComponentType<{
    isOpen: boolean;
    onClose: () => void;
    mutations: ReviewMutation[];
    planPreview: ReviewPlanPreview | null;
    onApprove: (approvedIndices?: string[]) => void;
    onReject: () => void;
    onRevise: (feedback: string) => void;
    isProcessing: boolean;
  }>;
}

export function ChatMessageList({
  messages,
  loading,
  isReviewOpen,
  reviewMutations,
  reviewPlanPreview,
  onApproveReview,
  onRejectReview,
  onReviseReview,
  onSend,
  onOpenProject,
  PlanReviewPanel,
}: ChatMessageListProps) {
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
      {messages.map((msg) => (
        <div key={msg.id} className={cn("flex gap-3", msg.sender === "user" ? "flex-row-reverse" : "flex-row")}>
          <div className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
            msg.sender === "architect" ? "bg-[var(--accent-subtle)] border-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 border-white/5 text-[var(--text-muted)]"
          )}>
            {msg.sender === "architect" ? <Bot size={16} /> : <User size={16} />}
          </div>
          <div className="max-w-[85%]">
            {(msg.text || msg.isStreaming) && (
              <div className={cn(
                "p-3 rounded-2xl text-sm leading-relaxed border-none shadow-none",
                msg.sender === "user"
                  ? "bg-[var(--accent)] text-[var(--bg-950)] font-medium rounded-tr-none"
                  : "bg-[var(--surface-2)]/50 backdrop-blur-md border border-white/5 text-[var(--text-primary)] rounded-tl-none"
              )}>
                {msg.sender === "architect" ? (
                  <>
                    {msg.reasoningText && (
                      <CollapsibleThoughtBlock
                        thoughtText={msg.reasoningText}
                        isStreaming={!!msg.isStreaming}
                      />
                    )}
                    {msg.text ? (
                      <ChatMessageContent content={msg.text} streaming={!!msg.isStreaming} />
                    ) : (
                      <span className="flex items-center gap-2 text-[var(--text-muted)] py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                        <span className="text-[12px]">Architect is thinking…</span>
                      </span>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                )}
              </div>
            )}
            {msg.planningState && (
              <>
                {msg.planningState.activityFeed && msg.planningState.activityFeed.length > 0 && (
                  <AgentActivityFeed
                    entries={msg.planningState.activityFeed}
                    isRunning={!!msg.isStreaming}
                  />
                )}
                <PlanSummaryCard
                  state={msg.planningState}
                  loading={!!msg.isStreaming}
                  onOpenProject={() => onOpenProject(msg)}
                />
              </>
            )}

            {/* Inline Reasoning Panel - shown when reasoning data is available */}
            {msg.id === lastMessageId && msg.reasoningText && !msg.isStreaming && (
              <ReasoningPanel
                thoughtProcess={msg.reasoningText}
                isStreaming={false}
              />
            )}

            {msg.question && (
              <QuestionCard
                question={msg.question.question}
                options={msg.question.options}
                isProcessing={loading}
                onSelect={(answer) => onSend(answer)}
              />
            )}

            {/* Inline Plan Preview Panel - shown when plan is ready */}
            {msg.id === lastMessageId && reviewPlanPreview && !msg.isStreaming && (
              <PlanPreviewPanel
                plan={{
                  projectName: reviewPlanPreview.projectName,
                  description: reviewPlanPreview.description,
                  tasks: reviewPlanPreview.tasks,
                  milestones: reviewPlanPreview.milestones,
                  risk: msg.planningState?.planResult?.risk,
                  knowledgeGaps: msg.planningState?.planResult?.knowledgeGaps,
                  critiqueScore: msg.planningState?.planResult?.critiqueScore,
                  wikiPageUrl: msg.planningState?.planResult?.wikiPageUrl,
                }}
                onApprove={() => onApproveReview()}
                onReject={onRejectReview}
                onRevise={(feedback) => onReviseReview(feedback)}
                isProcessing={loading}
              />
            )}
          </div>

          {msg.id === lastMessageId && isReviewOpen && reviewMutations.length > 0 && (
            <div className="mt-3 max-w-full">
              <PlanReviewPanel
                isOpen={isReviewOpen}
                onClose={() => onRejectReview()}
                mutations={reviewMutations}
                planPreview={reviewPlanPreview}
                onApprove={onApproveReview}
                onReject={onRejectReview}
                onRevise={onReviseReview}
                isProcessing={loading}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
