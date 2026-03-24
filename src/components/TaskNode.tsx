import { Handle, Position } from '@xyflow/react';

type TaskState = 'Thinking' | 'Coding' | 'Success' | 'Blocked';

export type TaskNodeData = {
  label: string;
  state: TaskState;
};

const stateConfig: Record<TaskState, { glow: string; dot: string; label: string; border: string; bg: string }> = {
  Thinking: {
    bg: 'rgba(37,99,235,0.08)',
    border: 'rgba(37,99,235,0.3)',
    glow: '0 0 20px rgba(37,99,235,0.15)',
    dot: '#60a5fa',
    label: 'Planning',
  },
  Coding: {
    bg: 'rgba(234,179,8,0.08)',
    border: 'rgba(234,179,8,0.3)',
    glow: '0 0 20px rgba(234,179,8,0.15)',
    dot: '#facc15',
    label: 'Coding',
  },
  Success: {
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.3)',
    glow: '0 0 20px rgba(16,185,129,0.2)',
    dot: '#34d399',
    label: 'Done',
  },
  Blocked: {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.3)',
    glow: '0 0 20px rgba(239,68,68,0.15)',
    dot: '#f87171',
    label: 'Blocked',
  },
};

export default function TaskNode({ data }: { data: TaskNodeData }) {
  const cfg = stateConfig[data.state] || stateConfig.Thinking;

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: cfg.glow,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: '14px',
        padding: '12px 16px',
        minWidth: '180px',
        maxWidth: '220px',
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: cfg.dot, border: 'none', width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
          boxShadow: `0 0 6px ${cfg.dot}`,
          animation: data.state === 'Coding' ? 'pulse 1.5s infinite' : 'none',
        }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: cfg.dot, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {cfg.label}
        </span>
      </div>

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, margin: 0, fontWeight: 500 }}>
        {data.label}
      </p>

      <Handle type="source" position={Position.Bottom}
        style={{ background: cfg.dot, border: 'none', width: 8, height: 8 }} />
    </div>
  );
}
