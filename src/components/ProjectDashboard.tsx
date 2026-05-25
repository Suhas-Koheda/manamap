import React, { useEffect, useState } from 'react';
import { TenderProject, Contractor } from '../types';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { summarizeProjectDescription } from '../services/geminiService';
import { X, Building2, Sparkles, Calendar, MapPin, ExternalLink, BadgeIndianRupee, Briefcase, Award, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProjectDashboardProps {
  project: TenderProject | null;
  onClose: () => void;
}

export default function ProjectDashboard({ project, onClose }: ProjectDashboardProps) {
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [contractorProjects, setContractorProjects] = useState<TenderProject[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [summarizing, setSummarizing] = useState(false);
  const [loadingContractor, setLoadingContractor] = useState(false);
  const [showContractorProfile, setShowContractorProfile] = useState(false);

  useEffect(() => {
    if (!project) {
      setContractor(null);
      setContractorProjects([]);
      setSummary('');
      setShowContractorProfile(false);
      return;
    }

    // Set initial summary if already present
    if (project.summary) {
      setSummary(project.summary);
    } else {
      // Auto-trigger summarization
      triggerSummarization(project.title);
    }

    // Fetch Contractor details
    if (project.winningContractorId) {
      fetchContractorDetails(project.winningContractorId);
    } else {
      setContractor(null);
      setContractorProjects([]);
    }
  }, [project]);

  const triggerSummarization = async (rawText: string) => {
    setSummarizing(true);
    try {
      const summaryText = await summarizeProjectDescription(rawText);
      setSummary(summaryText);
    } catch (error) {
      console.error("Failed to summarize:", error);
      setSummary("Could not generate summary.");
    } finally {
      setSummarizing(false);
    }
  };

  const fetchContractorDetails = async (contractorId: string) => {
    setLoadingContractor(true);
    try {
      const docRef = doc(db, 'contractors', contractorId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const contractorData = { id: docSnap.id, ...docSnap.data() } as Contractor;
        setContractor(contractorData);

        // Fetch other projects won by this contractor
        const q = query(
          collection(db, 'projects'),
          where('winningContractorId', '==', contractorId)
        );
        const querySnapshot = await getDocs(q);
        const projectsData: TenderProject[] = [];
        querySnapshot.forEach((d) => {
          if (d.id !== project?.id) {
            projectsData.push({ id: d.id, ...d.data() } as TenderProject);
          }
        });
        setContractorProjects(projectsData);
      }
    } catch (error) {
      console.error("Error fetching contractor details:", error);
    } finally {
      setLoadingContractor(false);
    }
  };

  if (!project) return null;

  // Formatting currency
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
    open: 'ఓపెన్ బిడ్ (Open Bid)',
    awarded: 'మంజూరైన పని (Awarded / In-Progress)',
    completed: 'పూర్తయింది (Completed)'
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[3000] w-full max-w-xl bg-white shadow-2xl flex flex-col border-l border-steel-gray overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-steel-gray flex items-center justify-between bg-off-white">
        <div className="flex flex-col gap-1">
          <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full border w-fit ${statusColors[project.status]}`}>
            {statusLabels[project.status]}
          </span>
          <span className="text-[10px] font-black text-medium-gray uppercase tracking-widest mt-1">Tender ID: {project.tenderId}</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-steel-gray text-charcoal hover:text-dark-charcoal transition-all cursor-pointer"
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Title and Department */}
        <div className="space-y-3">
          <h2 className="text-xl md:text-2xl font-black text-dark-charcoal leading-tight serif-font">
            {project.title}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-medium-gray">
            <span className="flex items-center gap-1.5 bg-ash-gray px-3 py-1.5 rounded-lg">
              <Building2 size={14} className="text-telangana-teal" />
              {project.department}
            </span>
            <span className="flex items-center gap-1.5 bg-ash-gray px-3 py-1.5 rounded-lg">
              <MapPin size={14} className="text-telangana-teal" />
              {project.district}
            </span>
          </div>
        </div>

        {/* AI Citizen Summary Card */}
        <div className="bg-gradient-to-br from-telangana-teal/5 to-action-teal/5 border border-telangana-teal/15 p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Sparkles size={40} className="text-telangana-teal" />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1 bg-telangana-teal/10 rounded-lg">
              <Sparkles size={16} className="text-telangana-teal" />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-telangana-teal">సామాన్యుడి సారాంశం (AI Citizen Summary)</h3>
          </div>
          {summarizing ? (
            <div className="space-y-2 animate-pulse py-2">
              <div className="h-3.5 bg-telangana-teal/10 rounded-full w-full"></div>
              <div className="h-3.5 bg-telangana-teal/10 rounded-full w-[85%]"></div>
            </div>
          ) : (
            <p className="text-[13px] font-semibold text-charcoal leading-relaxed">
              {summary || "No AI summary available for this contract."}
            </p>
          )}
        </div>

        {/* Financial Info Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-off-white border border-steel-gray/60 p-4 rounded-xl flex flex-col">
            <span className="text-[9px] font-black text-medium-gray uppercase tracking-widest flex items-center gap-1 mb-2">
              <BadgeIndianRupee size={12} className="text-medium-gray" />
              Sanctioned Cost
            </span>
            <span className="text-lg font-black text-dark-charcoal">{formatCurrency(project.sanctionedAmount)}</span>
          </div>
          <div className="bg-off-white border border-steel-gray/60 p-4 rounded-xl flex flex-col">
            <span className="text-[9px] font-black text-medium-gray uppercase tracking-widest flex items-center gap-1 mb-2">
              <Award size={12} className="text-medium-gray" />
              Awarded Value
            </span>
            <span className="text-lg font-black text-dark-charcoal">
              {project.finalAwardAmount ? formatCurrency(project.finalAwardAmount) : 'Pending Bidding'}
            </span>
          </div>
        </div>

        {/* Key Dates */}
        <div className="border border-steel-gray/60 rounded-xl p-4 space-y-3">
          <h3 className="text-[10px] font-black text-dark-charcoal uppercase tracking-widest border-b border-steel-gray/40 pb-2">ముఖ్యమైన తేదీలు (Important Dates)</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-medium-gray" />
              <div>
                <p className="text-[9px] uppercase tracking-wider text-medium-gray">Published</p>
                <p className="font-bold text-charcoal">{new Date(project.publicationDate).toLocaleDateString('en-IN')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-medium-gray" />
              <div>
                <p className="text-[9px] uppercase tracking-wider text-medium-gray">Closing</p>
                <p className="font-bold text-charcoal">{new Date(project.closingDate).toLocaleDateString('en-IN')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bill of Quantities (BOQ) Breakdown */}
        {project.boqSummary && project.boqSummary.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-dark-charcoal uppercase tracking-widest flex items-center gap-1.5">
              <ListChecks size={14} className="text-telangana-teal" />
              BOQ వివరాలు (Bill of Quantities Estimated Cost Breakdown)
            </h3>
            <div className="space-y-3">
              {project.boqSummary.map((item, idx) => {
                const totalCost = project.boqSummary.reduce((sum, i) => sum + i.estimatedCost, 0);
                const percentage = totalCost > 0 ? (item.estimatedCost / totalCost) * 100 : 0;
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-charcoal pr-4 truncate">{item.material}</span>
                      <span className="text-dark-charcoal shrink-0">{formatCurrency(item.estimatedCost)}</span>
                    </div>
                    <div className="h-2 w-full bg-ash-gray rounded-full overflow-hidden">
                      <div
                        className="h-full bg-telangana-teal/70 rounded-full"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Awarded Contractor Section */}
        {project.winningContractorId ? (
          <div className="border border-steel-gray/60 rounded-xl p-5 bg-off-white/40 space-y-4">
            <h3 className="text-[10px] font-black text-dark-charcoal uppercase tracking-widest">గుత్తేదారు వివరాలు (Winning Contractor)</h3>
            {loadingContractor ? (
              <div className="animate-pulse flex items-center gap-4">
                <div className="w-12 h-12 bg-steel-gray rounded-xl"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-steel-gray rounded w-2/3"></div>
                  <div className="h-3.5 bg-steel-gray rounded w-1/2"></div>
                </div>
              </div>
            ) : contractor ? (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white border border-steel-gray rounded-xl flex items-center justify-center text-telangana-teal shadow-sm shrink-0">
                    <Briefcase size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-sm text-dark-charcoal leading-tight truncate">{contractor.companyName}</h4>
                    <p className="text-[10px] font-semibold text-medium-gray mt-1">CIN: {contractor.cinNumber}</p>
                    <p className="text-[10px] font-semibold text-medium-gray mt-0.5">Rating: Class {contractor.classRating}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowContractorProfile(true)}
                  className="w-full text-center py-2.5 bg-white hover:bg-ash-gray text-telangana-teal border border-steel-gray rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm hover:shadow"
                >
                  మినీ పోర్ట్‌ఫోలియో (View Mini Profile)
                </button>
              </div>
            ) : (
              <p className="text-xs font-bold text-medium-gray">Contractor details not found.</p>
            )}
          </div>
        ) : (
          <div className="p-4 bg-ash-gray border border-dashed border-steel-gray rounded-xl text-center">
            <p className="text-xs font-bold text-medium-gray">Bidding is currently open. Contractor has not been awarded yet.</p>
          </div>
        )}

        {/* View PDF Button */}
        {project.pdfUrl && (
          <a
            href={project.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-4 bg-dark-charcoal hover:bg-charcoal text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer"
          >
            టెండర్ పత్రం (View Official PDF Document)
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Mini Contractor Profile Slide-Over/Modal */}
      <AnimatePresence>
        {showContractorProfile && contractor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[4000] bg-white flex flex-col"
          >
            <div className="px-6 py-5 border-b border-steel-gray flex items-center justify-between bg-off-white">
              <div className="flex items-center gap-2">
                <Briefcase className="text-telangana-teal" size={18} />
                <h3 className="text-xs font-black uppercase tracking-widest text-dark-charcoal">గుత్తేదారు పోర్ట్‌ఫోలియో (Contractor Profile)</h3>
              </div>
              <button
                onClick={() => setShowContractorProfile(false)}
                className="p-2 rounded-full hover:bg-steel-gray text-charcoal hover:text-dark-charcoal transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-gradient-to-r from-dark-charcoal to-charcoal text-white p-6 rounded-2xl shadow-xl">
                <h4 className="text-lg font-black leading-tight mb-2">{contractor.companyName}</h4>
                <p className="text-[10px] font-bold text-white/50 tracking-widest uppercase">CIN: {contractor.cinNumber}</p>
                <div className="mt-4 flex gap-4 text-xs">
                  <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/10">
                    Rating: <span className="font-bold">Class {contractor.classRating}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-off-white border border-steel-gray/60 p-4 rounded-xl text-center">
                  <p className="text-[9px] font-black text-medium-gray uppercase tracking-widest mb-1">Total Won Value</p>
                  <p className="text-xl font-black text-telangana-teal">{formatCurrency(contractor.totalWonValue)}</p>
                </div>
                <div className="bg-off-white border border-steel-gray/60 p-4 rounded-xl text-center">
                  <p className="text-[9px] font-black text-medium-gray uppercase tracking-widest mb-1">Active Projects</p>
                  <p className="text-xl font-black text-charcoal">{contractor.activeProjectsCount}</p>
                </div>
              </div>

              {/* Other Projects Won */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-dark-charcoal uppercase tracking-widest border-b border-steel-gray/40 pb-2">
                  మరిన్ని ప్రభుత్వ పనులు (Other Gov Projects Won)
                </h4>
                {contractorProjects.length === 0 ? (
                  <p className="text-xs font-bold text-medium-gray italic">No other projects found for this contractor in the ledger.</p>
                ) : (
                  <div className="space-y-3">
                    {contractorProjects.map((p) => (
                      <div key={p.id} className="p-4 border border-steel-gray/60 rounded-xl bg-white space-y-2">
                        <div className="flex justify-between items-start gap-4">
                          <h5 className="font-bold text-xs text-dark-charcoal line-clamp-2">{p.title}</h5>
                          <span className="text-xs font-black text-telangana-teal shrink-0">
                            {p.finalAwardAmount ? formatCurrency(p.finalAwardAmount) : formatCurrency(p.sanctionedAmount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-medium-gray font-bold">
                          <span>{p.department}</span>
                          <span className="uppercase">{p.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
