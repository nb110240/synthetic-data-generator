export interface Database {
  public: {
    Tables: {
      datasets: {
        Row: {
          id: string;
          user_id: string;
          job_id: string;
          description: string;
          rows: number;
          format: string;
          seed: number | null;
          options: Record<string, unknown>;
          schema: Record<string, unknown> | null;
          status: string;
          progress: number;
          error: string | null;
          files: Record<string, string> | null;
          created_at: string;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id: string;
          description: string;
          rows?: number;
          format?: string;
          seed?: number | null;
          options?: Record<string, unknown>;
          schema?: Record<string, unknown> | null;
          status?: string;
          progress?: number;
          error?: string | null;
          files?: Record<string, string> | null;
          created_at?: string;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_id?: string;
          description?: string;
          rows?: number;
          format?: string;
          seed?: number | null;
          options?: Record<string, unknown>;
          schema?: Record<string, unknown> | null;
          status?: string;
          progress?: number;
          error?: string | null;
          files?: Record<string, string> | null;
          created_at?: string;
          completed_at?: string | null;
          updated_at?: string;
        };
      };
    };
  };
}

export type Dataset = Database['public']['Tables']['datasets']['Row'];
export type DatasetInsert = Database['public']['Tables']['datasets']['Insert'];
export type DatasetUpdate = Database['public']['Tables']['datasets']['Update'];
