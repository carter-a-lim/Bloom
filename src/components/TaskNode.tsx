import { Handle, Position } from '@xyflow/react';

export type TaskNodeData = {
  label: string;
  description?: string;
  isLeaf?: boolean;
};

export default function TaskNode({ data }: { data: TaskNodeData }) {
  const isLeaf = data.isLeaf;

  return (
    <div style={{
      background: isLeaf ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${isLeaf ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.1)'}`,
      boxShadow: isLeaf ? '0 0 20px rgba(139,92,246,0.12)' : '0 0 12px rgba(0,0,0,0.2)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: '14px',
      padding: '12px 16px',
      minWidth: '180px',
      maxWidth: '240px',
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: isLeaf ? '#a78bfa' : 'rgba(255,255,255,0.3)', border: 'none', width: 8, height: 8 }} />

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4, margin: 0, fontWeight: isLeaf ? 400 : 600 }}>
        {data.label}
      </p>

      {data.description && (
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4, margin: '6px 0 0' }}>
          {data.description}
        </p>
      )}

      <Handle type="source" position={Position.Bottom}
        style={{ background: isLeaf ? '#a78bfa' : 'rgba(255,255,255,0.3)', border: 'none', width: 8, height: 8 }} />
    </div>
  );
}
