import { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
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
  const [filter, setFilter] = useState<string>('ALL');
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
        return { icon: <CheckCircle2 className="w-5 h-5 text-status-interviewing" />, bg: 'bg-status-interviewing/10', border: 'border-status-interviewing/20', text: 'text-status-interviewing' };
      case 'DEGRADED':
        return { icon: <AlertTriangle className="w-5 h-5 text-status-applied" />, bg: 'bg-status-applied/10', border: 'border-status-applied/20', text: 'text-status-applied' };
      case 'BLOCKED':
        return { icon: <XCircle className="w-5 h-5 text-status-rejected" />, bg: 'bg-status-rejected/10', border: 'border-status-rejected/20', text: 'text-status-rejected' };
      case 'BROKEN':
        return { icon: <XCircle className="w-5 h-5 text-status-rejected" />, bg: 'bg-status-rejected/10', border: 'border-status-rejected/20', text: 'text-status-rejected' };
      default:
        return { icon: <Clock className="w-5 h-5 text-muted-foreground" />, bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground' };
    }
  };

  const stats = healthData.reduce((acc, curr) => {
    const s = curr.status === 'UNKNOWN' ? 'UNTESTED' : curr.status;
    acc[s] = (acc[s] || 0) + 1;
    acc['ALL'] = (acc['ALL'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredData = healthData.filter(item => {
    if (filter === 'ALL') return true;
    const s = item.status === 'UNKNOWN' ? 'UNTESTED' : item.status;
    return s === filter;
  });

  if (loading) {
    return <div className="flex justify-center items-center py-16"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card border border-border rounded-lg p-6 gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground mb-1">ATS Integrations Health</h3>
          <p className="text-sm text-muted-foreground">Monitor the operational status of all background job scrapers.</p>
        </div>

        <button
          onClick={() => handleCheck()}
          disabled={refreshingAll || refreshingProvider !== null}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/25 rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50 whitespace-nowrap text-sm font-semibold"
        >
          <RefreshCw className={`w-4 h-4 ${refreshingAll ? 'animate-spin' : ''}`} />
          Test All Targets
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
        {['ALL', 'OPERATIONAL', 'DEGRADED', 'BROKEN', 'BLOCKED', 'UNTESTED'].map(f => {
          if (!stats[f] && f !== 'ALL') return null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap ${
                filter === f
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-secondary border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {f} ({stats[f] || 0})
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredData.length === 0 ? (
          <div className="col-span-full p-8 text-center text-muted-foreground text-sm">
            No health data matches this filter.
          </div>
        ) : (
          filteredData.map((item) => {
            const config = getStatusConfig(item.status);
            const base_filename = item.provider_name.toLowerCase().replace(/\s+/g, '');
            const isThisSpinning = refreshingProvider === item.provider_name;

            return (
              <div
                key={item.provider_name}
                className={`flex flex-col p-5 rounded-lg border bg-card ${config.border} hover:bg-accent/30 transition-colors`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-secondary border border-border flex items-center justify-center overflow-hidden shrink-0">
                      <img
                        src={`/logos/${base_filename}.png`}
                        alt={item.provider_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = `/logos/${base_filename}.svg`;
                          e.currentTarget.className = "w-7 h-7 object-contain rounded-md";
                        }}
                      />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-foreground leading-tight">{item.provider_name}</h4>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.text} border ${config.border} mt-1 inline-block`}>
                        {item.status === 'UNKNOWN' ? 'UNTESTED' : item.status}
                      </span>
                    </div>
                  </div>
                  {config.icon}
                </div>

                <div className="space-y-2 text-xs mt-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Last Run:</span>
                    <span className="text-foreground">
                      {item.last_run_at ? new Date(item.last_run_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Last Success:</span>
                    <span className="text-foreground">
                      {item.last_success_at ? new Date(item.last_success_at).toLocaleString() : 'Never'}
                    </span>
                  </div>
                  {item.consecutive_failures > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Failures:</span>
                      <span className="text-status-rejected font-medium">{item.consecutive_failures}</span>
                    </div>
                  )}
                </div>

                {item.error_message && (
                  <div className="mt-4 p-3 bg-status-rejected/5 border border-status-rejected/15 rounded-md">
                    <p className="text-xs text-status-rejected font-mono break-words line-clamp-3" title={item.error_message}>
                      {item.error_message}
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border flex justify-end">
                  <button
                    onClick={() => handleCheck(item.provider_name)}
                    disabled={isThisSpinning || refreshingAll}
                    className="text-xs px-3 py-1.5 bg-secondary hover:bg-accent border border-border rounded transition-colors text-foreground flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isThisSpinning ? 'animate-spin' : ''}`} />
                    Test Now
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
