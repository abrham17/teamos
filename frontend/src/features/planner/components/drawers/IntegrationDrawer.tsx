"use client";

import { useEffect, useState } from "react";
import { DrawerContainer } from "./DrawerContainer";
import type { ProjectIntegrationConfig } from "../../canvasApi";
import { getIntegrationConfig, updateIntegrationConfig } from "../../canvasApi";

interface IntegrationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string | null;
  projectId: string | null;
}

export function IntegrationDrawer({ isOpen, onClose, teamId, projectId }: IntegrationDrawerProps) {
  const [config, setConfig] = useState<ProjectIntegrationConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && teamId && projectId) {
      getIntegrationConfig(teamId, projectId)
        .then(setConfig)
        .catch(console.error);
    }
  }, [isOpen, teamId, projectId]);

  const handleToggle = async (field: keyof ProjectIntegrationConfig, value: boolean) => {
    if (!teamId || !projectId || !config) return;
    const updated = { ...config, [field]: value };
    setConfig(updated);
    setSaving(true);
    try {
      await updateIntegrationConfig(teamId, projectId, { [field]: value });
    } catch (err) {
      console.error("Failed to update integration config:", err);
      setConfig(config);
    }
    setSaving(false);
  };

  const handleTextChange = async (field: keyof ProjectIntegrationConfig, value: string) => {
    if (!teamId || !projectId || !config) return;
    const updated = { ...config, [field]: value };
    setConfig(updated);
    setSaving(true);
    try {
      await updateIntegrationConfig(teamId, projectId, { [field]: value });
    } catch (err) {
      console.error("Failed to update integration config:", err);
      setConfig(config);
    }
    setSaving(false);
  };

  if (!config) return null;

  return (
    <DrawerContainer isOpen={isOpen} onClose={onClose} title="Project Integrations">
      <div className="flex flex-col gap-5">
        <Section title="Google Calendar" icon="📅">
          <Toggle
            label="Auto-sync task dates"
            description="When tasks are assigned with dates, events are created automatically."
            checked={config.auto_calendar_sync}
            onChange={(v) => handleToggle("auto_calendar_sync", v)}
          />
        </Section>

        <Section title="Slack" icon="💬">
          <Toggle
            label="Notify on status changes"
            checked={config.auto_slack_notify}
            onChange={(v) => handleToggle("auto_slack_notify", v)}
          />
          {config.auto_slack_notify && (
            <TextInput
              label="Channel"
              value={config.slack_channel}
              onChange={(v) => handleTextChange("slack_channel", v)}
              placeholder="#engineering"
            />
          )}
        </Section>

        <Section title="GitHub" icon="🐙">
          <Toggle
            label="Auto-create issues for new tasks"
            checked={config.auto_github_issues}
            onChange={(v) => handleToggle("auto_github_issues", v)}
          />
          {config.auto_github_issues && (
            <TextInput
              label="Repository"
              value={config.github_repo}
              onChange={(v) => handleTextChange("github_repo", v)}
              placeholder="owner/repo"
            />
          )}
        </Section>

        <Section title="Jira" icon="🎫">
          <Toggle
            label="Auto-create issues for new tasks"
            checked={config.auto_jira_issues}
            onChange={(v) => handleToggle("auto_jira_issues", v)}
          />
          {config.auto_jira_issues && (
            <TextInput
              label="Project Key"
              value={config.jira_project_key}
              onChange={(v) => handleTextChange("jira_project_key", v)}
              placeholder="TEAM"
            />
          )}
        </Section>

        <Section title="Linear" icon="🔷">
          <Toggle
            label="Auto-create issues for new tasks"
            checked={config.auto_linear_issues}
            onChange={(v) => handleToggle("auto_linear_issues", v)}
          />
          {config.auto_linear_issues && (
            <TextInput
              label="Team ID"
              value={config.linear_team_id}
              onChange={(v) => handleTextChange("linear_team_id", v)}
              placeholder="team-id"
            />
          )}
        </Section>

        <Section title="Notifications" icon="🔔">
          <Toggle label="Task assignment" checked={config.notify_on_assign} onChange={(v) => handleToggle("notify_on_assign", v)} />
          <Toggle label="Overdue reminders" checked={config.notify_on_overdue} onChange={(v) => handleToggle("notify_on_overdue", v)} />
          <Toggle label="Task completion" checked={config.notify_on_complete} onChange={(v) => handleToggle("notify_on_complete", v)} />
          <Toggle label="Milestone approaching" checked={config.notify_on_milestone} onChange={(v) => handleToggle("notify_on_milestone", v)} />
        </Section>
      </div>
    </DrawerContainer>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#13131a] rounded-xl p-4 border border-[rgba(255,255,255,0.07)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <span className="text-[12px] font-semibold text-[#eeeef2]">{title}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div
        className="relative w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors"
        style={{ background: checked ? "#8b7ff4" : "#1a1a23" }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
        />
      </div>
      <div>
        <div className="text-[11px] text-[#eeeef2] font-medium">{label}</div>
        {description && <div className="text-[10px] text-[#62627a] mt-0.5">{description}</div>}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="hidden" />
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] text-[#62627a] uppercase tracking-wider font-semibold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[#1a1a23] border border-[rgba(255,255,255,0.07)] rounded-md px-2.5 py-1.5 text-[11px] text-[#eeeef2] outline-none focus:border-[rgba(139,127,244,0.4)]"
      />
    </div>
  );
}
