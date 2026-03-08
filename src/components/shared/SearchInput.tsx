'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { Spinner } from './Spinner';

interface SearchResult {
  symbol: string;
  displayName: string;
  instrumentId: number;
}

interface SearchInputProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ onSearch, onSelect, placeholder = 'Search...', className }: SearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await onSearch(q);
      setResults(res);
      setShowDropdown(res.length > 0);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [onSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
  };

  const handleSelect = (result: SearchResult) => {
    onSelect(result);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div className="relative">
        <svg 
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
          style={{ color: 'var(--text-secondary)' }}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg focus:outline-none focus:ring-1"
          style={{
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size="sm" />
          </div>
        )}
      </div>

      {showDropdown && (
        <div 
          className="absolute z-20 w-full mt-1 rounded-lg shadow-lg max-h-48 overflow-y-auto"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          {results.map((r) => (
            <button
              key={r.instrumentId}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 last:border-0"
              style={{
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span className="font-medium">{r.symbol}</span>
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{r.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
