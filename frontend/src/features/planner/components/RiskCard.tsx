import { Shield, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getProjectRisk } from "../api";

interface RiskCardProps {
  teamId: string;
  projectId: string;
}

export function RiskCard({ teamId, projectId }: RiskCardProps) {
  const [risk, setRisk] = useState<{ score: number; factors: string[]; suggestions: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getProjectRisk(teamId, projectId)
      .then(setRisk)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId, projectId]);

  if (loading) {
    return (
      <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[var(--accent)] animate-spin" />
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
    </div>
  );
}
