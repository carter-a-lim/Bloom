import { Handle, Position } from '@xyflow/react';

type TaskState = 'Thinking' | 'Coding' | 'Success' | 'Blocked';

export type TaskNodeData = {
  label: string;
  state: TaskState;
};

export default function TaskNode({ data }: { data: TaskNodeData }) {
  const getColorsByState = (state: TaskState) => {
    switch (state) {
      case 'Thinking':
        return 'bg-blue-100 border-blue-500 text-blue-900';
      case 'Coding':
        return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      case 'Success':
        return 'bg-green-100 border-green-500 text-green-900';
      case 'Blocked':
        return 'bg-red-100 border-red-500 text-red-900';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-900';
    }
  };

  const colors = getColorsByState(data.state);

  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-white border-2 ${colors}`}>
      <Handle type="target" position={Position.Top} className="w-16 !bg-gray-400" />
      <div className="flex flex-col">
        <div className="font-bold text-sm mb-1">{data.label}</div>
        <div className="text-xs uppercase font-semibold opacity-70">{data.state}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-16 !bg-gray-400" />
    </div>
  );
}
