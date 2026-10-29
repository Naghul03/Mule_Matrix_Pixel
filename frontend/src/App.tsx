import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { GlobalNotice } from './components/GlobalNotice';
import { Navbar, TabType } from './components/Navbar';
import { Overview } from './pages/Overview';
import { TransferSimulator } from './pages/TransferSimulator';
import { Alerts } from './pages/Alerts';
import { InvestigationWorkspace } from './pages/InvestigationWorkspace';
import { ScenarioLab } from './pages/ScenarioLab';
import { Settings } from './pages/Settings';
import { api } from './lib/api';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [navContext, setNavContext] = useState<any>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [alertCount, setAlertCount] = useState<number>(0);

  const fetchAlertCount = async () => {
    try {
      const alerts = await api.getAlerts({ limit: 100 });
      setAlertCount(alerts.length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateTab = (tab: string, context?: any) => {
    setActiveTab(tab as TabType);
    if (context) {
      setNavContext(context);
    }
  };

  const handleResetSimulation = async () => {
    if (!window.confirm('Reset all transactions, alerts, and investigations to a clean baseline state?')) {
      return;
    }
    setIsResetting(true);
    try {
      await api.resetSimulation();
      setAlertCount(0);
      setNavContext(null);
      setActiveTab('overview');
      window.location.reload();
    } catch (e: any) {
      alert(`Reset failed: ${e.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0C0D0E] text-[#111111] dark:text-[#F4F4F4] flex flex-col font-sans transition-colors duration-150">
      {/* Top Global Notice Strip */}
      <GlobalNotice />

      {/* Main Swiss Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(t) => {
          setNavContext(null);
          setActiveTab(t);
        }}
        onReset={handleResetSimulation}
        isResetting={isResetting}
        alertCount={alertCount}
      />

      {/* Main Page Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && <Overview onNavigateTab={handleNavigateTab} />}
        {activeTab === 'simulator' && <TransferSimulator onNavigateTab={handleNavigateTab} />}
        {activeTab === 'alerts' && <Alerts onNavigateTab={handleNavigateTab} />}
        {activeTab === 'investigation' && <InvestigationWorkspace initialContext={navContext} />}
        {activeTab === 'scenarios' && <ScenarioLab />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* Swiss Editorial Colophon Footer */}
      <footer className="border-t-2 border-neutral-900 dark:border-neutral-700 bg-white dark:bg-[#0C0D0E] py-4 text-xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-neutral-500 font-mono text-[11px]">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 bg-[#E30613] inline-block"></span>
            <span className="font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
              Mule Matrix
            </span>
            <span>//</span>
            <span>SWISS INTERNATIONAL FINANCIAL FORENSICS</span>
          </div>
          <div className="text-[10px] tracking-wider uppercase text-neutral-400">
            RASTER // 08-COL MODULAR • ZERO-PII PROGRAMMABLE e-RUPEE AUDIT
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
