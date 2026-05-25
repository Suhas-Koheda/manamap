import React from 'react';
import { DISTRICTS } from '../constants';
import { Landmark, MapPin, BadgeIndianRupee, Activity, RefreshCw } from 'lucide-react';

interface FilterBarProps {
  selectedDistrict: string;
  onDistrictChange: (district: string) => void;
  selectedDepartment: string;
  onDepartmentChange: (dept: string) => void;
  selectedStatus: 'all' | 'open' | 'awarded' | 'completed';
  onStatusChange: (status: 'all' | 'open' | 'awarded' | 'completed') => void;
  minBudget: number;
  onMinBudgetChange: (val: number) => void;
  maxBudget: number;
  onMaxBudgetChange: (val: number) => void;
  onReset: () => void;
}

const DEPARTMENTS = [
  "Roads & Buildings (R&B)",
  "PRED (Panchayat Raj Engineering)",
  "GHMC (Greater Hyderabad Municipal Corporation)",
  "HMWS&SB (Water Supply & Sewerage)",
  "Irrigation & CAD",
  "TSEWIDC (Education Infrastructure)",
  "TSMSIDC (Medical Infrastructure)",
  "HMDA (Hyderabad Metropolitan Development Authority)"
];

export default function FilterBar({
  selectedDistrict,
  onDistrictChange,
  selectedDepartment,
  onDepartmentChange,
  selectedStatus,
  onStatusChange,
  minBudget,
  onMinBudgetChange,
  maxBudget,
  onMaxBudgetChange,
  onReset
}: FilterBarProps) {
  return (
    <div className="w-full bg-white/80 backdrop-blur-xl border border-steel-gray rounded-[24px] p-6 shadow-soft flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-telangana-teal uppercase tracking-[0.2em]">డేటా ఫిల్టర్లు (Filters)</span>
          <h3 className="text-lg font-black text-dark-charcoal tracking-tight">నివేదికల శోధన (Infrastructure Search)</h3>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-ash-gray hover:bg-steel-gray text-medium-gray hover:text-dark-charcoal transition-all text-[9px] font-black uppercase tracking-widest cursor-pointer"
        >
          <RefreshCw size={12} />
          రీసెట్ (Reset)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* District Selector */}
        <div className="flex flex-col gap-2 relative">
          <label className="text-[9px] font-black uppercase tracking-wider text-medium-gray flex items-center gap-1.5">
            <MapPin size={12} className="text-telangana-teal" />
            జిల్లా (District)
          </label>
          <div className="relative group">
            <select
              value={selectedDistrict}
              onChange={(e) => onDistrictChange(e.target.value)}
              className="w-full bg-off-white border border-steel-gray/80 pl-4 pr-10 py-3.5 rounded-xl outline-none appearance-none cursor-pointer focus:border-telangana-teal focus:ring-4 focus:ring-telangana-teal/5 transition-all text-xs font-bold text-charcoal"
            >
              <option value="">తెలంగాణ మొత్తం (All Telangana)</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-medium-gray text-[10px]">▼</div>
          </div>
        </div>

        {/* Department Selector */}
        <div className="flex flex-col gap-2 relative">
          <label className="text-[9px] font-black uppercase tracking-wider text-medium-gray flex items-center gap-1.5">
            <Landmark size={12} className="text-telangana-teal" />
            శాఖ (Department)
          </label>
          <div className="relative group">
            <select
              value={selectedDepartment}
              onChange={(e) => onDepartmentChange(e.target.value)}
              className="w-full bg-off-white border border-steel-gray/80 pl-4 pr-10 py-3.5 rounded-xl outline-none appearance-none cursor-pointer focus:border-telangana-teal focus:ring-4 focus:ring-telangana-teal/5 transition-all text-xs font-bold text-charcoal"
            >
              <option value="">అన్ని శాఖలు (All Departments)</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-medium-gray text-[10px]">▼</div>
          </div>
        </div>

        {/* Status Selector */}
        <div className="flex flex-col gap-2 relative">
          <label className="text-[9px] font-black uppercase tracking-wider text-medium-gray flex items-center gap-1.5">
            <Activity size={12} className="text-telangana-teal" />
            స్థితి (Status)
          </label>
          <div className="relative group">
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value as any)}
              className="w-full bg-off-white border border-steel-gray/80 pl-4 pr-10 py-3.5 rounded-xl outline-none appearance-none cursor-pointer focus:border-telangana-teal focus:ring-4 focus:ring-telangana-teal/5 transition-all text-xs font-bold text-charcoal"
            >
              <option value="all">అన్ని దశలు (All Statuses)</option>
              <option value="open">ఓపెన్ బిడ్స్ (Open Bids)</option>
              <option value="awarded">మంజూరైన పనులు (Awarded / Ongoing)</option>
              <option value="completed">పూర్తయినవి (Completed)</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-medium-gray text-[10px]">▼</div>
          </div>
        </div>

        {/* Budget Range Selector */}
        <div className="flex flex-col gap-2 relative">
          <label className="text-[9px] font-black uppercase tracking-wider text-medium-gray flex items-center gap-1.5">
            <BadgeIndianRupee size={12} className="text-telangana-teal" />
            బడ్జెట్ శ్రేణి (Budget in Lakhs)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                placeholder="Min Lakhs"
                value={minBudget || ''}
                onChange={(e) => onMinBudgetChange(Number(e.target.value))}
                className="w-full bg-off-white border border-steel-gray/80 px-3 py-3 rounded-xl outline-none text-xs font-bold text-charcoal focus:border-telangana-teal focus:ring-4 focus:ring-telangana-teal/5 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-medium-gray font-bold">L</span>
            </div>
            <div className="relative flex-1">
              <input
                type="number"
                placeholder="Max Lakhs"
                value={maxBudget || ''}
                onChange={(e) => onMaxBudgetChange(Number(e.target.value))}
                className="w-full bg-off-white border border-steel-gray/80 px-3 py-3 rounded-xl outline-none text-xs font-bold text-charcoal focus:border-telangana-teal focus:ring-4 focus:ring-telangana-teal/5 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-medium-gray font-bold">L</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
