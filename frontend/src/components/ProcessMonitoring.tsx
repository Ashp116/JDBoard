import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getBackendUrl } from '../utils/api';

interface Process {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
  memory_mb: number;
  status: string;
  username: string;
  cmdline: string;
  create_time: number;
}

const Container = styled.div`
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
`;

const Header = styled.div`
  margin-bottom: 30px;

  h2 {
    font-size: 28px;
    color: ${props => props.theme.colors.nvidia.green};
    margin-bottom: 10px;
    font-weight: 700;
  }

  p {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
  }
`;

const Controls = styled.div`
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 250px;
  padding: 10px 15px;
  background: ${props => props.theme.colors.background.tertiary};
  border: none;
  outline: none;
  border-radius: 6px;
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(118, 185, 0, 0.3);
  }

  &::placeholder {
    color: ${props => props.theme.colors.text.secondary};
  }
`;

const SortSelect = styled.select`
  padding: 10px 15px;
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  color: ${props => props.theme.colors.text.primary};
  font-size: 14px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const RefreshButton = styled.button`
  padding: 10px 20px;
  background: ${props => props.theme.colors.nvidia.green};
  color: ${props => props.theme.colors.background.primary};
  border: none;
  outline: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.theme.colors.nvidia.lightGreen};
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus {
    outline: none;
  }

  i {
    margin-right: 8px;
  }
`;

const ProcessTable = styled.div`
  background: ${props => props.theme.gradients.card};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border};
  overflow: hidden;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr 100px 120px 100px 150px 100px;
  gap: 10px;
  padding: 15px 20px;
  background: ${props => props.theme.colors.background.secondary};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  font-weight: 600;
  color: ${props => props.theme.colors.nvidia.green};
  font-size: 13px;
  text-transform: uppercase;
`;

const TableBody = styled.div`
  max-height: 600px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: ${props => props.theme.colors.background.secondary};
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.colors.nvidia.green};
    border-radius: 4px;
  }
`;

const ProcessRow = styled.div<{ $highlighted?: boolean }>`
  display: grid;
  grid-template-columns: 80px 1fr 100px 120px 100px 150px 100px;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.$highlighted ? 'rgba(118, 185, 0, 0.05)' : 'transparent'};
  transition: all 0.2s;
  font-size: 13px;
  align-items: center;

  &:hover {
    background: rgba(118, 185, 0, 0.1);
  }

  .pid {
    color: ${props => props.theme.colors.text.secondary};
    font-family: monospace;
  }

  .name {
    color: ${props => props.theme.colors.text.primary};
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cpu, .memory {
    color: ${props => props.theme.colors.nvidia.green};
    font-family: monospace;
    font-weight: 600;
  }

  .status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
    
    &.running {
      background: rgba(118, 185, 0, 0.2);
      color: ${props => props.theme.colors.nvidia.green};
    }
    
    &.sleeping {
      background: rgba(100, 100, 100, 0.2);
      color: #888;
    }
    
    &.stopped {
      background: rgba(255, 0, 0, 0.2);
      color: #ff4444;
    }
  }

  .user {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 12px;
  }
`;

const ActionButton = styled.button<{ $danger?: boolean }>`
  padding: 6px 12px;
  background: ${props => props.$danger ? '#ff4444' : props.theme.colors.nvidia.green};
  color: white;
  border: none;
  outline: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    opacity: 0.8;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &:focus {
    outline: none;
  }

  i {
    margin-right: 4px;
  }
`;

const EmptyState = styled.div`
  padding: 60px 20px;
  text-align: center;
  color: ${props => props.theme.colors.text.secondary};

  i {
    font-size: 48px;
    margin-bottom: 15px;
    opacity: 0.3;
  }

  p {
    font-size: 16px;
  }
`;

const PaginationContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-top: 1px solid ${props => props.theme.colors.border};
  background: ${props => props.theme.colors.background.secondary};
`;

const PaginationInfo = styled.div`
  color: ${props => props.theme.colors.text.secondary};
  font-size: 14px;
`;

const PaginationControls = styled.div`
  display: flex;
  gap: 5px;
  align-items: center;
`;

const PageButton = styled.button<{ $active?: boolean }>`
  padding: 8px 12px;
  background: ${props => props.$active ? props.theme.colors.nvidia.green : props.theme.colors.background.tertiary};
  color: ${props => props.$active ? props.theme.colors.background.primary : props.theme.colors.text.primary};
  border: none;
  outline: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: ${props => props.$active ? '600' : '400'};
  cursor: pointer;
  transition: all 0.2s;
  min-width: 36px;

  &:hover:not(:disabled) {
    background: ${props => props.$active ? props.theme.colors.nvidia.lightGreen : 'rgba(118, 185, 0, 0.1)'};
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &:focus {
    outline: none;
  }

  i {
    font-size: 12px;
  }
`;

const PageEllipsis = styled.span`
  padding: 8px 4px;
  color: ${props => props.theme.colors.text.secondary};
  font-size: 13px;
`;

const ItemsPerPageSelect = styled.select`
  padding: 8px 12px;
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text.primary};
  font-size: 13px;
  cursor: pointer;
  margin-left: 10px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
  }
`;

const ProcessMonitoring: React.FC = () => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'cpu' | 'memory' | 'name' | 'pid'>('cpu');
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchProcesses = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: itemsPerPage.toString(),
        sort_by: sortBy,
        search: searchQuery
      });
      
      const response = await fetch(`${getBackendUrl()}/system/processes?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setProcesses(data.processes);
        setTotalCount(data.pagination.total_count);
        setTotalPages(data.pagination.total_pages);
      }
    } catch (error) {
      console.error('Error fetching processes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, itemsPerPage, sortBy, searchQuery]);

  const killProcess = async (pid: number) => {
    if (!confirm(`Are you sure you want to kill process ${pid}?`)) {
      return;
    }

    try {
      const response = await fetch(`${getBackendUrl()}/system/processes/${pid}/kill`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        fetchProcesses();
      } else {
        alert(`Failed to kill process: ${data.error}`);
      }
    } catch (error) {
      console.error('Error killing process:', error);
      alert('Failed to kill process');
    }
  };

  //@ts-ignore
  useEffect(() => {
    fetchProcesses();
    
    if (autoRefresh) {
     const interval = setInterval(fetchProcesses, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchProcesses]);

  // Pagination calculations
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <Container>
      <Header>
        <h2>
          <i className="fas fa-tasks"></i> Process Monitor
        </h2>
        <p>Monitor and manage running processes on your Jetson device</p>
      </Header>

      <Controls>
        <SearchInput
          type="text"
          placeholder="Search processes by name, PID, or command..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <SortSelect value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="cpu">Sort by CPU</option>
          <option value="memory">Sort by Memory</option>
          <option value="name">Sort by Name</option>
          <option value="pid">Sort by PID</option>
        </SortSelect>

        <RefreshButton onClick={fetchProcesses} disabled={isLoading}>
          <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i>
          Refresh
        </RefreshButton>

        <RefreshButton 
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{ background: autoRefresh ? '#76b900' : '#555' }}
        >
          <i className={`fas fa-${autoRefresh ? 'pause' : 'play'}`}></i>
          {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
        </RefreshButton>
      </Controls>

      <ProcessTable>
        <TableHeader>
          <div>PID</div>
          <div>Name</div>
          <div>CPU %</div>
          <div>Memory</div>
          <div>Status</div>
          <div>User</div>
          <div>Action</div>
        </TableHeader>

        <TableBody>
          {processes.length === 0 ? (
            <EmptyState>
              <i className="fas fa-search"></i>
              <p>No processes found</p>
            </EmptyState>
          ) : (
            processes.map((proc) => (
              <ProcessRow key={proc.pid} $highlighted={proc.cpu_percent > 50}>
                <div className="pid">{proc.pid}</div>
                <div className="name" title={proc.cmdline}>{proc.name}</div>
                <div className="cpu">{proc.cpu_percent.toFixed(1)}%</div>
                <div className="memory">{proc.memory_mb.toFixed(0)} MB</div>
                <div>
                  <span className={`status ${proc.status.toLowerCase()}`}>
                    {proc.status}
                  </span>
                </div>
                <div className="user">{proc.username}</div>
                <div>
                  <ActionButton 
                    $danger
                    onClick={() => killProcess(proc.pid)}
                    disabled={proc.username !== 'ashp116' && proc.username !== 'root'}
                  >
                    <i className="fas fa-times"></i>
                    Kill
                  </ActionButton>
                </div>
              </ProcessRow>
            ))
          )}
        </TableBody>

        {totalCount > 0 && (
          <PaginationContainer>
            <PaginationInfo>
              Showing {startIndex + 1}-{Math.min(endIndex, totalCount)} of {totalCount} processes
              <ItemsPerPageSelect 
                value={itemsPerPage} 
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </ItemsPerPageSelect>
            </PaginationInfo>

            <PaginationControls>
              <PageButton 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <i className="fas fa-chevron-left"></i>
              </PageButton>

              {getPageNumbers().map((page, index) => (
                page === '...' ? (
                  <PageEllipsis key={`ellipsis-${index}`}>...</PageEllipsis>
                ) : (
                  <PageButton
                    key={page}
                    $active={page === currentPage}
                    onClick={() => handlePageChange(page as number)}
                  >
                    {page}
                  </PageButton>
                )
              ))}

              <PageButton 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <i className="fas fa-chevron-right"></i>
              </PageButton>
            </PaginationControls>
          </PaginationContainer>
        )}
      </ProcessTable>
    </Container>
  );
};

export default ProcessMonitoring;
