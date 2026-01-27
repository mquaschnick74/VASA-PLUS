// Location: client/src/components/settings/SettingsLayout.tsx
// Reusable settings layout with sidebar navigation

import { ReactNode } from 'react';
import { User, Mail, HelpCircle, Bell } from 'lucide-react';

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
  Mail,
  HelpCircle,
  Bell,
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
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(0,208,98,0.3)]'
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
