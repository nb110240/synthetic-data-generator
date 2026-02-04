"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  FileText,
  Database,
  FileCode,
  BookOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  Table,
  MessageSquare,
  Send,
  FileJson,
  FileSpreadsheet,
  File,
  Eye,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Zap,
  Terminal,
  Boxes,
  Shield,
  Shuffle,
  Rows3,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LoginForm } from "@/components/auth/login-form";
import { UserMenu } from "@/components/auth/user-menu";
import { DatasetHistory } from "@/components/dataset-history";

// Dataset type from Convex
interface Dataset {
  _id: string;
  _creationTime: number;
  jobId: string;
  description: string;
  rows: number;
  format: string;
  seed?: number;
  options?: Record<string, unknown>;
  status: string;
  progress: number;
  completedAt?: number;
}

interface JobStatus {
  jobId: string;
  status: "queued" | "planning" | "generating" | "validating" | "completed" | "failed";
  progress: number;
  error?: string;
  files?: {
    data: string;
    schema: string;
    metadata: string;
    readme: string;
  };
  schema?: {
    name: string;
    description: string;
    tables: Array<{
      name: string;
      description: string;
      rowCount: number;
      columns: Array<{
        name: string;
        type: string;
        description: string;
      }>;
    }>;
  };
}

interface DataPreview {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_PROMPTS = [
  {
    title: "E-commerce",
    description: "Customers, orders, products with purchase patterns",
    prompt: "Create a Kaggle-style e-commerce dataset with customers, products, and orders. Include realistic purchase patterns, customer segments (premium/standard/budget), and seasonal variation in orders. About 10,000 orders total.",
    tag: "RETAIL",
  },
  {
    title: "User Analytics",
    description: "SaaS engagement, cohorts, churn indicators",
    prompt: "Generate a SaaS user analytics dataset with user registrations, daily active usage, feature adoption, and churn indicators. Include realistic cohort behavior and power-law distribution of engagement.",
    tag: "SAAS",
  },
  {
    title: "IoT Sensors",
    description: "Time-series with diurnal patterns, anomalies",
    prompt: "Create IoT sensor data from 10 temperature and humidity sensors over 30 days. Include realistic diurnal patterns, sensor drift, occasional anomalies (2%), and a few sensor failures.",
    tag: "IOT",
  },
  {
    title: "Financial",
    description: "Transactions with fraud indicators, spending patterns",
    prompt: "Generate a financial transactions dataset with account IDs, transaction amounts, categories, and timestamps. Include realistic spending patterns, a 0.5% fraud rate, and proper distribution of transaction amounts.",
    tag: "FINTECH",
  },
];

export function DatasetGenerator() {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();

  const [description, setDescription] = useState("");
  const [rows, setRows] = useState(1000);
  const [format, setFormat] = useState<"csv" | "json" | "parquet">("csv");
  const [seed, setSeed] = useState<number | undefined>();
  const [includeEdgeCases, setIncludeEdgeCases] = useState(true);
  const [privacyLevel, setPrivacyLevel] = useState<"low" | "medium" | "high">("medium");

  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dataPreview, setDataPreview] = useState<DataPreview | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [showLoginForm, setShowLoginForm] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const handleSelectDataset = (dataset: Dataset) => {
    setDescription(dataset.description);
    setRows(dataset.rows);
    setFormat(dataset.format as "csv" | "json" | "parquet");
    setSeed(dataset.seed ?? undefined);
    if (dataset.options) {
      const opts = dataset.options as Record<string, unknown>;
      if (typeof opts.includeEdgeCases === "boolean") {
        setIncludeEdgeCases(opts.includeEdgeCases);
      }
      if (opts.privacyLevel === "low" || opts.privacyLevel === "medium" || opts.privacyLevel === "high") {
        setPrivacyLevel(opts.privacyLevel);
      }
    }
    setJobStatus(null);
    setDataPreview(null);
    setChatMessages([]);
    setError(null);
  };

  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/status/${jobId}`);
      const status: JobStatus = await response.json();
      setJobStatus(status);

      if (status.status !== "completed" && status.status !== "failed") {
        setTimeout(() => pollJobStatus(jobId), 1000);
      } else {
        setIsGenerating(false);
        if (status.status === "completed" && status.schema?.tables?.[0]) {
          setSelectedTable(status.schema.tables[0].name);
          loadDataPreview(jobId, status.schema.tables[0].name);
          if (isAuthenticated) {
            setHistoryRefreshTrigger((prev) => prev + 1);
          }
        }
      }
    } catch {
      setError("Failed to check job status");
      setIsGenerating(false);
    }
  }, [isAuthenticated]);

  const loadDataPreview = async (jobId: string, tableName: string) => {
    setIsLoadingPreview(true);
    try {
      const response = await fetch(`/api/preview/${jobId}?table=${tableName}&limit=10&offset=${previewPage * 10}`);
      if (response.ok) {
        const preview = await response.json();
        setDataPreview(preview);
      }
    } catch (err) {
      console.error("Failed to load preview:", err);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError("Please enter a dataset description");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setJobStatus(null);
    setDataPreview(null);
    setChatMessages([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          rows,
          format,
          seed,
          options: {
            includeEdgeCases,
            privacyLevel,
            nullPercentage: 0.02,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || "Generation failed");
      }

      pollJobStatus(result.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setIsGenerating(false);
    }
  };

  const handleDownload = async (fileType: "data" | "schema" | "metadata" | "readme", downloadFormat?: string) => {
    if (!jobStatus?.files) return;
    let url = jobStatus.files[fileType];
    if (downloadFormat && fileType === "data") {
      url += `?format=${downloadFormat}`;
    }
    window.open(url, "_blank");
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !jobStatus?.jobId) return;

    const userMessage = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: jobStatus.jobId,
          instruction: userMessage,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.message || "Dataset updated successfully!" },
        ]);
        if (selectedTable) {
          loadDataPreview(jobStatus.jobId, selectedTable);
        }
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${result.error || "Failed to modify dataset"}` },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to process your request." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleExampleClick = (prompt: string) => {
    setDescription(prompt);
  };

  const getStatusText = () => {
    if (!jobStatus) return "";
    switch (jobStatus.status) {
      case "queued": return "INITIALIZING";
      case "planning": return "DESIGNING SCHEMA";
      case "generating": return "GENERATING DATA";
      case "validating": return "VALIDATING OUTPUT";
      case "completed": return "COMPLETE";
      case "failed": return "FAILED";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-background grid-pattern noise">
      {/* Ambient glow at top */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,_hsla(68,100%,50%,0.08)_0%,_transparent_70%)] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-lime/10 border border-lime/30 flex items-center justify-center">
              <Terminal className="h-4 w-4 text-lime" />
            </div>
            <span className="font-semibold tracking-tight hidden sm:inline">
              <span className="text-lime">synth</span>
              <span className="text-muted-foreground">.data</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {isAuthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-lime" />
            ) : isAuthenticated ? (
              <UserMenu user={user ?? undefined} />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLoginForm(true)}
                className="border-border hover:border-lime/50 hover:bg-lime/5 text-foreground"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Login Modal */}
      {showLoginForm && !isAuthenticated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <LoginForm onClose={() => setShowLoginForm(false)} />
        </div>
      )}

      <main className="container mx-auto max-w-7xl px-6 py-12">
        {/* Hero Section */}
        <div className="mb-16 animate-in">
          <div className="flex items-center gap-3 mb-6">
            <span className="px-3 py-1 text-xs font-mono font-medium bg-lime/10 text-lime border border-lime/20 rounded">
              v1.0
            </span>
            <span className="text-sm text-muted-foreground">Privacy-safe synthetic data generation</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="text-foreground">Generate</span>
            <br />
            <span className="text-lime glow-lime-text">realistic data</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            Describe your dataset in plain English. Get production-ready synthetic data
            for ML training, testing, and demos—without privacy concerns.
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* History Sidebar */}
          {isAuthenticated && (
            <aside className="lg:col-span-3 order-last lg:order-first animate-in delay-100">
              <div className="sticky top-24">
                <DatasetHistory
                  onSelectDataset={handleSelectDataset}
                  refreshTrigger={historyRefreshTrigger}
                />
              </div>
            </aside>
          )}

          {/* Main Content */}
          <div className={`${isAuthenticated ? "lg:col-span-6" : "lg:col-span-8"} space-y-8 animate-in delay-200`}>
            {/* Input Terminal */}
            <div className="border border-border rounded-lg overflow-hidden card-hover">
              <div className="terminal-header">
                <div className="terminal-dot terminal-dot-red" />
                <div className="terminal-dot terminal-dot-yellow" />
                <div className="terminal-dot terminal-dot-green" />
                <span className="ml-4 text-xs font-mono text-muted-foreground">dataset.prompt</span>
              </div>
              <div className="p-6 bg-card">
                <Textarea
                  placeholder="Describe the dataset you need...

Example: Create an e-commerce dataset with customers, orders, and products. Include realistic purchase patterns and about 10,000 orders."
                  className="min-h-[180px] bg-transparent border-0 text-foreground placeholder:text-muted-foreground/50 resize-none focus-visible:ring-0 font-mono text-sm leading-relaxed p-0"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Quick Templates */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Boxes className="h-4 w-4" />
                <span>Quick templates</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXAMPLE_PROMPTS.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(example.prompt)}
                    className="text-left p-4 rounded-lg border border-border bg-card hover:border-lime/30 hover:bg-card/80 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground group-hover:text-lime transition-colors">
                          {example.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {example.description}
                        </div>
                      </div>
                      <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-mono font-medium bg-muted text-muted-foreground rounded">
                        {example.tag}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
                <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Right Sidebar - Parameters */}
          <aside className={`${isAuthenticated ? "lg:col-span-3" : "lg:col-span-4"} space-y-6 animate-in delay-300`}>
            {/* Parameters Card */}
            <div className="border border-border rounded-lg p-6 bg-card space-y-6">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Database className="h-4 w-4 text-lime" />
                Parameters
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="rows" className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <Rows3 className="h-3 w-3" />
                    ROW COUNT
                  </Label>
                  <Input
                    id="rows"
                    type="number"
                    value={rows}
                    onChange={(e) => setRows(parseInt(e.target.value) || 1000)}
                    min={1}
                    max={1000000}
                    className="bg-input border-border font-mono text-sm h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    OUTPUT FORMAT
                  </Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                    <SelectTrigger className="bg-input border-border h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">
                        <div className="flex items-center gap-2 font-mono text-sm">
                          <FileSpreadsheet className="h-4 w-4 text-green-400" />
                          CSV
                        </div>
                      </SelectItem>
                      <SelectItem value="json">
                        <div className="flex items-center gap-2 font-mono text-sm">
                          <FileJson className="h-4 w-4 text-yellow-400" />
                          JSON
                        </div>
                      </SelectItem>
                      <SelectItem value="parquet">
                        <div className="flex items-center gap-2 font-mono text-sm">
                          <File className="h-4 w-4 text-blue-400" />
                          Parquet
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seed" className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <Shuffle className="h-3 w-3" />
                    SEED (OPTIONAL)
                  </Label>
                  <Input
                    id="seed"
                    type="number"
                    placeholder="Random"
                    value={seed ?? ""}
                    onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : undefined)}
                    className="bg-input border-border font-mono text-sm h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <Shield className="h-3 w-3" />
                    PRIVACY LEVEL
                  </Label>
                  <Select value={privacyLevel} onValueChange={(v) => setPrivacyLevel(v as typeof privacyLevel)}>
                    <SelectTrigger className="bg-input border-border h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low — AI schema assist</SelectItem>
                      <SelectItem value="medium">Medium — Minimal AI</SelectItem>
                      <SelectItem value="high">High — Local only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between py-2">
                  <Label htmlFor="edge-cases" className="text-xs font-medium text-muted-foreground">
                    Include edge cases
                  </Label>
                  <Switch
                    id="edge-cases"
                    checked={includeEdgeCases}
                    onCheckedChange={setIncludeEdgeCases}
                  />
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              className="w-full h-14 bg-lime text-black font-semibold text-base hover:bg-lime/90 transition-all glow-lime-subtle disabled:opacity-50 disabled:cursor-not-allowed"
              size="lg"
              onClick={handleGenerate}
              disabled={isGenerating || !description.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-5 w-5" />
                  Generate Dataset
                </>
              )}
            </Button>
          </aside>
        </div>

        {/* Progress & Results */}
        {jobStatus && (
          <div className="mt-12 border border-border rounded-lg overflow-hidden animate-in">
            {/* Status Header */}
            <div className="px-6 py-4 bg-card border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-4">
                {jobStatus.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : jobStatus.status === "failed" ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : (
                  <div className="status-dot bg-lime" />
                )}
                <span className="font-mono text-sm font-medium tracking-wide">
                  {getStatusText()}
                </span>
              </div>
              {jobStatus.status !== "completed" && jobStatus.status !== "failed" && (
                <span className="font-mono text-sm text-muted-foreground">
                  {jobStatus.progress}%
                </span>
              )}
            </div>

            {/* Progress Bar */}
            {jobStatus.status !== "completed" && jobStatus.status !== "failed" && (
              <div className="h-1 bg-muted">
                <div
                  className="h-full bg-lime progress-shimmer transition-all duration-500"
                  style={{ width: `${jobStatus.progress}%` }}
                />
              </div>
            )}

            {/* Error State */}
            {jobStatus.status === "failed" && jobStatus.error && (
              <div className="p-6 bg-destructive/5">
                <p className="text-sm text-destructive font-mono">{jobStatus.error}</p>
              </div>
            )}

            {/* Results */}
            {jobStatus.status === "completed" && jobStatus.files && (
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0">
                  <TabsTrigger
                    value="preview"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-lime data-[state=active]:bg-transparent px-6 py-3 font-mono text-sm"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger
                    value="download"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-lime data-[state=active]:bg-transparent px-6 py-3 font-mono text-sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </TabsTrigger>
                  <TabsTrigger
                    value="schema"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-lime data-[state=active]:bg-transparent px-6 py-3 font-mono text-sm"
                  >
                    <Table className="h-4 w-4 mr-2" />
                    Schema
                  </TabsTrigger>
                  <TabsTrigger
                    value="modify"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-lime data-[state=active]:bg-transparent px-6 py-3 font-mono text-sm"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Modify
                  </TabsTrigger>
                </TabsList>

                {/* Preview Tab */}
                <TabsContent value="preview" className="p-6 space-y-4">
                  {jobStatus.schema && jobStatus.schema.tables.length > 1 && (
                    <div className="flex items-center gap-3">
                      <Label className="text-xs font-mono text-muted-foreground">TABLE:</Label>
                      <Select
                        value={selectedTable}
                        onValueChange={(v) => {
                          setSelectedTable(v);
                          setPreviewPage(0);
                          loadDataPreview(jobStatus.jobId, v);
                        }}
                      >
                        <SelectTrigger className="w-64 bg-input border-border h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {jobStatus.schema.tables.map((table) => (
                            <SelectItem key={table.name} value={table.name}>
                              {table.name} ({table.rowCount.toLocaleString()} rows)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-8 w-8 animate-spin text-lime" />
                    </div>
                  ) : dataPreview ? (
                    <div className="space-y-4">
                      <div className="overflow-x-auto rounded border border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50">
                              {dataPreview.headers.map((header) => (
                                <th
                                  key={header}
                                  className="px-4 py-3 text-left font-mono text-xs font-medium text-lime whitespace-nowrap border-b border-border"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dataPreview.rows.map((row, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                {dataPreview.headers.map((header) => (
                                  <td key={header} className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                                    {String(row[header] ?? "—")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                        <span>
                          Rows {previewPage * 10 + 1}–{Math.min((previewPage + 1) * 10, dataPreview.totalRows)} of {dataPreview.totalRows.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newPage = Math.max(0, previewPage - 1);
                              setPreviewPage(newPage);
                              loadDataPreview(jobStatus.jobId, selectedTable);
                            }}
                            disabled={previewPage === 0}
                            className="h-8 w-8 p-0 border-border"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newPage = previewPage + 1;
                              setPreviewPage(newPage);
                              loadDataPreview(jobStatus.jobId, selectedTable);
                            }}
                            disabled={(previewPage + 1) * 10 >= dataPreview.totalRows}
                            className="h-8 w-8 p-0 border-border"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-muted-foreground">
                      <Table className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p className="font-mono text-sm">Loading preview...</p>
                    </div>
                  )}
                </TabsContent>

                {/* Download Tab */}
                <TabsContent value="download" className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {[
                      { format: "csv", label: "CSV", desc: "Excel compatible", icon: FileSpreadsheet, color: "text-green-400" },
                      { format: "json", label: "JSON", desc: "API ready", icon: FileJson, color: "text-yellow-400" },
                      { format: "parquet", label: "Parquet", desc: "ML pipelines", icon: File, color: "text-blue-400" },
                    ].map((item) => (
                      <button
                        key={item.format}
                        onClick={() => handleDownload("data", item.format)}
                        className="p-6 rounded-lg border border-border bg-card hover:border-lime/30 transition-all group text-center"
                      >
                        <item.icon className={`h-8 w-8 mx-auto mb-3 ${item.color} group-hover:scale-110 transition-transform`} />
                        <div className="font-mono font-medium text-foreground">{item.label}</div>
                        <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-border pt-6">
                    <div className="text-xs font-mono text-muted-foreground mb-4">ADDITIONAL FILES</div>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { type: "schema" as const, label: "Schema", icon: FileCode },
                        { type: "metadata" as const, label: "Metadata", icon: FileText },
                        { type: "readme" as const, label: "README", icon: BookOpen },
                      ].map((item) => (
                        <Button
                          key={item.type}
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(item.type)}
                          className="border-border hover:border-lime/30"
                        >
                          <item.icon className="h-4 w-4 mr-2" />
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* Schema Tab */}
                <TabsContent value="schema" className="p-6">
                  {jobStatus.schema && (
                    <div className="space-y-6">
                      <div className="p-4 rounded-lg bg-muted/30 border border-border">
                        <div className="font-mono font-medium text-lg text-foreground">{jobStatus.schema.name}</div>
                        <p className="text-sm text-muted-foreground mt-1">{jobStatus.schema.description}</p>
                      </div>

                      {jobStatus.schema.tables.map((table) => (
                        <div key={table.name} className="border border-border rounded-lg overflow-hidden">
                          <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                            <span className="font-mono font-medium text-lime">{table.name}</span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {table.rowCount.toLocaleString()} rows
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border bg-muted/20">
                                  <th className="text-left py-2 px-4 font-mono text-xs font-medium text-muted-foreground">Column</th>
                                  <th className="text-left py-2 px-4 font-mono text-xs font-medium text-muted-foreground">Type</th>
                                  <th className="text-left py-2 px-4 font-mono text-xs font-medium text-muted-foreground">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {table.columns.map((col) => (
                                  <tr key={col.name} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                                    <td className="py-2 px-4 font-mono text-xs text-foreground">{col.name}</td>
                                    <td className="py-2 px-4">
                                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-lime/10 text-lime border border-lime/20">
                                        {col.type}
                                      </span>
                                    </td>
                                    <td className="py-2 px-4 text-xs text-muted-foreground">{col.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Modify Tab */}
                <TabsContent value="modify" className="p-6 space-y-4">
                  <div className="p-4 rounded-lg bg-lime/5 border border-lime/20">
                    <div className="flex items-start gap-3">
                      <Terminal className="h-5 w-5 text-lime mt-0.5" />
                      <div>
                        <div className="font-medium text-foreground">Modify with natural language</div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Describe changes and the AI will update your dataset.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="h-64 overflow-y-auto p-4 space-y-4 bg-card/50">
                      {chatMessages.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
                          <p className="text-sm font-mono mb-4">No messages yet</p>
                          <div className="space-y-2">
                            {[
                              "Add a customer_lifetime_value column",
                              "Filter out cancelled orders",
                              "Increase fraud rate to 2%",
                            ].map((suggestion) => (
                              <button
                                key={suggestion}
                                onClick={() => setChatInput(suggestion)}
                                className="block mx-auto text-xs text-lime/70 hover:text-lime transition-colors"
                              >
                                &quot;{suggestion}&quot;
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[80%] px-4 py-2 rounded-lg font-mono text-sm ${
                                msg.role === "user"
                                  ? "bg-lime text-black"
                                  : "bg-muted border border-border text-foreground"
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        ))
                      )}
                      {isChatLoading && (
                        <div className="flex justify-start">
                          <div className="px-4 py-2 rounded-lg bg-muted border border-border">
                            <Loader2 className="h-4 w-4 animate-spin text-lime" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 border-t border-border bg-card">
                      <div className="flex gap-3">
                        <Input
                          placeholder="Describe the changes..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleChatSubmit();
                            }
                          }}
                          className="bg-input border-border font-mono text-sm"
                        />
                        <Button
                          onClick={handleChatSubmit}
                          disabled={!chatInput.trim() || isChatLoading}
                          className="bg-lime text-black hover:bg-lime/90 px-4"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-24 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="status-dot bg-green-400" />
              <span>100% synthetic · Privacy-safe · No real PII</span>
            </div>
            <div className="font-mono">
              synth.data v1.0
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
