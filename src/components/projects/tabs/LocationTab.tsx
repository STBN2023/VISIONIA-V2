import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Navigation,
  LocateFixed,
  Copy,
  ExternalLink,
  Search,
  Loader2,
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon (Leaflet + bundler issue)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// --- Types ---

export type LatLng = { lat: number; lng: number };

type Props = {
  address: string;
  coordinates?: LatLng | null;
  onCoordinatesChange: (coords: LatLng) => void;
};

// --- Geocoding via Nominatim (free, no API key) ---

async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  if (!address.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      address
    )}&limit=1&addressdetails=1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "ISOEDRE-App/1.0" },
    });
    const data = await resp.json();
    if (data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
  }
}

// --- User position marker icon ---

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;background:#3B82F6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.6);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// --- Main component ---

const LocationTab = ({ address, coordinates, onCoordinatesChange }: Props) => {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const defaultCenter: LatLng = { lat: 46.603354, lng: 1.888334 };
  const center = coordinates || defaultCenter;
  const defaultZoom = coordinates ? 16 : 6;

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(
      [center.lat, center.lng],
      defaultZoom
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;

    // Add project marker if coordinates exist
    if (coordinates) {
      markerRef.current = L.marker([coordinates.lat, coordinates.lng])
        .addTo(map)
        .bindPopup(address || "Chantier");
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      userMarkerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update project marker when coordinates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (coordinates) {
      if (markerRef.current) {
        markerRef.current.setLatLng([coordinates.lat, coordinates.lng]);
      } else {
        markerRef.current = L.marker([coordinates.lat, coordinates.lng]).addTo(
          map
        );
      }
      markerRef.current.bindPopup(
        `<div style="font-weight:600">${address || "Chantier"}</div>${
          resolvedAddress
            ? `<div style="font-size:11px;color:#666;margin-top:4px">${resolvedAddress}</div>`
            : ""
        }`
      );
      map.flyTo([coordinates.lat, coordinates.lng], 16, { duration: 1.2 });
    }
  }, [coordinates, address, resolvedAddress]);

  // Update user marker when user position changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPosition) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userPosition.lat, userPosition.lng]);
    } else {
      userMarkerRef.current = L.marker([userPosition.lat, userPosition.lng], {
        icon: userIcon,
      })
        .addTo(map)
        .bindPopup("Votre position");
    }
  }, [userPosition]);

  // Calculate distance
  useEffect(() => {
    if (!coordinates || !userPosition) {
      setDistance(null);
      return;
    }
    const from = L.latLng(userPosition.lat, userPosition.lng);
    const to = L.latLng(coordinates.lat, coordinates.lng);
    setDistance(from.distanceTo(to));
  }, [coordinates, userPosition]);

  // Auto-geocode on mount if no coordinates
  useEffect(() => {
    if (coordinates || !address) return;
    let cancelled = false;
    setIsGeocoding(true);
    geocodeAddress(address).then((result) => {
      if (cancelled) return;
      setIsGeocoding(false);
      if (result) {
        onCoordinatesChange({ lat: result.lat, lng: result.lng });
        setResolvedAddress(result.displayName);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim() || address;
    if (!query) return;
    setIsGeocoding(true);
    const result = await geocodeAddress(query);
    setIsGeocoding(false);
    if (result) {
      onCoordinatesChange({ lat: result.lat, lng: result.lng });
      setResolvedAddress(result.displayName);
      showSuccess("Localisation trouvée");
    } else {
      showError("Adresse introuvable. Essayez avec plus de détails.");
    }
  }, [searchQuery, address, onCoordinatesChange]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      showError("La géolocalisation n'est pas supportée par votre navigateur.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPosition(coords);
        setIsLocating(false);
        showSuccess("Position actuelle détectée");
      },
      (err) => {
        setIsLocating(false);
        showError(
          err.code === 1
            ? "Accès à la géolocalisation refusé."
            : "Impossible de déterminer votre position."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleCopyCoords = useCallback(() => {
    if (!coordinates) return;
    navigator.clipboard.writeText(
      `${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`
    );
    showSuccess("Coordonnées copiées");
  }, [coordinates]);

  const googleMapsUrl = useMemo(() => {
    if (!coordinates) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}`;
  }, [coordinates]);

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Search bar */}
      <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-white/50" />
            <Input
              placeholder={address || "Rechercher une adresse..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              className="bg-white/10 text-white placeholder:text-white/40"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={isGeocoding}
            className="backdrop-blur-sm"
          >
            {isGeocoding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="mr-2 h-4 w-4" />
            )}
            Localiser
          </Button>
          <Button
            variant="outline"
            onClick={handleLocateMe}
            disabled={isLocating}
            className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
          >
            {isLocating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="mr-2 h-4 w-4" />
            )}
            Ma position
          </Button>
        </CardContent>
      </Card>

      {/* Map */}
      <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl overflow-hidden">
        <div
          ref={mapContainerRef}
          className="h-[400px] w-full"
          style={{ zIndex: 0 }}
        />
      </Card>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Project location info */}
        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5 text-red-400" />
              Localisation du chantier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {address ? (
              <div>
                <p className="text-xs text-white/50 uppercase font-semibold mb-1">
                  Adresse
                </p>
                <p className="text-sm font-medium">{address}</p>
              </div>
            ) : (
              <p className="text-sm text-white/50 italic">
                Aucune adresse renseignée. Allez dans l'onglet Infos pour en
                ajouter une.
              </p>
            )}

            {coordinates && (
              <div>
                <p className="text-xs text-white/50 uppercase font-semibold mb-1">
                  Coordonnées GPS
                </p>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-white/10 px-2 py-1 text-xs font-mono">
                    {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 hover:bg-white/10"
                    onClick={handleCopyCoords}
                    title="Copier les coordonnées"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {resolvedAddress && resolvedAddress !== address && (
              <div>
                <p className="text-xs text-white/50 uppercase font-semibold mb-1">
                  Adresse résolue
                </p>
                <p className="text-xs text-white/70">{resolvedAddress}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation & distance */}
        <Card className="rounded-2xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Navigation className="h-5 w-5 text-blue-400" />
              Navigation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {distance !== null && (
              <div className="flex items-center gap-3">
                <Badge
                  variant="secondary"
                  className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-lg px-4 py-1"
                >
                  {formatDistance(distance)}
                </Badge>
                <span className="text-xs text-white/50">
                  entre votre position et le chantier
                </span>
              </div>
            )}

            {userPosition && !coordinates && (
              <p className="text-sm text-white/50 italic">
                Localisez d'abord le chantier pour calculer la distance.
              </p>
            )}

            {!userPosition && coordinates && (
              <p className="text-sm text-white/50 italic">
                Cliquez sur "Ma position" pour calculer la distance.
              </p>
            )}

            {!userPosition && !coordinates && (
              <p className="text-sm text-white/50 italic">
                Localisez le chantier et votre position pour calculer la
                distance.
              </p>
            )}

            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ouvrir l'itinéraire (Google Maps)
                </Button>
              </a>
            )}

            {coordinates && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button
                  variant="outline"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Voir sur OpenStreetMap
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LocationTab;
