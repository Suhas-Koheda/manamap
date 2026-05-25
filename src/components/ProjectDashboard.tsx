import React, { useState } from 'react';
import { TenderProject } from '../types';
import { X, Building2, Calendar, MapPin, ExternalLink, BadgeIndianRupee, Code } from 'lucide-react';

interface ProjectDashboardProps {
  project: TenderProject | null;
  onClose: () => void;
}

export default function ProjectDashboard({ project, onClose }: ProjectDashboardProps) {
  const [showRaw, setShowRaw] = useState(false);

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
          <span className="text-[10px] font-black text-medium-gray uppercase tracking-widest mt-1">Tender ID: {project.id}</span>
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

        {/* Financial Info Card */}
        <div className="bg-off-white border border-steel-gray/60 p-5 rounded-xl flex flex-col">
          <span className="text-[9px] font-black text-medium-gray uppercase tracking-widest flex items-center gap-1 mb-2">
            <BadgeIndianRupee size={12} className="text-medium-gray" />
            Tender Value / Budget
          </span>
          <span className="text-2xl font-black text-dark-charcoal">{formatCurrency(project.tenderValue)}</span>
        </div>

        {/* Key Dates */}
        <div className="border border-steel-gray/60 rounded-xl p-4 space-y-3">
          <h3 className="text-[10px] font-black text-dark-charcoal uppercase tracking-widest border-b border-steel-gray/40 pb-2">ముఖ్యమైన తేదీలు (Important Dates)</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-medium-gray" />
              <div>
                <p className="text-[9px] uppercase tracking-wider text-medium-gray">Published</p>
                <p className="font-bold text-charcoal">
                  {project.publicationDate ? new Date(project.publicationDate).toLocaleDateString('en-IN') : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-medium-gray" />
              <div>
                <p className="text-[9px] uppercase tracking-wider text-medium-gray">Closing</p>
                <p className="font-bold text-charcoal">
                  {project.closingDate ? new Date(project.closingDate).toLocaleDateString('en-IN') : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Raw Payload Debugger / Citizen Transparency */}
        {project.rawPayload && (
          <div className="border border-steel-gray/60 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center justify-between w-full px-4 py-3 bg-off-white hover:bg-ash-gray transition-colors border-b border-steel-gray/60 text-left text-xs font-black uppercase tracking-widest text-dark-charcoal cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Code size={14} />
                Raw Portal Data (JSON Payload)
              </span>
              <span>{showRaw ? 'Hide' : 'Show'}</span>
            </button>
            {showRaw && (
              <pre className="p-4 bg-dark-charcoal text-white text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                {JSON.stringify(project.rawPayload, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* View PDF Button */}
        {project.pdfUrl && (
          <a
            href={project.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-4 bg-dark-charcoal hover:bg-charcoal text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer animate-pulse"
          >
            టెండర్ పత్రం (View Official PDF Document)
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
