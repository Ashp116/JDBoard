// TypeScript type definitions for JDBoard

export interface CPUData {
  usage: number;
  frequency: number;
  temperature: number;
  cores: number[];
  load_avg?: number;
}

export interface GPUData {
  usage: number;
  temperature: number;
  power?: number;
  name?: string;
}

export interface MemoryData {
  total: number;
  used: number;
  available: number;
  percent: number;
  free?: number;
  detailed?: {
    total_gb: number;
    used_gb: number;
    available_gb: number;
    cached: number;
    cached_gb: number;
    buffers: number;
    buffers_gb: number;
    shared: number;
    shared_gb: number;
    free: number;
    free_gb: number;
  };
}

export interface NetworkData {
  bytes_sent: number;
  bytes_recv: number;
  packets_sent?: number;
  packets_recv?: number;
  dropin?: number;
  dropout?: number;
  errin?: number;
  errout?: number;
}

export interface FanData {
  speed: number;
  rpm: number;
  cpu_temp: number;
  gpu_temp: number;
  total_power: number;
}

export interface DiskData {
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface SystemData {
  cpu?: CPUData;
  gpu?: GPUData;
  memory?: MemoryData;
  network?: NetworkData;
  fan?: FanData;
  disk?: DiskData;
  processes?: number;
  uptime?: string;
  nvp_model?: string;
  jetson_model?: string;
  jetson_module?: string;
  jetpack_version?: string;
  kernel_version?: string;
  jetson_clocks?: boolean;
  last_updated?: string;
  models?: any[];
  lastInference?: any;
  logs?: any[];
  stats?: {
    totalInferences?: number;
  };
  system_logs?: {
    recent_logs?: any[];
    last_updated?: string;
  };
  error?: {
    type: string;
    message: string;
    command?: string;
    timestamp: string;
  } | null;
}

// Buffered data types for the data collection service
export interface BufferedCPUData {
  time: string;
  timestamp: number;
  overall: number;
  cores: number[];
  temperature: number;
  load: number;
  frequency: number;
}

export interface BufferedGPUData {
  time: string;
  timestamp: number;
  usage: number;
  temperature: number;
}

export interface BufferedMemoryData {
  time: string;
  timestamp: number;
  used: number;
  total: number;
  percent: number;
  available: number;
  // Detailed breakdown in GB for chart display
  used_gb: number;
  cached_gb: number;
  buffers_gb: number;
  free_gb: number;
}

export interface BufferedNetworkData {
  time: string;
  timestamp: number;
  sent: number;
  received: number;
  sent_delta: number;
  received_delta: number;
  packets_sent: number;
  packets_recv: number;
}

export interface BufferedFanData {
  time: string;
  timestamp: number;
  rpm: number;
  speed: number;
  cpu_temp: number;
  gpu_temp: number;
  total_power: number;
}

export interface BufferedData {
  cpu: BufferedCPUData[];
  gpu: BufferedGPUData[];
  memory: BufferedMemoryData[];
  network: BufferedNetworkData[];
  fan: BufferedFanData[];
  timestamps: Array<{ time: string; timestamp: number }>;
  size: number;
  isCollecting: boolean;
}

export interface BufferStats {
  cpu: {
    count: number;
    latest: BufferedCPUData | null;
    oldest: BufferedCPUData | null;
  };
  gpu: {
    count: number;
    latest: BufferedGPUData | null;
    oldest: BufferedGPUData | null;
  };
  memory: {
    count: number;
    latest: BufferedMemoryData | null;
    oldest: BufferedMemoryData | null;
  };
  network: {
    count: number;
    latest: BufferedNetworkData | null;
    oldest: BufferedNetworkData | null;
  };
  fan: {
    count: number;
    latest: BufferedFanData | null;
    oldest: BufferedFanData | null;
  };
  timestamps: {
    count: number;
    latest: { time: string; timestamp: number } | null;
    oldest: { time: string; timestamp: number } | null;
  };
  totalDataPoints: number;
  isCollecting: boolean;
  maxDataPoints: number;
}

// Socket and API types
export interface SocketResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UseSocketReturn {
  socket: any;
  isConnected: boolean;
  systemData: SystemData | null;
  error: string | null;
  emit: (event: string, data?: any) => void;
  requestSystemInfo: () => void;
  loadModel: (modelName: string) => void;
  unloadModel: (modelName: string) => void;
  runInference: (imageData: any, modelName: string) => void;
  getModelList: () => void;
  getLogs: (count?: number) => void;
  getBufferedData: () => BufferedData;
  getBufferStats: () => BufferStats;
  clearDataBuffer: () => void;
}

// Chart data types
export interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  fill?: boolean;
  tension?: number;
  yAxisID?: string;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ComponentProps {
  systemData: SystemData | null;
  socket: any;
  isConnected: boolean;
}

export interface MonitoringSectionProps extends ComponentProps {
  getBufferedData?: () => BufferedData;
  getBufferStats?: () => BufferStats;
  clearDataBuffer?: () => void;
}

export interface DashboardProps {
  systemData: SystemData | null;
  isConnected: boolean;
}

export interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isConnected: boolean;
  isMobileMenuOpen?: boolean;
  onToggleMobileMenu?: () => void;
}

export interface SystemStatusProps {
  isConnected: boolean;
}

export interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: string;
  status?: 'normal' | 'warning' | 'danger' | 'critical';
  details?: string;
}

export interface SettingsSectionProps extends ComponentProps {
  onNavigate?: (section: string) => void;
}

export interface InferenceSectionProps extends ComponentProps {}

export interface LogsSectionProps extends ComponentProps {}

export interface ModelsSectionProps extends ComponentProps {}

export interface TerminalSectionProps {
  socket: any;
  isConnected: boolean;
}