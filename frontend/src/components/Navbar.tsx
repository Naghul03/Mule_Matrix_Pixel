import React from 'react';
import {
  LayoutDashboard,
  Send,
  BellRing,
  GitFork,
  FlaskConical,
  Sliders,
  RotateCcw,
  Sun,
  Moon,
  Shield
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export type TabType = 
  | 'overview' 
  | 'simulator' 
  | 'alerts' 
  | 'investigation' 
  | 'scenarios' 
  | 'settings';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onReset: () => void;
  isResetting: boolean;
  alertCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onReset,
  isResetting,
  alertCount
}) => {
  const { theme, toggleTheme } = useTheme();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'simulator', label: 'Transfer Simulator', icon: Send },
    { id: 'alerts', label: 'Alerts & Risk', icon: BellRing, count: alertCount },
    { id: 'investigation', label: 'Investigation Workspace', icon: GitFork },
    { id: 'scenarios', label: 'Scenario Lab & Eval', icon: FlaskConical },
    { id: 'settings', label: 'Settings & Rules', icon: Sliders },
  ];

  return (
    <header className="bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 transition-colors shadow-apple">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Product Name */}
          <div
            className="flex items-center space-x-2.5 cursor-pointer select-none"
            onClick={() => setActiveTab('overview')}
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white shadow-sm">
              <Shield className="w-4 h-4" />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="font-semibold tracking-tight text-slate-900 dark:text-white text-base">
                Mule Matrix
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Console
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Apple Segmented Style) */}
          <nav className="flex items-center space-x-1 overflow-x-auto py-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Actions: Theme Toggle & Reset */}
          <div className="flex items-center space-x-2">
            {/* Dark / Light Mode Switch */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Reset State Action */}
            <button
              onClick={onReset}
              disabled={isResetting}
              className="flex items-center space-x-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 transition-all font-medium disabled:opacity-50"
              title="Reset simulation ledger and investigations to clean state"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isResetting ? 'Resetting...' : 'Reset'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
