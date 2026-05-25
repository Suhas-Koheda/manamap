import { MapContainer, TileLayer, Marker, GeoJSON, useMapEvents, ZoomControl, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { TenderProject } from '../types';
import { useEffect, useState, useRef } from 'react';
import { Navigation, Building2, BadgeIndianRupee, ArrowRight } from 'lucide-react';

interface MapProps {
  projects: TenderProject[];
  onMarkerClick: (project: TenderProject) => void;
  onMapClick?: (lat: number, lng: number) => void;
  selectedDistrict: string | null;
}

const customIcon = (status: 'open' | 'awarded' | 'completed') => {
  let color = '#2196f3'; // Open (Blue)
  let isPulsing = false;
  
  if (status === 'awarded') {
    color = '#10b981'; // Awarded (Green)
    isPulsing = true;
  } else if (status === 'completed') {
    color = '#e63946'; // Completed (Red)
  }
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div class="relative flex items-center justify-center">
        ${isPulsing ? `<div class="absolute w-6 h-6 bg-success-green/40 rounded-full animate-ping"></div>` : ''}
        <div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3); z-index: 10;"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

function MapEventsHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  const map = useMapEvents({
    click: (e) => {
      if (onClick) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function Map({ projects, onMarkerClick, onMapClick, selectedDistrict }: MapProps) {
  const [districtsGeo, setDistrictsGeo] = useState<any>(null);
  const [boundaryGeo, setBoundaryGeo] = useState<any>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    // Load Telangana Districts
    fetch('https://raw.githubusercontent.com/HindustanTimesLabs/shapefiles/master/telangana/telangana_districts.json')
      .then(res => res.json())
      .then(data => setDistrictsGeo(data))
      .catch(err => console.error("Districts GeoJSON load failed", err));

    // Load Telangana Boundary
    fetch('https://raw.githubusercontent.com/HindustanTimesLabs/shapefiles/master/telangana/telangana.json')
      .then(res => res.json())
      .then(data => setBoundaryGeo(data))
      .catch(err => console.error("Boundary GeoJSON load failed", err));
  }, []);

  // Update styles when selectedDistrict changes without recreating the layer
  useEffect(() => {
    if (!geoJsonRef.current) return;

    geoJsonRef.current.eachLayer((layer: any) => {
      const props = layer.feature.properties;
      const name = props.district || props.name || "";
      const isSelected = selectedDistrict?.toLowerCase() === name.toLowerCase();

      if (isSelected) {
        layer.setStyle({
          color: "#00897b",
          weight: 4,
          fillOpacity: 0.25,
          fillColor: "#00897b"
        });
        layer.bringToFront();
        
        if (mapRef.current) {
          const bounds = layer.getBounds();
          mapRef.current.fitBounds(bounds, { padding: [50, 50], duration: 1.5 });
        }
      } else {
        layer.setStyle({
          color: "#ccc",
          weight: 1,
          fillOpacity: 0.05,
          fillColor: "transparent"
        });
      }
    });

    if (!selectedDistrict && mapRef.current) {
       mapRef.current.setView([17.85, 79.15], 7);
    }
  }, [selectedDistrict, districtsGeo]);

  const handleLocateMe = () => {
    if (mapRef.current) {
      mapRef.current.locate();
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 100) {
      return `₹${(amount / 100).toFixed(2)} Cr`;
    }
    return `₹${amount.toFixed(2)} L`;
  };

  return (
    <div className="w-full h-full relative group">
      <MapContainer 
        center={[17.85, 79.15]} 
        zoom={7} 
        className="w-full h-full"
        zoomControl={false}
        scrollWheelZoom={true}
        ref={(map) => { if (map) mapRef.current = map; }}
      >
        <TileLayer
          attribution='&copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <ZoomControl position="bottomright" />
        <MapEventsHandler onClick={onMapClick} />
        
        {/* Base Boundary Layer */}
        {boundaryGeo && (
          <GeoJSON 
            data={boundaryGeo} 
            style={{
              color: "#00897b",
              weight: 2.5,
              fillOpacity: 0,
              fillColor: "transparent"
            }}
            interactive={false}
          />
        )}

        {/* Districts Layer for Highlighting */}
        {districtsGeo && (
          <GeoJSON 
            data={districtsGeo} 
            ref={(ref) => { geoJsonRef.current = ref; }}
            style={{
              color: "#ccc",
              weight: 1,
              fillOpacity: 0.05,
              fillColor: "transparent"
            }}
          />
        )}

        {projects.map((proj) => {
          const lat = proj.location.latitude;
          const lng = proj.location.longitude;
          
          if (isNaN(lat) || isNaN(lng)) return null;

          return (
            <Marker
              key={proj.id}
              position={[lat, lng]}
              icon={customIcon(proj.status)}
            >
              <Popup className="custom-leaflet-popup">
                <div className="p-3 max-w-[280px] space-y-3 font-sans">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-dark-charcoal leading-snug line-clamp-2">
                      {proj.title}
                    </h4>
                    <p className="text-[9px] font-bold text-medium-gray tracking-wider uppercase">
                      Tender ID: {proj.tenderId}
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-1.5 border-t border-b border-steel-gray/60 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-charcoal font-bold">
                      <Building2 size={12} className="text-telangana-teal" />
                      <span className="truncate">{proj.department}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-charcoal font-bold">
                      <BadgeIndianRupee size={12} className="text-telangana-teal" />
                      <span>
                        Cost: {formatCurrency(proj.finalAwardAmount || proj.sanctionedAmount)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onMarkerClick(proj)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-telangana-teal hover:bg-action-teal text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm hover:shadow"
                  >
                    పూర్తి వివరాలు (View Details)
                    <ArrowRight size={10} />
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Locate Me Button Overlay */}
      <div className="absolute top-6 right-6 z-[1000]">
        <button 
          onClick={handleLocateMe}
          className="p-3 bg-white text-dark-charcoal rounded-2xl shadow-2xl hover:bg-telangana-teal hover:text-white transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest border border-steel-gray cursor-pointer"
        >
          <Navigation size={16} />
          నా స్థానం (Locate Me)
        </button>
      </div>

      {/* Mini Legend */}
      <div className="absolute bottom-6 left-6 z-[1000] pointer-events-none">
        <div className="bg-white/90 backdrop-blur-xl p-4 rounded-2xl shadow-xl border border-steel-gray flex flex-col gap-2">
           <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-explore-blue animate-pulse" />
             <span className="text-[9px] font-black uppercase tracking-widest text-medium-gray">ఓపెన్ బిడ్ (Open Bid)</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-success-green animate-pulse" />
             <span className="text-[9px] font-black uppercase tracking-widest text-medium-gray">మంజూరైన పని (Ongoing)</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full bg-civic-red" />
             <span className="text-[9px] font-black uppercase tracking-widest text-medium-gray">పూర్తయింది (Completed)</span>
           </div>
        </div>
      </div>
    </div>
  );
}

