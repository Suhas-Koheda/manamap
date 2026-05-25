import { useState, useEffect, useRef, useMemo } from 'react';
import { TenderProject } from './types';
import Map from './components/Map';
import FilterBar from './components/FilterBar';
import ProjectDashboard from './components/ProjectDashboard';
import { AnimatePresence, motion } from 'motion/react';
import { 
  ArrowRight, LayoutGrid, Info, Landmark, Shield, FileText, Phone, 
  Building2, BadgeIndianRupee, Activity, MapPin, RefreshCw,
  Terminal, Download, Database, Layers, Clock, AlertCircle, CheckCircle
} from 'lucide-react';

function ScraperTimer({ startTime, isRunning }: { startTime: string | null; isRunning: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime || !isRunning) {
      if (!startTime) setElapsed(0);
      return;
    }

    const start = new Date(startTime).getTime();
    setElapsed(Math.round((Date.now() - start) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, isRunning]);

  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');
  return <span>{minutes}:{seconds}</span>;
}

type TabType = 'explorer' | 'insights' | 'about' | 'privacy' | 'terms' | 'contact' | 'data' | 'monitor';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace(/^http/, 'ws');

interface ScraperState {
  is_running: boolean;
  start_time: string | null;
  pages_processed: number;
  tenders_processed: number;
  tenders_saved: number;
  documents_downloaded: number;
  failures: number;
  current_tender_id: string | null;
  current_district: string | null;
  active_download: string | null;
  session_refreshes: number;
  current_offset: number;
  logs: string[];
}

export default function App() {
  const [projects, setProjects] = useState<TenderProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<TenderProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter States
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'open' | 'awarded' | 'completed'>("all");
  const [minBudget, setMinBudget] = useState<number>(0);
  const [maxBudget, setMaxBudget] = useState<number>(0);
  
  // Scraper status
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperMessage, setScraperMessage] = useState("");

  // Live Monitor States
  const [scraperState, setScraperState] = useState<ScraperState>({
    is_running: false,
    start_time: null,
    pages_processed: 0,
    tenders_processed: 0,
    tenders_saved: 0,
    documents_downloaded: 0,
    failures: 0,
    current_tender_id: null,
    current_district: null,
    active_download: null,
    session_refreshes: 0,
    current_offset: 0,
    logs: []
  });
  const [historicalRuns, setHistoricalRuns] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<TabType>('explorer');
  const contentRef = useRef<HTMLElement>(null);
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // Fetch Tenders
  const fetchTenders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDistrict) params.append("district", selectedDistrict);
      if (selectedDepartment) params.append("department", selectedDepartment);
      if (selectedStatus && selectedStatus !== 'all') params.append("status", selectedStatus);
      if (minBudget > 0) params.append("minValue", minBudget.toString());
      if (maxBudget > 0) params.append("maxValue", maxBudget.toString());
      if (searchQuery) params.append("q", searchQuery);
      params.append("limit", "100"); // Show up to 100 on screen/map

      const res = await fetch(`${API_URL}/api/tenders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.results || []);
      }
    } catch (error) {
      console.error("Error fetching tenders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenders();
  }, [selectedDistrict, selectedDepartment, selectedStatus, minBudget, maxBudget, searchQuery]);

  const handleResetFilters = () => {
    setSelectedDistrict("");
    setSelectedDepartment("");
    setSelectedStatus("all");
    setMinBudget(0);
    setMaxBudget(0);
    setSearchQuery("");
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${API_URL}/api/scraper/runs`);
      if (res.ok) {
        const data = await res.json();
        setHistoricalRuns(data);
      }
    } catch (err) {
      console.error("Error fetching historical runs:", err);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [scraperState.logs]);

  // WebSocket connection management
  useEffect(() => {
    // Initial fetch of status
    fetch(`${API_URL}/api/scraper/status`)
      .then(res => res.json())
      .then(data => {
        if (data) setScraperState(data);
      })
      .catch(err => console.error("Error fetching scraper status:", err));

    let ws: WebSocket;
    let reconnectTimeout: any;

    const connectWS = () => {
      const socketUrl = `${WS_URL}/api/scraper/ws`;
      console.log("Connecting to WebSocket:", socketUrl);
      ws = new WebSocket(socketUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "state" && msg.state) {
            setScraperState(msg.state);
          } else if (msg.type === "log" && msg.message) {
            setScraperState(prev => ({
              ...prev,
              logs: [...prev.logs, msg.message]
            }));
          } else if (msg.type === "progress") {
            setScraperState(prev => ({
              ...prev,
              current_offset: msg.offset,
              tenders_processed: msg.tenders_processed,
              tenders_saved: msg.tenders_saved ?? prev.tenders_saved,
              documents_downloaded: msg.documents_downloaded,
              pages_processed: msg.pages_processed ?? prev.pages_processed
            }));
          } else if (msg.type === "current_tender") {
            setScraperState(prev => ({
              ...prev,
              current_tender_id: msg.tender_id,
              current_district: msg.district ?? prev.current_district
            }));
          } else if (msg.type === "download") {
            setScraperState(prev => ({
              ...prev,
              active_download: msg.filename
            }));
          } else if (msg.type === "error") {
            setScraperState(prev => ({
              ...prev,
              failures: prev.failures + 1,
              logs: [...prev.logs, `[✗] Error: ${msg.message}`]
            }));
          } else if (msg.type === "session_refresh") {
            setScraperState(prev => ({
              ...prev,
              session_refreshes: prev.session_refreshes + 1,
              logs: [...prev.logs, `[✓] Session expired, refreshed successfully.`]
            }));
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed. Retrying in 5 seconds...");
        reconnectTimeout = setTimeout(connectWS, 5000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Monitor scraper runs state changes to refresh historical lists
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (prevRunningRef.current && !scraperState.is_running) {
      fetchRuns();
      fetchTenders();
    }
    prevRunningRef.current = scraperState.is_running;
  }, [scraperState.is_running]);

  const handleTriggerScraper = async () => {
    setScraperLoading(true);
    setScraperMessage("");
    try {
      const res = await fetch(`${API_URL}/api/scraper/run`, {
        method: 'POST'
      });
      if (res.ok) {
        setScraperMessage("Scraper aggregation triggered in background.");
        scrollToContent('monitor');
        fetchRuns();
      } else {
        const errData = await res.json().catch(() => ({}));
        setScraperMessage(errData.detail || "Failed to trigger scraper run.");
      }
    } catch (err) {
      console.error("Failed to run scraper:", err);
      setScraperMessage("Failed to communicate with API server.");
    } finally {
      setScraperLoading(false);
      setTimeout(() => setScraperMessage(""), 5000);
    }
  };

  // Compute Statistics
  const stats = useMemo(() => {
    const totalCount = projects.length;
    const openCount = projects.filter(p => p.status === 'open').length;
    const activeCount = projects.filter(p => p.status === 'awarded').length;
    const completedCount = projects.filter(p => p.status === 'completed').length;
    
    const totalSanctionedValue = projects.reduce((sum, p) => sum + p.tenderValue, 0);
    const activeProjectsRatio = totalCount > 0 ? Math.round(((activeCount + completedCount) / totalCount) * 100) : 0;

    return {
      totalCount,
      openCount,
      activeCount,
      completedCount,
      totalSanctionedValue,
      activeProjectsRatio
    };
  }, [projects]);

  const scrollToContent = (tab: TabType) => {
    setActiveTab(tab);
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 100) {
      return `₹${(amount / 100).toFixed(2)} Cr`;
    }
    return `₹${amount.toFixed(2)} Lakhs`;
  };

  const statusColors = {
    open: 'bg-explore-blue/10 text-explore-blue border-explore-blue/20',
    awarded: 'bg-success-green/10 text-success-green border-success-green/20',
    completed: 'bg-civic-red/10 text-civic-red border-civic-red/20'
  };

  const statusLabels = {
    open: 'Open Bid',
    awarded: 'Ongoing',
    completed: 'Completed'
  };

  return (
    <div className="min-h-screen bg-canvas-white selection:bg-telangana-teal selection:text-white">
      {/* Floating Navbar */}
      <nav className="fixed top-4 md:top-6 left-1/2 -translate-x-1/2 z-[2000] w-[95%] max-w-5xl">
        <div className="bg-white/70 backdrop-blur-xl px-4 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-3xl border border-white/20 shadow-soft flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-telangana-teal rounded-lg md:rounded-xl flex items-center justify-center text-white font-black text-sm md:text-lg shadow-lg shadow-telangana-teal/20">
              మ
            </div>
            <div className="flex flex-col">
              <span className="font-black text-sm md:text-lg leading-none tracking-tight text-dark-charcoal">ManaMap Ledger</span>
              <span className="text-[8px] md:text-[10px] font-bold text-telangana-teal uppercase tracking-widest hidden sm:block">మన మ్యాప్ టెండర్లు</span>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center gap-8">
            <button 
              onClick={() => scrollToContent('explorer')} 
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-pointer ${activeTab === 'explorer' ? 'text-telangana-teal' : 'text-medium-gray hover:text-dark-charcoal'}`}
            >
              టెండర్ల మ్యాప్ (Ledger Map)
            </button>
            <button 
              onClick={() => scrollToContent('insights')} 
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-pointer ${activeTab === 'insights' ? 'text-telangana-teal' : 'text-medium-gray hover:text-dark-charcoal'}`}
            >
              కాంట్రాక్ట్ విశ్లేషణ (Analytics)
            </button>
            <button 
              onClick={() => scrollToContent('monitor')} 
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-pointer ${activeTab === 'monitor' ? 'text-telangana-teal' : 'text-medium-gray hover:text-dark-charcoal'}`}
            >
              లైవ్ మానిటర్ (Live Monitor)
            </button>
            <button 
              onClick={() => scrollToContent('about')} 
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-pointer ${activeTab === 'about' ? 'text-telangana-teal' : 'text-medium-gray hover:text-dark-charcoal'}`}
            >
              మా గురించి (About)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (scraperState.is_running) {
                  scrollToContent('monitor');
                } else {
                  handleTriggerScraper();
                }
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all cursor-pointer ${
                scraperState.is_running 
                  ? 'bg-civic-red/10 text-civic-red hover:bg-civic-red/20 border border-civic-red/20' 
                  : 'bg-ash-gray hover:bg-steel-gray text-dark-charcoal border border-transparent'
              }`}
            >
              <RefreshCw size={12} className={scraperState.is_running || scraperLoading ? "animate-spin" : ""} />
              <span>{scraperState.is_running ? "Scraping Live..." : "Run Scraper"}</span>
            </button>
            <a 
              href="https://tender.telangana.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-telangana-teal text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-action-teal transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              <Landmark size={14} />
              <span>e-Procurement Portal</span>
            </a>
          </div>
        </div>
        {scraperMessage && (
          <div className="mt-2 mx-auto w-fit bg-dark-charcoal text-white text-[10px] font-bold px-4 py-2 rounded-lg shadow-lg">
            {scraperMessage}
          </div>
        )}
      </nav>

      {/* Cinematic Hero Section */}
      <header className="relative h-[90vh] md:h-screen min-h-[600px] bg-hyd-night flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-hyd-night via-hyd-night/40 to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl pt-12 px-4">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-6 md:mb-10"
          >
            <h1 className="text-5xl md:text-8xl font-black text-white mb-4 leading-tight serif-font">
              తెలంగాణ కాంట్రాక్ట్ మ్యాప్
            </h1>
            <p className="text-lg md:text-2xl font-bold text-white/60 tracking-tight max-w-2xl mx-auto leading-relaxed">
              Public Ledger mapping out government infrastructure contracts & bidding across Telangana.<br className="hidden md:block" />
              <span className="text-telangana-teal italic">పారదర్శక పౌర వేదిక.</span>
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6"
          >
            <button 
              onClick={() => scrollToContent('explorer')}
              className="w-full sm:w-auto group px-10 py-5 bg-telangana-teal text-white rounded-2xl font-black text-xs tracking-widest uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 cursor-pointer"
            >
              డ్యాష్‌బోర్డ్ తెరవండి (Open Ledger)
              <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
            </button>
          </motion.div>
        </div>

        {/* Hero Glass Card */}
        <div className="absolute bottom-12 right-12 hidden lg:block z-20">
          <motion.div 
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
            className="glass-dark p-10 rounded-[40px] w-80 text-left"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-telangana-teal/20 flex items-center justify-center border border-telangana-teal/30">
                <LayoutGrid size={28} className="text-telangana-teal" />
              </div>
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.25em]">టెండర్లు (Tenders)</p>
                <p className="text-4xl font-black text-white">{stats.totalCount}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/60">
                <span>యాక్టివ్ పనులు (Ongoing/Completed Ratio)</span>
                <span>{stats.activeProjectsRatio}%</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.activeProjectsRatio}%` }}
                  transition={{ duration: 1.5, delay: 1, ease: "easeOut" }}
                  className="h-full bg-telangana-teal shadow-[0_0_15px_rgba(0,137,123,0.5)]" 
                />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-32 bg-gradient-to-t from-canvas-white to-transparent" />
      </header>

      {/* Main Content Section */}
      <main ref={contentRef} className="max-w-[1500px] mx-auto w-full px-4 md:px-6 py-12 md:py-24 min-h-[100vh] space-y-12">
        <div className="relative w-full max-w-md mb-8">
          <input
            type="text"
            placeholder="Search tenders by ID or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-steel-gray px-4 py-3 rounded-xl outline-none text-xs font-bold text-charcoal focus:border-telangana-teal transition-all"
          />
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'explorer' && (
            <motion.div 
              key="explorer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Filter Bar Component */}
              <FilterBar 
                selectedDistrict={selectedDistrict}
                onDistrictChange={setSelectedDistrict}
                selectedDepartment={selectedDepartment}
                onDepartmentChange={setSelectedDepartment}
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                minBudget={minBudget}
                onMinBudgetChange={setMinBudget}
                maxBudget={maxBudget}
                onMaxBudgetChange={setMaxBudget}
                onReset={handleResetFilters}
              />

              <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
                {/* LHS: Tender Projects List */}
                <section className="w-full lg:w-[50%] flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black text-dark-charcoal tracking-tight">లైవ్ లెడ్జర్ ఫీడ్ (Live Contracts Ledger)</h2>
                      <p className="text-xs font-bold text-medium-gray mt-1">Showing {projects.length} filtered projects</p>
                    </div>
                  </div>

                  {projects.length === 0 ? (
                    <div className="py-20 md:py-32 px-6 md:px-10 bg-off-white rounded-[32px] border-2 border-dashed border-steel-gray text-center">
                      <Landmark size={40} className="mx-auto mb-6 text-medium-gray" />
                      <h3 className="text-xl md:text-2xl font-black text-dark-charcoal mb-2 serif-font">ప్రాజెక్ట్‌లు కనుగొనబడలేదు...</h3>
                      <p className="text-medium-gray font-bold text-sm">No infrastructure projects match your filter criteria.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {projects.map((project) => (
                        <motion.div 
                          key={project.id}
                          layout
                          onClick={() => setSelectedProject(project)}
                          className="bg-white border border-steel-gray rounded-[24px] p-5 hover:border-telangana-teal/40 hover:shadow-soft transition-all duration-300 flex flex-col justify-between cursor-pointer group"
                        >
                          <div className="space-y-3">
                            <div className="flex justify-between items-start gap-3">
                              <span className={`px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-full border ${statusColors[project.status]}`}>
                                {statusLabels[project.status]}
                              </span>
                              <span className="text-[9px] font-bold text-medium-gray uppercase tracking-widest">{project.id}</span>
                            </div>
                            <h3 className="font-black text-sm text-charcoal group-hover:text-telangana-teal transition-colors line-clamp-2 leading-snug">
                              {project.title}
                            </h3>
                          </div>

                          <div className="mt-5 pt-4 border-t border-steel-gray/60 space-y-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-charcoal">
                              <Building2 size={13} className="text-telangana-teal" />
                              <span className="truncate">{project.department}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-charcoal">
                              <MapPin size={13} className="text-telangana-teal" />
                              <span>{project.district}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs mt-3 bg-off-white px-3 py-2 rounded-xl border border-steel-gray/40">
                              <span className="font-semibold text-medium-gray">Amount:</span>
                              <span className="font-black text-dark-charcoal">
                                {formatCurrency(project.tenderValue)}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </section>
                
                {/* RHS: Map Component */}
                <section className="w-full lg:w-[50%] flex flex-col gap-6">
                  <div className="lg:sticky lg:top-32">
                    <div className="h-[400px] md:h-[500px] lg:h-[750px] w-full rounded-[32px] overflow-hidden shadow-3xl shadow-dark-charcoal/10 border border-steel-gray relative group">
                      <Map 
                        projects={projects} 
                        onMarkerClick={setSelectedProject} 
                        selectedDistrict={selectedDistrict}
                      />
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div 
              key="insights"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-12 flex flex-col gap-12"
            >
               <div className="text-center max-w-2xl mx-auto px-4">
                 <h2 className="text-3xl md:text-4xl font-black text-dark-charcoal mb-4 serif-font tracking-tight">ప్రభుత్వ కాంట్రాక్ట్ విశ్లేషణ (Procurement Analytics)</h2>
                 <p className="text-medium-gray text-sm font-bold">Comprehensive procurement metrics for Telangana State.</p>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-off-white p-8 rounded-[24px] border border-steel-gray flex flex-col items-center text-center">
                     <Building2 size={24} className="text-telangana-teal mb-4" />
                     <h3 className="text-2xl font-black text-dark-charcoal mb-1">{stats.totalCount}</h3>
                     <p className="text-[9px] font-black uppercase tracking-widest text-medium-gray">మొత్తం టెండర్లు (Total Tenders)</p>
                  </div>
                  <div className="bg-off-white p-8 rounded-[24px] border border-steel-gray flex flex-col items-center text-center">
                     <BadgeIndianRupee size={24} className="text-explore-blue mb-4" />
                     <h3 className="text-2xl font-black text-dark-charcoal mb-1">{formatCurrency(stats.totalSanctionedValue)}</h3>
                     <p className="text-[9px] font-black uppercase tracking-widest text-medium-gray">మొత్తం మంజూరైన విలువ (Total Budget)</p>
                  </div>
                  <div className="bg-off-white p-8 rounded-[24px] border border-steel-gray flex flex-col items-center text-center">
                     <Activity size={24} className="text-success-green mb-4" />
                     <h3 className="text-2xl font-black text-dark-charcoal mb-1">{stats.activeCount}</h3>
                     <p className="text-[9px] font-black uppercase tracking-widest text-medium-gray">యాక్టివ్ పనులు (Ongoing Work)</p>
                  </div>
                  <div className="bg-off-white p-8 rounded-[24px] border border-steel-gray flex flex-col items-center text-center">
                     <Landmark size={24} className="text-civic-red mb-4" />
                     <h3 className="text-2xl font-black text-dark-charcoal mb-1">{stats.completedCount}</h3>
                     <p className="text-[9px] font-black uppercase tracking-widest text-medium-gray">పూర్తయిన పనులు (Completed Projects)</p>
                  </div>
               </div>

               {/* Department Wise Budget Allocation Breakdown */}
               <div className="bg-white border border-steel-gray rounded-[24px] p-8 space-y-6">
                 <h3 className="text-sm font-black text-dark-charcoal uppercase tracking-widest">శాఖల వారీగా కేటాయింపులు (Department-wise Allocation)</h3>
                 <div className="space-y-4">
                   {Array.from(new Set(projects.map(p => p.department))).map((dept) => {
                     const deptProjects = projects.filter(p => p.department === dept);
                     const deptBudget = deptProjects.reduce((sum, p) => sum + p.tenderValue, 0);
                     const percentage = stats.totalSanctionedValue > 0 ? (deptBudget / stats.totalSanctionedValue) * 100 : 0;
                     return (
                       <div key={dept} className="space-y-2">
                         <div className="flex justify-between text-xs font-bold">
                           <span className="text-charcoal">{dept} ({deptProjects.length} Projects)</span>
                           <span className="text-dark-charcoal">{formatCurrency(deptBudget)}</span>
                         </div>
                         <div className="h-2.5 w-full bg-ash-gray rounded-full overflow-hidden">
                           <div className="h-full bg-telangana-teal rounded-full" style={{ width: `${percentage}%` }}></div>
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'monitor' && (
            <motion.div
              key="monitor"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 py-6"
            >
              {/* Header card with state */}
              <div className="bg-white border border-steel-gray rounded-[24px] p-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-soft">
                <div className="flex items-center gap-4">
                  <div className={`w-4.5 h-4.5 rounded-full ${scraperState.is_running ? 'bg-civic-red pulse' : 'bg-medium-gray'}`} />
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-dark-charcoal serif-font">Scraper Ingestion Monitor</h2>
                    <p className="text-xs font-bold text-medium-gray mt-0.5">
                      {scraperState.is_running ? "Live scraper engine is currently processing portals." : "Ingestion engine is currently idle."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] font-black uppercase text-medium-gray tracking-wider">ELAPSED TIME</span>
                    <span className="text-sm font-black text-dark-charcoal font-mono">
                      <ScraperTimer startTime={scraperState.start_time} isRunning={scraperState.is_running} />
                    </span>
                  </div>
                  <button
                    onClick={handleTriggerScraper}
                    disabled={scraperState.is_running}
                    className="flex items-center gap-2 px-6 py-3.5 bg-telangana-teal text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-action-teal transition-all disabled:opacity-50 shadow-lg active:scale-95 cursor-pointer"
                  >
                    <RefreshCw size={14} className={scraperState.is_running ? "animate-spin" : ""} />
                    <span>{scraperState.is_running ? "Running..." : "Manual Start"}</span>
                  </button>
                </div>
              </div>

              {/* Progress bar card */}
              {scraperState.is_running && (
                <div className="bg-white border border-steel-gray rounded-[24px] p-6 space-y-4 shadow-soft">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-medium-gray uppercase tracking-widest">Run Progress (Estimated 3 Pages)</span>
                    <span className="text-telangana-teal">{Math.min(100, Math.round((scraperState.pages_processed / 3) * 100))}%</span>
                  </div>
                  <div className="h-3 w-full bg-ash-gray rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-telangana-teal transition-all duration-500 shadow-[0_0_8px_rgba(0,137,123,0.4)]" 
                      style={{ width: `${Math.min(100, (scraperState.pages_processed / 3) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-white p-5 rounded-[24px] border border-steel-gray shadow-subtle flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-medium-gray">Offset</span>
                  <span className="text-2xl font-black text-dark-charcoal mt-2 font-mono">{scraperState.current_offset}</span>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-steel-gray shadow-subtle flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-medium-gray">Tenders Scraped</span>
                  <span className="text-2xl font-black text-dark-charcoal mt-2 font-mono">{scraperState.tenders_processed}</span>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-steel-gray shadow-subtle flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-medium-gray">Tenders Saved</span>
                  <span className="text-2xl font-black text-explore-blue mt-2 font-mono">{scraperState.tenders_saved}</span>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-steel-gray shadow-subtle flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-medium-gray">Downloads</span>
                  <span className="text-2xl font-black text-success-green mt-2 font-mono">{scraperState.documents_downloaded}</span>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-steel-gray shadow-subtle flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-medium-gray">Failures</span>
                  <span className={`text-2xl font-black mt-2 font-mono ${scraperState.failures > 0 ? 'text-civic-red animate-pulse' : 'text-dark-charcoal'}`}>{scraperState.failures}</span>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-steel-gray shadow-subtle flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-medium-gray">Refreshes</span>
                  <span className="text-2xl font-black text-amber-gold mt-2 font-mono">{scraperState.session_refreshes}</span>
                </div>
              </div>

              {/* Current tender processing card */}
              {scraperState.is_running && scraperState.current_tender_id && (
                <div className="bg-white border border-steel-gray rounded-[24px] p-6 space-y-4 shadow-soft">
                  <h3 className="text-xs font-black uppercase tracking-widest text-medium-gray">Active Ingestion Target</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-off-white rounded-2xl border border-steel-gray/60">
                      <span className="text-[9px] font-black uppercase text-medium-gray block tracking-widest">Tender ID</span>
                      <span className="text-sm font-black text-dark-charcoal mt-1 block font-mono">{scraperState.current_tender_id}</span>
                    </div>
                    <div className="p-4 bg-off-white rounded-2xl border border-steel-gray/60">
                      <span className="text-[9px] font-black uppercase text-medium-gray block tracking-widest">District</span>
                      <span className="text-sm font-black text-dark-charcoal mt-1 block">{scraperState.current_district || "Scanning..."}</span>
                    </div>
                    <div className="p-4 bg-off-white rounded-2xl border border-steel-gray/60">
                      <span className="text-[9px] font-black uppercase text-medium-gray block tracking-widest">Downloading File</span>
                      <span className="text-sm font-black text-success-green mt-1 truncate block font-mono">{scraperState.active_download || "Waiting..."}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Logs Monitor Terminal */}
              <div className="bg-dark-charcoal text-white rounded-[24px] p-6 shadow-2xl relative overflow-hidden flex flex-col h-[420px] border border-white/5">
                <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-civic-red" />
                    <div className="w-3 h-3 rounded-full bg-amber-gold" />
                    <div className="w-3 h-3 rounded-full bg-success-green" />
                    <span className="text-xs font-mono font-bold text-white/40 ml-2">live-scraper-terminal.log</span>
                  </div>
                  <button 
                    onClick={() => setScraperState(prev => ({ ...prev, logs: [] }))}
                    className="text-[10px] font-black uppercase tracking-wider text-white/60 hover:text-white"
                  >
                    Clear Logs
                  </button>
                </div>
                <div 
                  ref={logTerminalRef}
                  className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1.5 pr-2 select-text selection:bg-telangana-teal selection:text-white"
                >
                  {scraperState.logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-white/20 select-none">
                      [Terminal waiting for scraper events...]
                    </div>
                  ) : (
                    scraperState.logs.map((log, index) => {
                      const isCheck = log.includes("[✓]");
                      const isCross = log.includes("[✗]");
                      const isWarn = log.includes("[!]");
                      let textColor = "text-white/80";
                      if (isCheck) textColor = "text-success-green";
                      else if (isCross) textColor = "text-civic-red font-bold";
                      else if (isWarn) textColor = "text-amber-gold font-semibold";
                      return (
                        <div key={index} className={`leading-relaxed whitespace-pre-wrap ${textColor}`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Historical Runs Table */}
              <div className="bg-white border border-steel-gray rounded-[24px] p-6 space-y-6 shadow-soft">
                <h3 className="text-sm font-black uppercase tracking-widest text-dark-charcoal">Historical Ingestion Runs</h3>
                {historicalRuns.length === 0 ? (
                  <p className="text-xs font-bold text-medium-gray py-4">No historical runs recorded in database ledger.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-steel-gray/60 text-[10px] font-black uppercase tracking-wider text-medium-gray">
                          <th className="py-3 pr-4">Run ID</th>
                          <th className="py-3 px-4">Started At</th>
                          <th className="py-3 px-4">Finished At</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Tenders Saved</th>
                          <th className="py-3 px-4 text-right">Downloads</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalRuns.map((run) => (
                          <tr key={run.id} className="border-b border-steel-gray/30 text-xs font-bold text-charcoal hover:bg-off-white transition-colors">
                            <td className="py-3.5 pr-4 font-mono text-telangana-teal">#{run.id}</td>
                            <td className="py-3.5 px-4 font-mono text-[11px]">{run.started_at || "N/A"}</td>
                            <td className="py-3.5 px-4 font-mono text-[11px]">{run.finished_at || "In Progress"}</td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                run.status === 'completed' ? 'bg-success-green/10 text-success-green border border-success-green/20' : 
                                run.status === 'failed' ? 'bg-civic-red/10 text-civic-red border border-civic-red/20' : 
                                'bg-explore-blue/10 text-explore-blue border border-explore-blue/20 animate-pulse'
                              }`}>
                                {run.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono">{run.tenders_processed}</td>
                            <td className="py-3.5 px-4 text-right font-mono">{run.documents_downloaded}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'about' && (
            <motion.div 
              key="about"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="py-12 flex flex-col items-center text-center max-w-3xl mx-auto px-4"
            >
               <div className="w-20 h-20 bg-telangana-teal rounded-[24px] flex items-center justify-center text-white text-3xl font-black mb-8">మ</div>
               <h2 className="text-3xl md:text-4xl font-black text-dark-charcoal mb-6 serif-font">మన మ్యాప్ టెండర్ లెడ్జర్ (ManaMap Ledger)</h2>
               <div className="space-y-6 text-sm font-bold text-medium-gray text-left leading-relaxed">
                  <p>ManaMap Infrastructure Ledger is a public platform that tracks and maps municipal infrastructure projects, construction contracts, and road works across Telangana.</p>
                  <p>By compiling data from the Telangana eProcurement and Central CPPP platforms, we empower citizens, researchers, and administrators with clear spatial visualization.</p>
               </div>
            </motion.div>
          )}

          {activeTab === 'privacy' && (
            <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 max-w-3xl mx-auto px-4">
              <Shield size={48} className="text-telangana-teal mb-8" />
              <h2 className="text-3xl font-black text-dark-charcoal mb-8 serif-font">Privacy Policy</h2>
              <div className="space-y-6 text-medium-gray font-bold text-sm leading-relaxed">
                <p>ManaMap is dedicated to open transparency. All data presented on this platform is retrieved from public procurement logs and government websites.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'terms' && (
            <motion.div key="terms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 max-w-3xl mx-auto px-4">
              <FileText size={48} className="text-telangana-teal mb-8" />
              <h2 className="text-3xl font-black text-dark-charcoal mb-8 serif-font">Terms of Service</h2>
              <div className="space-y-6 text-medium-gray font-bold text-sm leading-relaxed">
                <p>The information on this platform is provided for transparency purposes. Users are encouraged to cross-reference data points with official publication notices on the Telangana eProcurement portal.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'contact' && (
            <motion.div key="contact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 max-w-3xl mx-auto px-4 text-center">
              <Phone size={48} className="text-telangana-teal mb-8 mx-auto" />
              <h2 className="text-3xl font-black text-dark-charcoal mb-8 serif-font">Contact Us</h2>
              <p className="text-base font-bold text-medium-gray mb-12">Reach out to our engineering and research desk.</p>
              <div className="bg-off-white p-8 rounded-[24px] border border-steel-gray">
                <p className="text-xs font-black uppercase tracking-widest text-telangana-teal mb-2">Email</p>
                <p className="text-xl font-black text-dark-charcoal">ledger@manamap.org</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-dark-charcoal py-16 md:py-24 px-6 text-white overflow-hidden relative">
        <div className="max-w-[1500px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-20 mb-16 md:mb-24">
            <div className="col-span-1 sm:col-span-2">
              <div className="flex items-center gap-3 mb-8 md:mb-10">
                <div className="w-12 h-12 md:w-14 md:h-14 bg-telangana-teal rounded-2xl flex items-center justify-center text-white font-black text-2xl md:text-3xl">మ</div>
                <span className="font-black tracking-tight text-3xl md:text-4xl">ManaMap Ledger</span>
              </div>
              <p className="text-white/40 text-sm max-w-sm font-bold leading-relaxed">
                The public mapping dashboard for transparent government procurement in Telangana.
              </p>
            </div>
            
            <div className="space-y-6 md:space-y-8">
              <h5 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.4em] text-telangana-teal">Platform</h5>
              <div className="flex flex-col gap-4 md:gap-6">
                <button onClick={() => scrollToContent('explorer')} className="text-xs font-bold text-white/60 hover:text-white transition-colors text-left cursor-pointer">Ledger Map</button>
                <button onClick={() => scrollToContent('insights')} className="text-xs font-bold text-white/60 hover:text-white transition-colors text-left cursor-pointer">Analytics</button>
              </div>
            </div>

            <div className="space-y-6 md:space-y-8">
              <h5 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.4em] text-telangana-teal">Support & Policy</h5>
              <div className="flex flex-col gap-4 md:gap-6">
                <button onClick={() => scrollToContent('privacy')} className="text-xs font-bold text-white/60 hover:text-white transition-colors text-left cursor-pointer">Privacy Policy</button>
                <button onClick={() => scrollToContent('terms')} className="text-xs font-bold text-white/60 hover:text-white transition-colors text-left cursor-pointer">Terms of Service</button>
                <button onClick={() => scrollToContent('contact')} className="text-xs font-bold text-white/60 hover:text-white transition-colors text-left cursor-pointer">Contact Desk</button>
              </div>
            </div>
          </div>
          
          <div className="pt-12 md:pt-16 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-10 text-center md:text-left">
            <p className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.4em] md:tracking-[0.5em] text-white/10">
              మన మ్యాప్ — Built with Pride in Hyderabad
            </p>
            <div className="flex gap-6">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-telangana-teal" />
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </footer>

      {/* Split/Slide-over Project Insights Panel */}
      <AnimatePresence>
        {selectedProject && (
          <ProjectDashboard 
            project={selectedProject} 
            onClose={() => setSelectedProject(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
