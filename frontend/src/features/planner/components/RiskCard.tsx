import { Shield, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyRiskResolutionActions,
  generateRiskResolutionProposal,
  getProjectRisk,
} from "../api";
import type { PlanRisk, RiskAction } from "../types";
import { useToast } from "@/components/ui/Toast";

interface RiskCardProps {
  teamId: string;
  projectId: string;
  refreshKey?: string;
  onResolved?: () => void;
}

export function RiskCard({ teamId, projectId, refreshKey, onResolved }: RiskCardProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [risk, setRisk] = useState<PlanRisk | null>(null);
  const [proposal, setProposal] = useState<RiskAction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadRisk = () => {
    setLoading(true);
    setErrorMsg(null);
    getProjectRisk(teamId, projectId)
      .then(setRisk)
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : "Risk assessment unavailable."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRisk();
  }, [teamId, projectId, refreshKey]);

  const handleResolveRisk = async () => {
    setResolving(true);
    try {
      const proposalResponse = await generateRiskResolutionProposal(teamId, projectId);
      setProposal(proposalResponse.actions);
      if (proposalResponse.actions.length === 0) {
        toastSuccess("No actionable risk fixes were proposed.");
        return;
      }
      const result = await applyRiskResolutionActions(teamId, projectId, proposalResponse.actions);
      toastSuccess(
        `Applied ${result.applied_count} risk fixes (${result.skipped_count} skipped). Remaining risk score: ${result.remaining_risk_score}.`,
      );
      onResolved?.();
      loadRisk();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Risk resolution failed.");
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-6 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger-bg)]">
        <p className="text-xs text-[var(--danger)] mb-3">{errorMsg}</p>
        <button
          onClick={loadRisk}
          className="text-[10px] font-bold uppercase tracking-widest bg-[var(--surface-1)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!risk) return null;

  const riskColor = (score: number) => {
    if (score <= 30) return "text-[var(--success)]";
    if (score <= 60) return "text-[var(--warning)]";
    return "text-[var(--danger)]";
  };

  const riskBg = (score: number) => {
    if (score <= 30) return "bg-[var(--success-bg)]";
    if (score <= 60) return "bg-[var(--warning)]/10";
    return "bg-[var(--danger-bg)]";
  };

  return (
    <div className={`p-6 rounded-2xl border ${riskBg(risk.score)} border-[var(--border-subtle)]`}>
      <div className="flex items-center gap-2 mb-3">
        <Shield className={`w-5 h-5 ${riskColor(risk.score)}`} />
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-primary)]">Project Risk Assessment</h3>
      </div>
      
      <div className={`text-4xl font-black ${riskColor(risk.score)} mb-4`}>
        {risk.score}<span className="text-lg font-medium text-[var(--text-dim)]">/100</span>
      </div>

      {risk.factors.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">Key Risk Factors</h4>
          <ul className="space-y-1.5">
            {risk.factors.map((factor, i) => (
              <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}

      {risk.suggestions.length > 0 && (
        <div className="bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 mt-4">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 flex items-center gap-2">
            Mitigation Suggestions
          </h4>
          <ul className="space-y-2">
            {risk.suggestions.map((suggestion, i) => (
              <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposal && proposal.length > 0 && (
        <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl p-4 mt-4">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
            Last AI Proposal ({proposal.length})
          </h4>
          <ul className="space-y-1.5 max-h-28 overflow-y-auto">
            {proposal.map((action, i) => (
              <li key={i} className="text-xs text-[var(--text-secondary)]">
                {action.action}{action.reason ? ` - ${action.reason}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <button
          onClick={() => void handleResolveRisk()}
          disabled={resolving}
          className="text-[10px] font-bold uppercase tracking-widest bg-[var(--accent)] text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {resolving ? "Resolving Risk..." : "Resolve Risk"}
        </button>
      </div>
    </div>
  );
}
