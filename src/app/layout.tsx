import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bloom",
  description: "Visual AI task factory",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Ambient background orbs */}
        <div className="bg-orb w-96 h-96 top-[-100px] left-[-100px] opacity-20"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
        <div className="bg-orb w-80 h-80 bottom-[-80px] right-[20%] opacity-15"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent)' }} />
        <div className="bg-orb w-64 h-64 top-[40%] right-[-60px] opacity-10"
          style={{ background: 'radial-gradient(circle, #0891b2, transparent)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </body>
    </html>
  );
}
