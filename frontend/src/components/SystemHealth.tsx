import { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';

export interface ScraperHealth {
  provider_name: string;
  status: string;
  error_message: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
}

export function SystemHealth() {
  const [healthData, setHealthData] = useState<ScraperHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingProvider, setRefreshingProvider] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHealth = async () => {
    try {
      const res = await api.get('/api/v1/system/scraper-health');
      setHealthData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleCheck = async (provider?: string) => {
    if (provider) setRefreshingProvider(provider);
    else setRefreshingAll(true);
    
    try {
      await api.post('/api/v1/system/scraper-health/check', provider ? { provider_name: provider } : {});
      toast(`Health check started for ${provider || 'all integrations'}.`, "success");
    } catch (e) {
      console.error(e);
      toast("Failed to start health check.", "error");
    } finally {
      setTimeout(() => {
        setRefreshingProvider(null);
        setRefreshingAll(false);
      }, 1000);
    }
  };

  const getStatusConfig = (status: string) => {
    switch(status) {
      case 'OPERATIONAL':
        return { icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />, bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-500' };
      case 'DEGRADED':
        return { icon: <AlertTriangle className="w-6 h-6 text-yellow-500" />, bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-500' };
      case 'BLOCKED':
        return { icon: <XCircle className="w-6 h-6 text-red-500" />, bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-500' };
      case 'BROKEN':
        return { icon: <XCircle className="w-6 h-6 text-orange-500" />, bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-500' };
      default:
        return { icon: <Clock className="w-6 h-6 text-zinc-500" />, bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', text: 'text-zinc-500' };
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-full"><RefreshCw className="w-6 h-6 animate-spin text-zinc-400" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-black/20 border border-white/5 rounded-xl p-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-2">ATS Integrations Health</h2>
          <p className="text-sm text-zinc-400">Monitor the operational status of all background job scrapers.</p>
        </div>
        
        <button
          onClick={() => handleCheck()}
          disabled={refreshingAll || refreshingProvider !== null}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
          Test All Targets
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {healthData.length === 0 ? (
          <div className="col-span-full p-8 text-center text-zinc-500">
            No health data available yet.
          </div>
        ) : (
          healthData.map((item) => {
            const config = getStatusConfig(item.status);
            const base_filename = item.provider_name.toLowerCase().replace(/\s+/g, '');
            
            const isThisSpinning = refreshingProvider === item.provider_name;
            const isAnySpinning = refreshingAll || refreshingProvider !== null;
            
            return (
              <motion.div
                key={item.provider_name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col p-5 rounded-xl border bg-black/40 ${config.border} hover:bg-black/60 transition-colors relative overflow-hidden`}
              >
                <div className={`absolute top-0 right-0 w-24 h-24 ${config.bg} blur-3xl -z-10 rounded-full translate-x-1/2 -translate-y-1/2`} />
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      <img 
                        src={`/logos/${base_filename}.png`}
                        alt={item.provider_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = `/logos/${base_filename}.svg`;
                          e.currentTarget.className = "w-8 h-8 object-contain rounded-md";
                        }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-zinc-200 leading-tight">{item.provider_name}</h3>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.text} border ${config.border} mt-1 inline-block`}>
                        {item.status === 'UNKNOWN' ? 'UNTESTED' : item.status}
                      </span>
                    </div>
                  </div>
                  {config.icon}
                </div>

                <div className="space-y-2 text-sm mt-2">
                  <div className="flex justify-between text-zinc-400">
                    <span>Last Run:</span>
                    <span className="text-zinc-300">
                      {item.last_run_at ? new Date(item.last_run_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Last Success:</span>
                    <span className="text-zinc-300">
                      {item.last_success_at ? new Date(item.last_success_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                  {item.consecutive_failures > 0 && (
                    <div className="flex justify-between text-zinc-400">
                      <span>Failures:</span>
                      <span className="text-red-400 font-medium">{item.consecutive_failures}</span>
                    </div>
                  )}
                </div>

                {item.error_message && (
                  <div className="mt-4 p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                    <p className="text-xs text-red-400 font-mono break-words line-clamp-3" title={item.error_message}>
                      {item.error_message}
                    </p>
                  </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                  <button
                    onClick={() => handleCheck(item.provider_name)}
                    disabled={isAnySpinning}
                    className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors text-zinc-300 flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isThisSpinning ? 'animate-spin' : ''}`} />
                    Test Now
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
