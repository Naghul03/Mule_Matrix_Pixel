import React from 'react';
import {
  RotateCcw,
  Sun,
  Moon
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

  const tabs: { id: TabType; index: string; label: string; count?: number }[] = [
    { id: 'overview', index: '01', label: 'Overview' },
    { id: 'simulator', index: '02', label: 'Simulator' },
    { id: 'alerts', index: '03', label: 'Alerts & Risk', count: alertCount },
    { id: 'investigation', index: '04', label: 'Investigation' },
    { id: 'scenarios', index: '05', label: 'Scenario Lab' },
    { id: 'settings', index: '06', label: 'Settings' },
  ];

  return (
    <header className="bg-white dark:bg-[#0C0D0E] border-b-2 border-neutral-900 dark:border-neutral-700 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-stretch justify-between h-14">
          {/* Logo & Product Mark */}
          <div
            className="flex items-center space-x-3 cursor-pointer select-none border-r border-neutral-200 dark:border-neutral-800 pr-5"
            onClick={() => setActiveTab('overview')}
          >
            <div className="w-5 h-5 bg-[#E30613] flex-shrink-0" />
            <div className="flex flex-col">
              <span className="font-black tracking-tight text-neutral-900 dark:text-white text-sm uppercase leading-tight font-sans">
                Mule Matrix
              </span>
              <span className="text-[9px] font-mono tracking-widest text-neutral-500 uppercase">
                Raster // Forensics
              </span>
            </div>
          </div>

          {/* Numbered Navigation Tabs (Swiss Modular Grid) */}
          <nav className="flex items-stretch space-x-0 overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-1.5 px-3.5 sm:px-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-[2px] whitespace-nowrap ${
                    isActive
                      ? 'border-[#E30613] text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-900/60'
                      : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30'
                  }`}
                >
                  <span className={`text-[10px] font-mono ${isActive ? 'text-[#E30613]' : 'text-neutral-400'}`}>
                    {tab.index}
                  </span>
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-[#E30613] text-white">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Action Tools: Reset & Theme */}
          <div className="flex items-center space-x-2 pl-4 border-l border-neutral-200 dark:border-neutral-800">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-neutral-300" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Reset Simulation State */}
            <button
              onClick={onReset}
              disabled={isResetting}
              className="hidden sm:flex items-center space-x-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 transition-all disabled:opacity-50"
              title="Reset simulation ledger and investigations"
            >
              <RotateCcw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
              <span>{isResetting ? 'Resetting...' : 'Reset'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
