// Background Data Collection Service
// This service runs continuously and buffers system data regardless of page visibility

import type { 
  SystemData, 
  BufferedData, 
  BufferStats, 
  BufferedCPUData, 
  BufferedGPUData, 
  BufferedMemoryData, 
  BufferedNetworkData, 
  BufferedFanData 
} from '../types';

class DataCollectionService {
  private maxDataPoints: number;
  private isCollecting: boolean;
  private buffer: {
    cpu: BufferedCPUData[];
    gpu: BufferedGPUData[];
    memory: BufferedMemoryData[];
    network: BufferedNetworkData[];
    fan: BufferedFanData[];
    timestamps: Array<{ time: string; timestamp: number }>;
  };
  private lastNetworkData: { bytes_sent: number; bytes_recv: number } | null;

  constructor(maxDataPoints: number = 100) {
    this.maxDataPoints = maxDataPoints;
    this.isCollecting = false;
    this.buffer = {
      cpu: [],
      gpu: [],
      memory: [],
      network: [],
      fan: [],
      timestamps: []
    };
    
    // Store the last network values for calculating deltas
    this.lastNetworkData = null;
    
    console.log('DataCollectionService initialized with buffer size:', maxDataPoints);
  }

  start() {
    this.isCollecting = true;
    console.log('Background data collection started');
  }

  stop() {
    this.isCollecting = false;
    console.log('Background data collection stopped');
  }

  // Add new system data to the buffer
  addDataPoint(systemData: SystemData): void {
    if (!this.isCollecting || !systemData) {
      return;
    }

    const timestamp = new Date();
    const timeLabel = timestamp.toLocaleTimeString();

    // Calculate network deltas if we have previous data
    let networkSentDelta = 0;
    let networkRecvDelta = 0;
    
    if (this.lastNetworkData && systemData.network) {
      networkSentDelta = Math.max(0, (systemData.network.bytes_sent || 0) - this.lastNetworkData.bytes_sent);
      networkRecvDelta = Math.max(0, (systemData.network.bytes_recv || 0) - this.lastNetworkData.bytes_recv);
    }
    
    // Store current network data for next calculation
    if (systemData.network) {
      this.lastNetworkData = {
        bytes_sent: systemData.network.bytes_sent || 0,
        bytes_recv: systemData.network.bytes_recv || 0
      };
    }

    // Add CPU data
    const cpuData = {
      time: timeLabel,
      timestamp: timestamp.getTime(),
      overall: systemData?.cpu?.usage || 0,
      cores: systemData?.cpu?.cores || [],
      temperature: systemData?.cpu?.temperature || 0,
      load: systemData?.cpu?.load_avg || 0,
      frequency: systemData?.cpu?.frequency || 0
    };

    // Add GPU data
    const gpuData = {
      time: timeLabel,
      timestamp: timestamp.getTime(),
      usage: systemData?.gpu?.usage || 0,
      temperature: systemData?.gpu?.temperature || 0
    };

    // Add Memory data
    const memoryData = {
      time: timeLabel,
      timestamp: timestamp.getTime(),
      used: systemData?.memory?.used || 0,
      total: systemData?.memory?.total || 0,
      percent: systemData?.memory?.percent || 0,
      available: systemData?.memory?.available || 0
    };

    // Add Network data (with deltas)
    const networkData = {
      time: timeLabel,
      timestamp: timestamp.getTime(),
      sent: systemData?.network?.bytes_sent || 0,
      received: systemData?.network?.bytes_recv || 0,
      sent_delta: networkSentDelta,
      received_delta: networkRecvDelta,
      packets_sent: systemData?.network?.packets_sent || 0,
      packets_recv: systemData?.network?.packets_recv || 0
    };

    // Add Fan data
    const fanData = {
      time: timeLabel,
      timestamp: timestamp.getTime(),
      rpm: systemData?.fan?.rpm || 0,
      speed: systemData?.fan?.speed || 0,
      cpu_temp: systemData?.fan?.cpu_temp || 0,
      gpu_temp: systemData?.fan?.gpu_temp || 0,
      total_power: systemData?.fan?.total_power || 0
    };

    // Add to buffers and maintain max size
    this.buffer.cpu = [...this.buffer.cpu, cpuData].slice(-this.maxDataPoints);
    this.buffer.gpu = [...this.buffer.gpu, gpuData].slice(-this.maxDataPoints);
    this.buffer.memory = [...this.buffer.memory, memoryData].slice(-this.maxDataPoints);
    this.buffer.network = [...this.buffer.network, networkData].slice(-this.maxDataPoints);
    this.buffer.fan = [...this.buffer.fan, fanData].slice(-this.maxDataPoints);
    this.buffer.timestamps = [...this.buffer.timestamps, { time: timeLabel, timestamp: timestamp.getTime() }].slice(-this.maxDataPoints);

    // Log buffer size periodically
    if (this.buffer.cpu.length % 20 === 0) {
      console.log(`Data buffer contains ${this.buffer.cpu.length} data points`);
    }
  }

  // Get all buffered data
  getBufferedData(): BufferedData {
    return {
      ...this.buffer,
      size: this.buffer.cpu.length,
      isCollecting: this.isCollecting
    };
  }

  // Get data for a specific metric
  getMetricData(metric: keyof typeof this.buffer): any[] {
    return this.buffer[metric] || [];
  }

  // Clear all buffered data
  clearBuffer() {
    this.buffer = {
      cpu: [],
      gpu: [],
      memory: [],
      network: [],
      fan: [],
      timestamps: []
    };
    this.lastNetworkData = null;
    console.log('Data buffer cleared');
  }

  // Get summary statistics
  getBufferStats(): BufferStats {
    return {
      cpu: {
        count: this.buffer.cpu.length,
        latest: this.buffer.cpu[this.buffer.cpu.length - 1] || null,
        oldest: this.buffer.cpu[0] || null
      },
      gpu: {
        count: this.buffer.gpu.length,
        latest: this.buffer.gpu[this.buffer.gpu.length - 1] || null,
        oldest: this.buffer.gpu[0] || null
      },
      memory: {
        count: this.buffer.memory.length,
        latest: this.buffer.memory[this.buffer.memory.length - 1] || null,
        oldest: this.buffer.memory[0] || null
      },
      network: {
        count: this.buffer.network.length,
        latest: this.buffer.network[this.buffer.network.length - 1] || null,
        oldest: this.buffer.network[0] || null
      },
      fan: {
        count: this.buffer.fan.length,
        latest: this.buffer.fan[this.buffer.fan.length - 1] || null,
        oldest: this.buffer.fan[0] || null
      },
      timestamps: {
        count: this.buffer.timestamps.length,
        latest: this.buffer.timestamps[this.buffer.timestamps.length - 1] || null,
        oldest: this.buffer.timestamps[0] || null
      },
      totalDataPoints: this.buffer.cpu.length,
      isCollecting: this.isCollecting,
      maxDataPoints: this.maxDataPoints
    };
  }
}

// Create a singleton instance
export const dataCollectionService = new DataCollectionService();
export default dataCollectionService;