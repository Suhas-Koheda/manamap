import { useState, useEffect, useRef, useMemo } from 'react';
import { db, initAuth } from './lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { TenderProject } from './types';
import Map from './components/Map';
import FilterBar from './components/FilterBar';
import ProjectDashboard from './components/ProjectDashboard';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, LayoutGrid, Info, Landmark, Shield, FileText, Phone, Building2, BadgeIndianRupee, Activity, MapPin } from 'lucide-react';

type TabType = 'explorer' | 'insights' | 'about' | 'privacy' | 'terms' | 'contact' | 'data';

export default function App() {
  const [projects, setProjects] = useState<TenderProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<TenderProject | null>(null);
  
  // Filter States
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'open' | 'awarded' | 'completed'>("all");
  const [minBudget, setMinBudget] = useState<number>(0);
  const [maxBudget, setMaxBudget] = useState<number>(0);
  
  const [activeTab, setActiveTab] = useState<TabType>('explorer');
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    initAuth();
    // Fetch all tender projects from Firestore
    const q = query(collection(db, 'projects'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => {
        const data = doc.data();
        const locationGeo = data.location;
        return {
          id: doc.id,
          ...data,
          location: {
            latitude: locationGeo?.latitude || 17.85,
            longitude: locationGeo?.longitude || 79.15
          }
        };
      }) as TenderProject[];
      setProjects(projectsData);
    }, (error) => {
      console.error("Error listening to projects collection:", error);
    });
    return () => unsubscribe();
  }, []);

  const handleResetFilters = () => {
    setSelectedDistrict("");
    setSelectedDepartment("");
    setSelectedStatus("all");
    setMinBudget(0);
    setMaxBudget(0);
  };

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesDistrict = !selectedDistrict || p.district === selectedDistrict;
      const matchesDepartment = !selectedDepartment || p.department === selectedDepartment;
      const matchesStatus = selectedStatus === 'all' || p.status === selectedStatus;
      
      const amount = p.sanctionedAmount;
      const matchesMinBudget = !minBudget || amount >= minBudget;
      const matchesMaxBudget = !maxBudget || amount <= maxBudget;
      
      return matchesDistrict && matchesDepartment && matchesStatus && matchesMinBudget && matchesMaxBudget;
    });
  }, [projects, selectedDistrict, selectedDepartment, selectedStatus, minBudget, maxBudget]);

  // Compute Statistics for Hero / Insights
  const stats = useMemo(() => {
    const totalCount = projects.length;
    const openCount = projects.filter(p => p.status === 'open').length;
    const activeCount = projects.filter(p => p.status === 'awarded').length;
    const completedCount = projects.filter(p => p.status === 'completed').length;
    
    const totalSanctionedValue = projects.reduce((sum, p) => sum + p.sanctionedAmount, 0);
    const activeProjectsRatio = totalCount > 0 ? Math.round(((activeCount + completedCount) / totalCount) * 100) : 100;

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
              onClick={() => scrollToContent('about')} 
              className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors cursor-pointer ${activeTab === 'about' ? 'text-telangana-teal' : 'text-medium-gray hover:text-dark-charcoal'}`}
            >
              మా గురించి (About)
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <a 
              href="https://tender.telangana.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-telangana-teal text-white rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-action-teal transition-all shadow-lg shadow-telangana-teal/20 active:scale-95 cursor-pointer"
            >
              <Landmark size={14} className="md:size-[16px]" strokeWidth={3} />
              <span>e-Procurement Portal</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Cinematic Hero Section */}
      <header className="relative h-[90vh] md:h-screen min-h-[600px] bg-hyd-night flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="/assets/hero-bg.png" 
            className="w-full h-full object-cover opacity-60 scale-105"
            alt="Telangana Infrastructure"
          />
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
              className="w-full sm:w-auto group px-10 md:px-12 py-5 md:py-6 bg-telangana-teal text-white rounded-2xl md:rounded-[24px] font-black text-xs md:text-sm tracking-widest uppercase shadow-2xl shadow-telangana-teal/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 cursor-pointer"
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
              <div className="w-14 h-14 rounded-2xl bg-telangana-teal/20 flex items-center justify-center border border-telangana-teal/30 shadow-inner shadow-telangana-teal/10">
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
                      <p className="text-xs font-bold text-medium-gray mt-1">Showing {filteredProjects.length} filtered projects</p>
                    </div>
                  </div>

                  {filteredProjects.length === 0 ? (
                    <div className="py-20 md:py-32 px-6 md:px-10 bg-off-white rounded-[32px] border-2 border-dashed border-steel-gray text-center">
                      <Landmark size={40} className="mx-auto mb-6 text-medium-gray" />
                      <h3 className="text-xl md:text-2xl font-black text-dark-charcoal mb-2 serif-font">ప్రాజెక్ట్‌లు కనుగొనబడలేదు...</h3>
                      <p className="text-medium-gray font-bold text-sm">No infrastructure projects match your filter criteria.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {filteredProjects.map((project) => (
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
                              <span className="text-[9px] font-bold text-medium-gray uppercase tracking-widest">{project.tenderId}</span>
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
                                {project.finalAwardAmount ? formatCurrency(project.finalAwardAmount) : formatCurrency(project.sanctionedAmount)}
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
                        projects={filteredProjects} 
                        onMarkerClick={setSelectedProject} 
                        selectedDistrict={selectedDistrict}
                      />
                    </div>
                    
                    <div className="hidden md:flex mt-8 p-6 bg-off-white rounded-[24px] border border-steel-gray gap-4 items-start">
                      <div className="w-10 h-10 rounded-xl bg-white border border-steel-gray flex items-center justify-center shrink-0">
                        <Info size={18} className="text-telangana-teal" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-dark-charcoal uppercase tracking-[0.1em] mb-1">డ్యాష్‌బోర్డ్ చిట్కా (Dashboard Guide)</h4>
                        <p className="text-[11px] font-bold text-medium-gray leading-relaxed">
                          Click map markers to preview tender details. Toggle status, departments, and budget ranges to analyze procurement trends.
                        </p>
                      </div>
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
                     const deptBudget = deptProjects.reduce((sum, p) => sum + p.sanctionedAmount, 0);
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
                  <p>By compiling data from the Telangana eProcurement and Central CPPP platforms, we empower citizens, researchers, and administrators with clear spatial visualization, contractor portfolios, and AI summaries of engineering projects.</p>
               </div>
            </motion.div>
          )}

          {activeTab === 'privacy' && (
            <motion.div key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 max-w-3xl mx-auto px-4">
              <Shield size={48} className="text-telangana-teal mb-8" />
              <h2 className="text-3xl font-black text-dark-charcoal mb-8 serif-font">Privacy Policy</h2>
              <div className="space-y-6 text-medium-gray font-bold text-sm leading-relaxed">
                <p>ManaMap is dedicated to open transparency. All data presented on this platform is retrieved from public procurement logs and government websites.</p>
                <p>We do not collect personal information from visitors, and all geolocation structures are mapped according to official project boundaries.</p>
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
