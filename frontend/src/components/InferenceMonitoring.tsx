import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { getBackendUrl } from '../utils/api';
import { useNotifications } from '../contexts/NotificationContext';

interface InferenceLog {
  id: number;
  timestamp: string;
  model_id: string;
  client_ip: string;
  inference_time: number;
  result?: any;
  image_hash?: string;
  session_id?: string;
  user_agent?: string;
  device_info?: string;
  framework?: string;
  image_size?: string;
  predictions_count?: number;
  confidence_avg?: number;
}

interface InferenceStats {
  total_inferences: number;
  inferences_24h: number;
  inferences_7d: number;
  avg_inference_time: number;
  top_models: Array<{model_id: string, count: number}>;
  top_clients: Array<{client_ip: string, count: number}>;
  hourly_distribution: Array<{hour: string, count: number}>;
  performance_distribution: {fast: number, medium: number, slow: number};
  recent_inferences: Array<{
    timestamp: string;
    model_id: string;
    client_ip: string;
    inference_time: number;
  }>;
}

const Container = styled.div`
  padding: 30px;
`;

const SectionHeader = styled.div`
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 24px;
    margin: 0;
    font-family: ${props => props.theme.fonts.display};

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const StatCard = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 20px;
  transition: all ${props => props.theme.transitions.standard};

  &:hover {
    border-color: ${props => props.theme.colors.nvidia.green};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .stat-icon {
    color: ${props => props.theme.colors.nvidia.green};
    font-size: 24px;
    margin-bottom: 10px;
  }

  .stat-value {
    color: ${props => props.theme.colors.text.primary};
    font-size: 28px;
    font-weight: bold;
    margin-bottom: 5px;
  }

  .stat-label {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-trend {
    color: ${props => props.theme.colors.nvidia.green};
    font-size: 12px;
    margin-top: 5px;
  }
`;

const FilterSection = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  
  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 15px 0;
    display: flex;
    align-items: center;
    gap: 8px;
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  align-items: end;
`;

const FilterGroup = styled.div`
  .label {
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;
    margin-bottom: 5px;
    display: block;
  }

  input, select {
    width: 100%;
    padding: 8px 12px;
    background: ${props => props.theme.colors.background.primary};
    border: 1px solid ${props => props.theme.colors.border.secondary};
    border-radius: 6px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const LogsSection = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 12px;
  overflow: hidden;
`;

const LogsHeader = styled.div`
  background: ${props => props.theme.colors.background.primary};
  padding: 20px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  
  h3 {
    margin: 0;
    color: ${props => props.theme.colors.text.primary};
    display: flex;
    align-items: center;
    gap: 8px;
    
    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const LogsTable = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td {
    text-align: left;
    padding: 12px 15px;
    border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  }

  th {
    background: ${props => props.theme.colors.background.primary};
    color: ${props => props.theme.colors.text.primary};
    font-weight: 600;
    font-size: 14px;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  td {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 13px;
  }

  tr:hover {
    background: ${props => props.theme.colors.background.primary};
  }
`;

const DeviceTag = styled.span<{device: string}>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props => {
    switch(props.device?.toLowerCase()) {
      case 'mobile': return '#FF6B6B';
      case 'tablet': return '#4ECDC4';
      case 'desktop': return '#45B7D1';
      case 'jetson': return '#96CEB4';
      default: return '#95A5A6';
    }
  }};
  color: white;
`;

const PerformanceIndicator = styled.span<{time: number}>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background: ${props => {
    if (props.time < 0.1) return '#00ff00';
    if (props.time < 0.5) return '#ffff00';
    return '#ff6666';
  }};
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: ${props => props.theme.colors.background.primary};

  .pagination-info {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
  }

  .pagination-controls {
    display: flex;
    gap: 10px;
  }
`;

const PaginationButton = styled.button<{disabled?: boolean}>`
  padding: 8px 16px;
  background: ${props => props.disabled ? 
    props.theme.colors.background.secondary : 
    props.theme.colors.nvidia.green};
  color: ${props => props.disabled ? 
    props.theme.colors.text.secondary : 
    'white'};
  border: none;
  border-radius: 6px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: all ${props => props.theme.transitions.standard};

  &:hover:not(:disabled) {
    background: ${props => props.theme.colors.nvidia.darkGreen};
  }
`;

const LoadingState = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  color: ${props => props.theme.colors.text.secondary};
`;

export const InferenceMonitoring: React.FC = () => {
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [stats, setStats] = useState<InferenceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    model_id: '',
    client_ip: '',
    start_date: '',
    end_date: '',
    page: 1,
    per_page: 50
  });
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 50,
    total: 0,
    pages: 0
  });
  
  const { addNotification } = useNotifications();

  const fetchInferenceLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          params.append(key, value.toString());
        }
      });

      const response = await fetch(`${getBackendUrl()}/api/logs/inference?${params}`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.data.logs || []);
        setPagination(data.data.pagination);
      } else {
        addNotification({
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to fetch inference logs'
        });
      }
    } catch (error) {
      console.error('Error fetching inference logs:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to fetch inference logs'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInferenceStats = async () => {
    try {
      const response = await fetch(`${getBackendUrl()}/api/logs/inference/stats`);
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching inference stats:', error);
    }
  };

  useEffect(() => {
    fetchInferenceLogs();
  }, [filters]);

  useEffect(() => {
    fetchInferenceStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchInferenceStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleFilterChange = (key: string, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : Number(value) // Reset to page 1 when changing other filters
    }));
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatInferenceTime = (time: number) => {
    return `${(time * 1000).toFixed(1)}ms`;
  };

  const renderPerformanceDistribution = () => {
    if (!stats) return null;
    
    const { performance_distribution } = stats;
    const total = performance_distribution.fast + performance_distribution.medium + performance_distribution.slow;
    
    if (total === 0) return null;

    return (
      <StatCard>
        <div className="stat-icon">⚡</div>
        <div className="stat-value">Performance</div>
        <div className="stat-label">Distribution (7 days)</div>
        <div style={{marginTop: '10px'}}>
          <div style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
            <div style={{width: '12px', height: '12px', background: '#00ff00', borderRadius: '50%', marginRight: '8px'}}></div>
            <span style={{fontSize: '12px', color: '#888'}}>
              Fast (&lt;100ms): {performance_distribution.fast} ({((performance_distribution.fast / total) * 100).toFixed(1)}%)
            </span>
          </div>
          <div style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
            <div style={{width: '12px', height: '12px', background: '#ffff00', borderRadius: '50%', marginRight: '8px'}}></div>
            <span style={{fontSize: '12px', color: '#888'}}>
              Medium (100-500ms): {performance_distribution.medium} ({((performance_distribution.medium / total) * 100).toFixed(1)}%)
            </span>
          </div>
          <div style={{display: 'flex', alignItems: 'center'}}>
            <div style={{width: '12px', height: '12px', background: '#ff6666', borderRadius: '50%', marginRight: '8px'}}></div>
            <span style={{fontSize: '12px', color: '#888'}}>
              Slow (&gt;500ms): {performance_distribution.slow} ({((performance_distribution.slow / total) * 100).toFixed(1)}%)
            </span>
          </div>
        </div>
      </StatCard>
    );
  };

  return (
    <Container>
      <SectionHeader>
        <h2>
          <i className="fas fa-analytics"></i>
          Inference Monitoring
        </h2>
      </SectionHeader>

      {/* Statistics Cards */}
      <StatsGrid>
        <StatCard>
          <div className="stat-icon">📊</div>
          <div className="stat-value">{stats?.total_inferences || 0}</div>
          <div className="stat-label">Total Inferences</div>
          <div className="stat-trend">All time</div>
        </StatCard>

        <StatCard>
          <div className="stat-icon">📈</div>
          <div className="stat-value">{stats?.inferences_24h || 0}</div>
          <div className="stat-label">Last 24 Hours</div>
          <div className="stat-trend">+{stats?.inferences_7d || 0} this week</div>
        </StatCard>

        <StatCard>
          <div className="stat-icon">⏱️</div>
          <div className="stat-value">{stats ? `${(stats.avg_inference_time * 1000).toFixed(1)}ms` : '0ms'}</div>
          <div className="stat-label">Avg Inference Time</div>
          <div className="stat-trend">Last 100 inferences</div>
        </StatCard>

        {renderPerformanceDistribution()}
      </StatsGrid>

      {/* Filters */}
      <FilterSection>
        <h3>
          <i className="fas fa-filter"></i>
          Filters
        </h3>
        <FilterGrid>
          <FilterGroup>
            <label className="label">Model ID</label>
            <select
              value={filters.model_id}
              onChange={(e) => handleFilterChange('model_id', e.target.value)}
            >
              <option value="">All Models</option>
              {stats?.top_models?.map((model) => (
                <option key={model.model_id} value={model.model_id}>
                  {model.model_id} ({model.count})
                </option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup>
            <label className="label">Client IP</label>
            <select
              value={filters.client_ip}
              onChange={(e) => handleFilterChange('client_ip', e.target.value)}
            >
              <option value="">All Clients</option>
              {stats?.top_clients?.map((client) => (
                <option key={client.client_ip} value={client.client_ip}>
                  {client.client_ip} ({client.count})
                </option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup>
            <label className="label">Start Date</label>
            <input
              type="datetime-local"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
            />
          </FilterGroup>

          <FilterGroup>
            <label className="label">End Date</label>
            <input
              type="datetime-local"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
            />
          </FilterGroup>
        </FilterGrid>
      </FilterSection>

      {/* Logs Table */}
      <LogsSection>
        <LogsHeader>
          <h3>
            <i className="fas fa-list"></i>
            Inference History ({pagination.total} total)
          </h3>
        </LogsHeader>

        <LogsTable>
          {loading ? (
            <LoadingState>
              <i className="fas fa-spinner fa-spin"></i>&nbsp;&nbsp;Loading inference logs...
            </LoadingState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Model</th>
                  <th>Client</th>
                  <th>Device</th>
                  <th>Performance</th>
                  <th>Framework</th>
                  <th>Image Size</th>
                  <th>Predictions</th>
                  <th>Avg Confidence</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatTimestamp(log.timestamp)}</td>
                    <td>{log.model_id}</td>
                    <td>
                      <div>
                        <div>{log.client_ip}</div>
                        <div style={{fontSize: '11px', color: '#666'}}>
                          Session: {log.session_id?.slice(-8)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <DeviceTag device={log.device_info || 'unknown'}>
                        {log.device_info || 'Unknown'}
                      </DeviceTag>
                    </td>
                    <td>
                      <div style={{display: 'flex', alignItems: 'center'}}>
                        <PerformanceIndicator time={log.inference_time} />
                        {formatInferenceTime(log.inference_time)}
                      </div>
                    </td>
                    <td>{log.framework || 'N/A'}</td>
                    <td>{log.image_size || 'N/A'}</td>
                    <td>{log.predictions_count || 0}</td>
                    <td>
                      {log.confidence_avg ? `${(log.confidence_avg * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </LogsTable>

        {/* Pagination */}
        <Pagination>
          <div className="pagination-info">
            Showing {((pagination.page - 1) * pagination.per_page) + 1}-{Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total}
          </div>
          <div className="pagination-controls">
            <PaginationButton
              disabled={pagination.page <= 1}
              onClick={() => handleFilterChange('page', pagination.page - 1)}
            >
              <i className="fas fa-chevron-left"></i> Previous
            </PaginationButton>
            <PaginationButton
              disabled={pagination.page >= pagination.pages}
              onClick={() => handleFilterChange('page', pagination.page + 1)}
            >
              Next <i className="fas fa-chevron-right"></i>
            </PaginationButton>
          </div>
        </Pagination>
      </LogsSection>
    </Container>
  );
};

export default InferenceMonitoring;
