// Location: client/src/components/settings/SettingsLayout.tsx
// Reusable settings layout with sidebar navigation

import { ReactNode } from 'react';
import { User, CreditCard, HelpCircle } from 'lucide-react';

interface Section {
  id: string;
  label: string;
  icon: string;
}

interface SettingsLayoutProps {
  sections: Section[];
  currentSection: string;
  onSectionChange: (sectionId: string) => void;
  children: ReactNode;
}

const iconMap: Record<string, any> = {
  User,
  CreditCard,
  HelpCircle,
};

export default function SettingsLayout({
  sections,
  currentSection,
  onSectionChange,
  children,
}: SettingsLayoutProps) {
  return (
    <div className="grid lg:grid-cols-4 gap-6">
      {/* Sidebar Navigation */}
      <aside className="lg:col-span-1">
        <nav className="glass-strong rounded-lg p-2 space-y-1 sticky top-24">
          {sections.map((section) => {
            const Icon = iconMap[section.icon];
            const isActive = currentSection === section.id;

            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-purple-500/20 border border-purple-500/40 text-purple-400 shadow-[0_0_15px_rgba(160,32,240,0.3)]'
                    : 'hover:bg-white/5 border border-transparent text-muted-foreground hover:text-white'
                }`}
              >
                {Icon && <Icon className="h-5 w-5" />}
                <span className="text-sm font-medium">{section.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="lg:col-span-3">
        <div className="glass-strong rounded-lg p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
