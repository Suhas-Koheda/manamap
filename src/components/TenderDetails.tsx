import React from 'react';
import { TenderProject } from '../types';

interface TenderDetailsProps {
  tender: TenderProject | null;
  onClose: () => void;
}

export default function TenderDetails({ tender, onClose }: TenderDetailsProps) {
  if (!tender) return null;
  return (
    <div className="p-4 bg-white border border-steel-gray rounded-xl">
      <h3 className="font-bold text-dark-charcoal">{tender.title}</h3>
      <p className="text-xs text-medium-gray mt-1">Tender ID: {tender.id}</p>
    </div>
  );
}
