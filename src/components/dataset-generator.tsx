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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Sparkles,
  Table,
  MessageSquare,
  Send,
  FileJson,
  FileSpreadsheet,
  File,
  Wand2,
  Eye,
  ChevronLeft,
  ChevronRight,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/components/providers/supabase-provider";
import { LoginForm } from "@/components/auth/login-form";
import { UserMenu } from "@/components/auth/user-menu";
import { DatasetHistory } from "@/components/dataset-history";
import type { Dataset } from "@/lib/supabase/types";

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
    title: "E-commerce Dataset",
    description: "Customers, orders, and products",
    prompt: "Create a Kaggle-style e-commerce dataset with customers, products, and orders. Include realistic purchase patterns, customer segments (premium/standard/budget), and seasonal variation in orders. About 10,000 orders total.",
    icon: "🛒",
    color: "from-orange-500 to-pink-500",
  },
  {
    title: "User Analytics",
    description: "Signups, engagement, retention",
    prompt: "Generate a SaaS user analytics dataset with user registrations, daily active usage, feature adoption, and churn indicators. Include realistic cohort behavior and power-law distribution of engagement.",
    icon: "📊",
    color: "from-blue-500 to-cyan-500",
  },
  {
    title: "IoT Sensor Data",
    description: "Time-series with anomalies",
    prompt: "Create IoT sensor data from 10 temperature and humidity sensors over 30 days. Include realistic diurnal patterns, sensor drift, occasional anomalies (2%), and a few sensor failures.",
    icon: "🌡️",
    color: "from-green-500 to-teal-500",
  },
  {
    title: "Financial Transactions",
    description: "Banking with fraud indicators",
    prompt: "Generate a financial transactions dataset with account IDs, transaction amounts, categories, and timestamps. Include realistic spending patterns, a 0.5% fraud rate, and proper distribution of transaction amounts.",
    icon: "💳",
    color: "from-purple-500 to-indigo-500",
  },
];

export function DatasetGenerator() {
  const { user, isLoading: isAuthLoading } = useAuth();

  const [description, setDescription] = useState("");
  const [rows, setRows] = useState(1000);
  const [format, setFormat] = useState<"csv" | "json" | "parquet">("csv");
  const [seed, setSeed] = useState<number | undefined>();
  const [includeEdgeCases, setIncludeEdgeCases] = useState(true);
  const [privacyLevel, setPrivacyLevel] = useState<"low" | "medium" | "high">("medium");

  const [isGenerating, setIsGenerating] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Data preview state
  const [dataPreview, setDataPreview] = useState<DataPreview | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Chat state for modifications
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Auth UI state
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // Load dataset from history
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
    // Clear any existing job state
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
          // Auto-load preview after completion
          loadDataPreview(jobId, status.schema.tables[0].name);
          // Refresh history to show newly generated dataset
          if (user) {
            setHistoryRefreshTrigger((prev) => prev + 1);
          }
        }
      }
    } catch (err) {
      setError("Failed to check job status");
      setIsGenerating(false);
    }
  }, []);

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
          { role: "assistant", content: result.message || "Dataset updated successfully! Refresh the preview to see changes." },
        ]);
        // Reload preview
        if (selectedTable) {
          loadDataPreview(jobStatus.jobId, selectedTable);
        }
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${result.error || "Failed to modify dataset"}` },
        ]);
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to process your request. Please try again." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleExampleClick = (prompt: string) => {
    setDescription(prompt);
  };

  const getStatusIcon = () => {
    if (!jobStatus) return null;
    switch (jobStatus.status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-purple-500" />;
    }
  };

  const getStatusText = () => {
    if (!jobStatus) return "";
    switch (jobStatus.status) {
      case "queued":
        return "Queued...";
      case "planning":
        return "Designing schema...";
      case "generating":
        return "Generating data...";
      case "validating":
        return "Validating output...";
      case "completed":
        return "Complete!";
      case "failed":
        return "Failed";
      default:
        return "";
    }
  };

  const getProgressColor = () => {
    if (!jobStatus) return "bg-purple-500";
    switch (jobStatus.status) {
      case "planning":
        return "bg-gradient-to-r from-purple-500 to-pink-500";
      case "generating":
        return "bg-gradient-to-r from-pink-500 to-cyan-500";
      case "validating":
        return "bg-gradient-to-r from-cyan-500 to-green-500";
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-purple-500";
    }
  };

  return (
    <div className="container mx-auto max-w-7xl p-6 space-y-8">
      {/* Top Bar with Auth */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span className="font-semibold text-purple-600 hidden sm:inline">Synthetic Data</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
          ) : user ? (
            <UserMenu user={user} />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLoginForm(true)}
              className="border-purple-500/30 hover:border-purple-500/50"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Button>
          )}
        </div>
      </div>

      {/* Login Modal */}
      {showLoginForm && !user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <LoginForm onClose={() => setShowLoginForm(false)} />
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-4 py-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium text-purple-600">AI-Powered Data Generation</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tight gradient-text">
          Synthetic Dataset Generator
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Describe the dataset you need in plain English. Get realistic, privacy-safe
          synthetic data ready for ML, testing, and demos.
        </p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* History Sidebar - Only show when logged in */}
        {user && (
          <div className="xl:col-span-1 order-last xl:order-first">
            <div className="sticky top-6">
              <DatasetHistory
                onSelectDataset={handleSelectDataset}
                refreshTrigger={historyRefreshTrigger}
              />
            </div>
          </div>
        )}

        {/* Left Column - Input */}
        <div className={`${user ? "xl:col-span-2" : "lg:col-span-2"} space-y-6`}>
          {/* Description Input */}
          <Card className="border-2 border-purple-500/20 shadow-lg shadow-purple-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-purple-500" />
                Dataset Description
              </CardTitle>
              <CardDescription>
                Describe what data you need. Be specific about entities, relationships,
                and characteristics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="e.g., Create a Kaggle-style e-commerce dataset with customers, orders, and products. Include realistic purchase behavior, seasonal patterns, and about 50,000 orders."
                className="min-h-[150px] border-purple-500/20 focus:border-purple-500 focus:ring-purple-500/20"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Example Prompts */}
          <Card className="border-2 border-transparent bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-pink-500" />
                Quick Start Templates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {EXAMPLE_PROMPTS.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(example.prompt)}
                    className={`text-left p-4 rounded-xl border-2 border-transparent bg-gradient-to-br ${example.color} bg-opacity-10 hover:border-purple-500/30 transition-all hover:shadow-lg hover:shadow-purple-500/10 hover:scale-[1.02] group`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{example.icon}</span>
                      <div>
                        <div className="font-semibold text-foreground group-hover:text-purple-600 transition-colors">
                          {example.title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {example.description}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Options */}
        <div className="space-y-6">
          {/* Parameters */}
          <Card className="border-2 border-cyan-500/20 shadow-lg shadow-cyan-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5 text-cyan-500" />
                Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rows" className="text-sm font-medium">Number of Rows</Label>
                <Input
                  id="rows"
                  type="number"
                  value={rows}
                  onChange={(e) => setRows(parseInt(e.target.value) || 1000)}
                  min={1}
                  max={1000000}
                  className="border-cyan-500/20 focus:border-cyan-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="format" className="text-sm font-medium">Output Format</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                  <SelectTrigger className="border-cyan-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-green-500" />
                        CSV
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-yellow-500" />
                        JSON
                      </div>
                    </SelectItem>
                    <SelectItem value="parquet">
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-blue-500" />
                        Parquet
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="seed" className="text-sm font-medium">Seed (optional)</Label>
                <Input
                  id="seed"
                  type="number"
                  placeholder="Random"
                  value={seed ?? ""}
                  onChange={(e) =>
                    setSeed(e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="border-cyan-500/20 focus:border-cyan-500"
                />
                <p className="text-xs text-muted-foreground">
                  Use the same seed to regenerate identical data
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="privacy" className="text-sm font-medium">Privacy Level</Label>
                <Select
                  value={privacyLevel}
                  onValueChange={(v) => setPrivacyLevel(v as typeof privacyLevel)}
                >
                  <SelectTrigger className="border-cyan-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (AI-assisted schema)</SelectItem>
                    <SelectItem value="medium">Medium (Minimal AI)</SelectItem>
                    <SelectItem value="high">High (No AI - local only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between py-2">
                <Label htmlFor="edge-cases" className="text-sm font-medium">Include Edge Cases</Label>
                <Switch
                  id="edge-cases"
                  checked={includeEdgeCases}
                  onCheckedChange={setIncludeEdgeCases}
                />
              </div>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <Button
            className="w-full h-14 text-lg font-semibold gradient-bg hover:opacity-90 transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
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
                <Sparkles className="mr-2 h-5 w-5" />
                Generate Dataset
              </>
            )}
          </Button>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress & Results */}
      {jobStatus && (
        <Card className="border-2 border-purple-500/20 shadow-xl shadow-purple-500/10">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              {getStatusIcon()}
              <span className={jobStatus.status === "completed" ? "text-green-600" : jobStatus.status === "failed" ? "text-red-600" : "text-purple-600"}>
                {getStatusText()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {jobStatus.status !== "completed" && jobStatus.status !== "failed" && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Progress</span>
                  <span>{jobStatus.progress}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getProgressColor()} transition-all duration-500`}
                    style={{ width: `${jobStatus.progress}%` }}
                  />
                </div>
              </div>
            )}

            {jobStatus.status === "failed" && jobStatus.error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600">
                {jobStatus.error}
              </div>
            )}

            {jobStatus.status === "completed" && jobStatus.files && (
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="grid w-full grid-cols-4 bg-muted/50">
                  <TabsTrigger value="preview" className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="download" className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Download
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="flex items-center gap-2">
                    <Table className="h-4 w-4" />
                    Schema
                  </TabsTrigger>
                  <TabsTrigger value="modify" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Modify
                  </TabsTrigger>
                </TabsList>

                {/* Preview Tab */}
                <TabsContent value="preview" className="space-y-4">
                  {jobStatus.schema && jobStatus.schema.tables.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Label>Table:</Label>
                      <Select value={selectedTable} onValueChange={(v) => {
                        setSelectedTable(v);
                        setPreviewPage(0);
                        loadDataPreview(jobStatus.jobId, v);
                      }}>
                        <SelectTrigger className="w-48">
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
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                    </div>
                  ) : dataPreview ? (
                    <div className="space-y-4">
                      <div className="overflow-x-auto rounded-lg border border-purple-500/20">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
                              {dataPreview.headers.map((header) => (
                                <th key={header} className="px-4 py-3 text-left font-semibold text-purple-700 whitespace-nowrap">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dataPreview.rows.map((row, i) => (
                              <tr key={i} className="border-t border-purple-500/10 hover:bg-purple-500/5">
                                {dataPreview.headers.map((header) => (
                                  <td key={header} className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                                    {String(row[header] ?? "")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          Showing {previewPage * 10 + 1}-{Math.min((previewPage + 1) * 10, dataPreview.totalRows)} of {dataPreview.totalRows.toLocaleString()} rows
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
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Table className="h-12 w-12 mx-auto mb-4 text-purple-500/50" />
                      <p>Preview loading...</p>
                    </div>
                  )}
                </TabsContent>

                {/* Download Tab */}
                <TabsContent value="download" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-2 border-green-500/20 hover:border-green-500/40 transition-colors cursor-pointer group"
                      onClick={() => handleDownload("data", "csv")}>
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                          <FileSpreadsheet className="h-6 w-6 text-green-600" />
                        </div>
                        <h4 className="font-semibold text-green-700">CSV Format</h4>
                        <p className="text-xs text-muted-foreground mt-1">Excel, Sheets compatible</p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-yellow-500/20 hover:border-yellow-500/40 transition-colors cursor-pointer group"
                      onClick={() => handleDownload("data", "json")}>
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-yellow-500/10 flex items-center justify-center group-hover:bg-yellow-500/20 transition-colors">
                          <FileJson className="h-6 w-6 text-yellow-600" />
                        </div>
                        <h4 className="font-semibold text-yellow-700">JSON Format</h4>
                        <p className="text-xs text-muted-foreground mt-1">API, JavaScript ready</p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-blue-500/20 hover:border-blue-500/40 transition-colors cursor-pointer group"
                      onClick={() => handleDownload("data", "parquet")}>
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                          <File className="h-6 w-6 text-blue-600" />
                        </div>
                        <h4 className="font-semibold text-blue-700">Parquet Format</h4>
                        <p className="text-xs text-muted-foreground mt-1">Big data, ML pipelines</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      className="h-auto py-3 flex-col gap-1 border-purple-500/20 hover:border-purple-500/40"
                      onClick={() => handleDownload("schema")}
                    >
                      <FileCode className="h-5 w-5 text-purple-500" />
                      <span className="text-xs">Schema</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-3 flex-col gap-1 border-purple-500/20 hover:border-purple-500/40"
                      onClick={() => handleDownload("metadata")}
                    >
                      <FileText className="h-5 w-5 text-pink-500" />
                      <span className="text-xs">Metadata</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-3 flex-col gap-1 border-purple-500/20 hover:border-purple-500/40"
                      onClick={() => handleDownload("readme")}
                    >
                      <BookOpen className="h-5 w-5 text-cyan-500" />
                      <span className="text-xs">README</span>
                    </Button>
                  </div>
                </TabsContent>

                {/* Schema Tab */}
                <TabsContent value="schema">
                  {jobStatus.schema && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
                        <h4 className="font-semibold text-lg">{jobStatus.schema.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {jobStatus.schema.description}
                        </p>
                      </div>

                      {jobStatus.schema.tables.map((table) => (
                        <div key={table.name} className="border-2 border-purple-500/20 rounded-xl overflow-hidden">
                          <div className="px-4 py-3 bg-gradient-to-r from-purple-500/10 to-transparent">
                            <h5 className="font-semibold text-purple-700">
                              {table.name}
                              <span className="ml-2 text-sm font-normal text-muted-foreground">
                                ({table.rowCount.toLocaleString()} rows)
                              </span>
                            </h5>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-purple-500/10 bg-muted/30">
                                  <th className="text-left py-2 px-4 font-medium">Column</th>
                                  <th className="text-left py-2 px-4 font-medium">Type</th>
                                  <th className="text-left py-2 px-4 font-medium">Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {table.columns.map((col) => (
                                  <tr key={col.name} className="border-b border-purple-500/5 last:border-0 hover:bg-purple-500/5">
                                    <td className="py-2 px-4 font-mono text-xs text-purple-700">
                                      {col.name}
                                    </td>
                                    <td className="py-2 px-4">
                                      <span className="px-2 py-0.5 rounded-full text-xs bg-cyan-500/10 text-cyan-700">
                                        {col.type}
                                      </span>
                                    </td>
                                    <td className="py-2 px-4 text-muted-foreground">
                                      {col.description}
                                    </td>
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
                <TabsContent value="modify" className="space-y-4">
                  <div className="p-4 rounded-lg bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20">
                    <div className="flex items-start gap-3">
                      <Wand2 className="h-5 w-5 text-pink-500 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-pink-700">AI-Powered Modifications</h4>
                        <p className="text-sm text-muted-foreground">
                          Describe changes you want to make to your dataset in natural language.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-2 border-purple-500/20 rounded-xl overflow-hidden">
                    {/* Chat messages */}
                    <div className="h-64 overflow-y-auto p-4 space-y-4 bg-muted/20">
                      {chatMessages.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 text-purple-500/50" />
                          <p className="text-sm">No messages yet. Try asking:</p>
                          <div className="mt-3 space-y-2">
                            <button
                              onClick={() => setChatInput("Add a new column for customer lifetime value")}
                              className="block mx-auto text-xs text-purple-600 hover:underline"
                            >
                              &quot;Add a new column for customer lifetime value&quot;
                            </button>
                            <button
                              onClick={() => setChatInput("Filter out rows where status is cancelled")}
                              className="block mx-auto text-xs text-purple-600 hover:underline"
                            >
                              &quot;Filter out rows where status is cancelled&quot;
                            </button>
                            <button
                              onClick={() => setChatInput("Increase the fraud rate to 2%")}
                              className="block mx-auto text-xs text-purple-600 hover:underline"
                            >
                              &quot;Increase the fraud rate to 2%&quot;
                            </button>
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                                msg.role === "user"
                                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                                  : "bg-white border border-purple-500/20"
                              }`}
                            >
                              <p className="text-sm">{msg.content}</p>
                            </div>
                          </div>
                        ))
                      )}
                      {isChatLoading && (
                        <div className="flex justify-start">
                          <div className="px-4 py-2 rounded-2xl bg-white border border-purple-500/20">
                            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chat input */}
                    <div className="p-4 border-t border-purple-500/20 bg-white">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Describe the changes you want to make..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleChatSubmit();
                            }
                          }}
                          className="border-purple-500/20 focus:border-purple-500"
                        />
                        <Button
                          onClick={handleChatSubmit}
                          disabled={!chatInput.trim() || isChatLoading}
                          className="gradient-bg hover:opacity-90"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <footer className="text-center text-sm text-muted-foreground pt-8 border-t border-purple-500/10">
        <p className="flex items-center justify-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500"></span>
          All generated data is 100% synthetic and privacy-safe.
          No real personal information is ever used or copied.
        </p>
      </footer>
    </div>
  );
}
