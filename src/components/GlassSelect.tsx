'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Option = { value: string; label: string };

export default function GlassSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
}: {
  value: string;
  onChange: (val: string) => void;
  options: Option[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-xs rounded-lg px-3 py-2 outline-none text-left"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: `1px solid ${open ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
          color: selected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
          transition: 'border-color 0.15s',
        }}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8, flexShrink: 0 }}
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
            style={{
              background: 'rgba(18,18,28,0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="w-full text-left text-xs px-3 py-2.5 transition-colors"
                style={{
                  color: o.value === value ? 'rgba(139,92,246,1)' : o.value === '__add__' ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.75)',
                  background: o.value === value ? 'rgba(139,92,246,0.12)' : 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = o.value === value ? 'rgba(139,92,246,0.12)' : 'transparent')}
              >
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
