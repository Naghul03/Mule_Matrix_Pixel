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
    <div className="min-h-screen bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* Top Global Notice Strip */}
      <GlobalNotice />

      {/* Main Apple/Google Style Top Navbar */}
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && <Overview onNavigateTab={handleNavigateTab} />}
        {activeTab === 'simulator' && <TransferSimulator />}
        {activeTab === 'alerts' && <Alerts onNavigateTab={handleNavigateTab} />}
        {activeTab === 'investigation' && <InvestigationWorkspace initialContext={navContext} />}
        {activeTab === 'scenarios' && <ScenarioLab />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* Clean Minimalist Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] py-3.5 text-xs text-slate-500 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Mule Matrix</span>
            <span>•</span>
            <span>Explainable Mule Detection & Cross-Bank Lineage</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Compliant with MVP Architecture Specification
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
