'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { History, Database, Clock, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Dataset {
  _id: string;
  _creationTime: number;
  jobId: string;
  description: string;
  rows: number;
  format: string;
  status: string;
  progress: number;
  completedAt?: number;
}

interface DatasetHistoryProps {
  onSelectDataset: (dataset: Dataset) => void;
  refreshTrigger?: number;
}

export function DatasetHistory({ onSelectDataset }: DatasetHistoryProps) {
  // Use Convex real-time query - automatically updates when data changes
  const datasets = useQuery(api.datasets.getUserDatasets, { limit: 5 });
  const isLoading = datasets === undefined;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateDescription = (desc: string, maxLength: number = 35) => {
    return desc.length > maxLength ? desc.substring(0, maxLength) + '...' : desc;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-400';
      case 'failed':
        return 'bg-destructive';
      case 'generating':
      case 'planning':
        return 'bg-yellow-400';
      default:
        return 'bg-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg bg-card p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-lime" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <History className="h-4 w-4 text-lime" />
          History
        </div>
        {/* Real-time updates - no refresh needed */}
        <div className="text-xs text-muted-foreground font-mono">live</div>
      </div>

      {/* Content */}
      <div className="p-2">
        {!datasets || datasets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-mono">No datasets yet</p>
            <p className="text-xs mt-1">Generate your first one!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {datasets.map((dataset) => (
              <button
                key={dataset._id}
                onClick={() => onSelectDataset(dataset)}
                className="w-full text-left p-3 rounded-md hover:bg-muted/50 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(dataset.status)}`} />
                      <span className="text-sm font-medium text-foreground group-hover:text-lime transition-colors truncate">
                        {truncateDescription(dataset.description)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-xs font-mono text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(dataset._creationTime)}</span>
                      <span className="text-border">·</span>
                      <span>{dataset.rows.toLocaleString()}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-lime transition-colors flex-shrink-0 mt-0.5" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
