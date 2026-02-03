'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Database, Clock, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Dataset } from '@/lib/supabase/types';

interface DatasetHistoryProps {
  onSelectDataset: (dataset: Dataset) => void;
  refreshTrigger?: number;
}

export function DatasetHistory({ onSelectDataset, refreshTrigger }: DatasetHistoryProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/history');
      if (response.ok) {
        const data = await response.json();
        setDatasets(data.datasets);
      } else if (response.status === 401) {
        setDatasets([]);
      } else {
        setError('Failed to load history');
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
      setError('Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateDescription = (desc: string, maxLength: number = 40) => {
    return desc.length > maxLength ? desc.substring(0, maxLength) + '...' : desc;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'generating':
      case 'planning':
        return 'text-yellow-500';
      default:
        return 'text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-2 border-purple-500/20">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-2 border-red-500/20">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchHistory}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-purple-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-purple-500" />
            Recent Datasets
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchHistory}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {datasets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No datasets yet. Generate your first one!
          </p>
        ) : (
          datasets.map((dataset) => (
            <button
              key={dataset.id}
              onClick={() => onSelectDataset(dataset)}
              className="w-full text-left p-3 rounded-lg border border-transparent hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-cyan-500 flex-shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {truncateDescription(dataset.description)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(dataset.created_at)}</span>
                    <span className="text-muted-foreground/50">|</span>
                    <span>{dataset.rows.toLocaleString()} rows</span>
                    <span className="text-muted-foreground/50">|</span>
                    <span className={getStatusColor(dataset.status)}>
                      {dataset.status}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-purple-500 transition-colors flex-shrink-0 mt-1" />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
