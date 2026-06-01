import { useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";

interface IntegrationSourcePickerProps {
  provider: string;
  providerName: string;
  isConnected: boolean;
  onConnect: () => void;
  onSelectSource: (url: string, metadata?: Record<string, unknown>) => void;
  isIngesting: boolean;
  searchPlaceholder?: string;
  helperText?: string;
}

type SourceResult = {
  id: string;
  name: string;
  url: string;
  metadata?: Record<string, unknown>;
};

export function IntegrationSourcePicker({
  provider,
  providerName,
  isConnected,
  onConnect,
  onSelectSource,
  isIngesting,
  searchPlaceholder,
  helperText,
}: IntegrationSourcePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SourceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourceResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const endpoint = `/api/integrations/${provider}/search/?q=${encodeURIComponent(searchQuery)}`;
      const results = await api.get<SourceResult[]>(endpoint);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (source: SourceResult) => {
    setSelectedSource(source);
  };

  const handleIngest = () => {
    if (selectedSource) {
      onSelectSource(selectedSource.url, selectedSource.metadata);
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--text-muted)] mb-4">
          Connect your {providerName} account to import content
        </p>
        <button
          onClick={onConnect}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent)]/90 transition-colors"
        >
          Connect {providerName}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {helperText && (
        <p className="text-xs text-[var(--text-muted)]">
          {helperText}
        </p>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={searchPlaceholder || `Search ${providerName}...`}
            className="w-full px-4 py-2 pl-9 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching || !searchQuery.trim()}
          className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-24 flex items-center justify-center gap-2"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </button>
      </div>

      {searchError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {searchResults.map((source) => (
            <div
              key={source.id}
              onClick={() => handleSelect(source)}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                selectedSource?.id === source.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border-subtle)] hover:border-[var(--accent)]/50"
              }`}
            >
              <p className="font-medium text-[var(--text-primary)]">{source.name}</p>
              <p className="text-sm text-[var(--text-muted)] truncate">{source.url || 'No public URL returned'}</p>
            </div>
          ))}
        </div>
      )}

      {searchResults.length === 0 && searchQuery && !isSearching && (
        <p className={'text-center text-[var(--text-muted)] py-4'}>
          No results found for {searchQuery}
        </p>
      )}

      {/* Selected source and ingest button */}
      {selectedSource && (
        <div className="border-t border-[var(--border-subtle)] pt-4">
          <div className="mb-3 p-3 bg-[var(--bg-900)] rounded-lg">
            <p className="text-sm text-[var(--text-muted)]">Selected:</p>
            <p className="font-medium text-[var(--text-primary)]">{selectedSource.name}</p>
          </div>
          <button
            onClick={handleIngest}
            disabled={isIngesting || !selectedSource.url}
            className="w-full px-4 py-3 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isIngesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ingesting...
              </>
            ) : (
              <>
                Import to Wiki
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
