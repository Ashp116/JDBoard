import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNotifications, Notification } from '../contexts/NotificationContext';
import { getBackendUrl } from '../utils/api';

const slideIn = keyframes`
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-100%);
    opacity: 0;
  }
`;

const NotificationContainer = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
  width: 100%;

  @media (max-width: 768px) {
    top: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
  }
`;

const SystemErrorBanner = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: linear-gradient(135deg, #dc3545, #c82333);
  color: white;
  padding: 15px 20px;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
  border-bottom: 3px solid #bd2130;
  animation: ${slideIn} 0.3s ease-out;

  .error-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 15px;
    flex-wrap: wrap;
  }

  .error-icon {
    font-size: 20px;
    color: #fff;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .error-details {
    flex: 1;
    min-width: 300px;
  }

  .error-title {
    font-weight: bold;
    font-size: 16px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .error-message {
    font-size: 14px;
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .error-command {
    background: rgba(0, 0, 0, 0.3);
    padding: 6px 10px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: inline-block;
    margin-top: 4px;
    word-break: break-all;
  }

  .error-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .dismiss-btn {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .resolve-btn {
    background: rgba(118, 185, 0, 0.3);
    border: 1px solid rgba(118, 185, 0, 0.5);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(118, 185, 0, 0.5);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .error-timestamp {
    font-size: 11px;
    opacity: 0.8;
    margin-top: 4px;
  }

  @media (max-width: 768px) {
    padding: 12px 15px;

    .error-content {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    .error-actions {
      width: 100%;
      justify-content: flex-end;
    }
  }
`;

const NotificationCard = styled.div<{ type: Notification['type'] }>`
  background: ${props => {
    switch (props.type) {
      case 'error': return props.theme.colors.status.error;
      case 'warning': return props.theme.colors.status.warning;
      case 'success': return props.theme.colors.status.success;
      default: return props.theme.colors.background.secondary;
    }
  }};
  color: ${props => props.type === 'info' ? props.theme.colors.text.primary : 'white'};
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-left: 4px solid ${props => {
    switch (props.type) {
      case 'error': return '#dc3545';
      case 'warning': return '#ffc107';
      case 'success': return '#28a745';
      default: return props.theme.colors.nvidia.green;
    }
  }};
  animation: ${slideIn} 0.3s ease-out;
  position: relative;

  .notification-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .notification-title {
    font-weight: bold;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .notification-icon {
    font-size: 16px;
  }

  .close-btn {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    opacity: 0.7;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 1;
    }
  }

  .notification-message {
    font-size: 13px;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .notification-command {
    background: rgba(0, 0, 0, 0.2);
    padding: 6px 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    margin: 8px 0;
    word-break: break-all;
  }

  .notification-timestamp {
    font-size: 11px;
    opacity: 0.8;
    margin-top: 8px;
  }

  .notification-action {
    margin-top: 10px;
    
    button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: inherit;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    }
  }
`;

const SudoModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
`;

const SudoModalContent = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 16px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);

  h3 {
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 16px 0;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 18px;

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }

  p {
    color: ${props => props.theme.colors.text.secondary};
    margin: 0 0 16px 0;
    line-height: 1.5;
  }
`;

const SudoPasswordInput = styled.input`
  width: 100%;
  background: ${props => props.theme.colors.background.tertiary};
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  color: ${props => props.theme.colors.text.primary};
  padding: 12px;
  font-size: 14px;
  margin-bottom: 16px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.nvidia.green};
    box-shadow: 0 0 0 2px rgba(118, 185, 0, 0.2);
  }

  &::placeholder {
    color: ${props => props.theme.colors.text.secondary};
  }

  &.error {
    border-color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: ${props => props.theme.colors.background.secondary};
  }
`;

const SudoModalButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;

  button {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;

    &.cancel {
      background: ${props => props.theme.colors.background.tertiary};
      color: ${props => props.theme.colors.text.primary};
      border: 1px solid ${props => props.theme.colors.border.secondary};

      &:hover {
        background: ${props => props.theme.colors.border.secondary};
      }
    }

    &.confirm {
      background: ${props => props.theme.colors.nvidia.green};
      color: white;

      &:hover {
        background: ${props => props.theme.colors.nvidia.darkGreen || '#5a8c00'};
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      i {
        margin-right: 6px;
      }
    }
  }
`;

const SudoErrorMessage = styled.div`
  color: #ff6b6b;
  font-size: 12px;
  margin: -8px 0 16px 0;
  display: flex;
  align-items: center;
  gap: 4px;

  i {
    font-size: 10px;
  }
`;

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'error': return 'fas fa-exclamation-triangle';
    case 'warning': return 'fas fa-exclamation-circle';
    case 'success': return 'fas fa-check-circle';
    default: return 'fas fa-info-circle';
  }
};

const GlobalNotifications: React.FC = () => {
  const { notifications, removeNotification, addNotification, systemError, setSystemError } = useNotifications();
  const [isResolving, setIsResolving] = useState(false);
  const [showSudoModal, setShowSudoModal] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');
  const [sudoError, setSudoError] = useState('');
  const [isSubmittingSudo, setIsSubmittingSudo] = useState(false);
  const [isMonitoringLogs, setIsMonitoringLogs] = useState(false);
  const [brokenPipeCount, setBrokenPipeCount] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    actionText: string;
    endpoint: string;
    isRestart: boolean;
  } | null>(null);

  // Log monitoring for broken pipe errors
  useEffect(() => {
    let logMonitorInterval: NodeJS.Timeout;
    let lastLogCheck = Date.now();

    const monitorLogsForBrokenPipes = async () => {
      try {
        const response = await fetch(`${getBackendUrl()}/system/logs?since=${lastLogCheck}&filter=broken_pipe`);
        if (response.ok) {
          const logData = await response.json();
          
          if (logData.logs && logData.logs.length > 0) {
            const brokenPipeEntries = logData.logs.filter((log: any) => 
              log.message?.toLowerCase().includes('broken pipe') || 
              log.message?.toLowerCase().includes('errno 32')
            );

            if (brokenPipeEntries.length > 0 && !isMonitoringLogs) {
              console.log(`Detected ${brokenPipeEntries.length} broken pipe errors, starting auto-recovery...`);
              setBrokenPipeCount(prev => prev + brokenPipeEntries.length);
              setIsMonitoringLogs(true);
              startAutomaticRecovery();
            }
          }
        }
        lastLogCheck = Date.now();
      } catch (error) {
        console.error('Error monitoring logs:', error);
      }
    };

    const startAutomaticRecovery = async () => {
      let recoveryAttempts = 0;
      const maxRecoveryAttempts = 15;
      const recoveryInterval = 3000; // 3 seconds

      const attemptRecovery = async (): Promise<boolean> => {
        recoveryAttempts++;
        console.log(`Auto-recovery attempt ${recoveryAttempts}/${maxRecoveryAttempts} for broken pipe errors`);

        try {
          const reconnectResponse = await fetch(`${getBackendUrl()}/system/jtop-force-reconnect`, {
            method: 'POST'
          });

          if (reconnectResponse.ok) {
            const result = await reconnectResponse.json();
            if (result.success) {
              // Check if broken pipe errors have stopped for a few seconds
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
              
              const checkResponse = await fetch(`${getBackendUrl()}/system/logs?since=${Date.now() - 10000}&filter=broken_pipe`);
              if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                const recentBrokenPipes = checkData.logs?.filter((log: any) => 
                  log.message?.toLowerCase().includes('broken pipe') || 
                  log.message?.toLowerCase().includes('errno 32')
                ) || [];

                if (recentBrokenPipes.length === 0) {
                  console.log('Auto-recovery successful: No more broken pipe errors detected');
                  setIsMonitoringLogs(false);
                  setBrokenPipeCount(0);
                  addNotification({
                    type: 'success',
                    title: 'Auto-Recovery Successful',
                    message: `jtop connection automatically restored after ${recoveryAttempts} attempts!`
                  });
                  return true;
                }
              }
            }
          }
        } catch (error) {
          console.error(`Auto-recovery attempt ${recoveryAttempts} failed:`, error);
        }

        return false;
      };

      const runRecoveryLoop = async () => {
        if (await attemptRecovery()) {
          return; // Success, stop the loop
        }

        if (recoveryAttempts < maxRecoveryAttempts) {
          setTimeout(runRecoveryLoop, recoveryInterval);
        } else {
          console.log('Auto-recovery failed after maximum attempts');
          setIsMonitoringLogs(false);
          addNotification({
            type: 'warning',
            title: 'Auto-Recovery Failed',
            message: 'Automatic recovery attempts exhausted. Manual intervention may be required.'
          });
        }
      };

      runRecoveryLoop();
    };

    // Start log monitoring
    logMonitorInterval = setInterval(monitorLogsForBrokenPipes, 2000); // Check every 2 seconds

    return () => {
      if (logMonitorInterval) {
        clearInterval(logMonitorInterval);
      }
    };
  }, [addNotification, isMonitoringLogs]);

  const handleResolveJtopError = async () => {
    if (!systemError || systemError.errorType !== 'jtop_service_inactive') return;

    setIsResolving(true);
    
    try {
      // For broken pipe errors, try multiple force reconnects first (no sudo needed)
      if (systemError.message?.toLowerCase().includes('broken pipe')) {
        console.log('Attempting aggressive force reconnect for broken pipe error...');
        
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        
        const attemptReconnect = async (): Promise<boolean> => {
          reconnectAttempts++;
          console.log(`Force reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
          
          try {
            const reconnectResponse = await fetch(`${getBackendUrl()}/system/jtop-force-reconnect`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            const reconnectResult = await reconnectResponse.json();
            
            if (reconnectResult.success) {
              setSystemError(null);
              addNotification({
                type: 'success',
                title: 'Connection Restored',
                message: `jtop connection restored successfully after ${reconnectAttempts} attempts!`
              });
              return true;
            }
          } catch (error) {
            console.log(`Reconnect attempt ${reconnectAttempts} failed:`, error);
          }
          
          return false;
        };

        // Try multiple reconnect attempts with delays
        for (let i = 0; i < maxReconnectAttempts; i++) {
          if (await attemptReconnect()) {
            return; // Success, exit early
          }
          
          if (i < maxReconnectAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between attempts
          }
        }
        
        console.log('All force reconnect attempts failed, falling back to service restart...');
      }

      // Determine which service action to take
      const isRestartCommand = systemError.command?.includes('restart');
      const actionText = isRestartCommand ? 'restart jtop service' : 'install jtop service';
      const endpoint = isRestartCommand ? '/system/jtop-restart-service' : '/system/jtop-install-service';

      // Show sudo modal instead of prompt
      setPendingAction({
        actionText,
        endpoint,
        isRestart: isRestartCommand
      });
      setSudoPassword('');
      setSudoError('');
      setShowSudoModal(true);
      
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Service Resolution Failed',
        message: `Error resolving jtop service: ${error}`
      });
    } finally {
      setIsResolving(false);
    }
  };

  const handleSudoModalConfirm = async () => {
    if (!sudoPassword.trim() || !pendingAction || isSubmittingSudo) return;

    // Clear previous errors and set loading state
    setSudoError('');
    setIsSubmittingSudo(true);

    try {
      const response = await fetch(`${getBackendUrl()}${pendingAction.endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sudo_password: sudoPassword })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        // Clear system error and close modal immediately
        setSystemError(null);
        setShowSudoModal(false);
        setPendingAction(null);
        setSudoPassword('');
        setSudoError('');
        setIsSubmittingSudo(false);
        
        addNotification({
          type: 'success',
          title: 'Service Action Completed',
          message: `jtop service ${pendingAction?.isRestart ? 'restarted' : 'installed'} successfully! Attempting to restore connection...`
        });

        // Force reload until broken pipe errors disappear
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = 2000; // 2 seconds

        const forceReloadUntilFixed = async () => {
          try {
            retryCount++;
            console.log(`Force reload attempt ${retryCount}/${maxRetries}`);
            
            // Try force reconnect
            const reconnectResponse = await fetch(`${getBackendUrl()}/system/jtop-force-reconnect`, {
              method: 'POST'
            });

            if (reconnectResponse.ok) {
              const reconnectResult = await reconnectResponse.json();
              if (reconnectResult.success) {
                console.log('Force reconnect successful, connection restored');
                addNotification({
                  type: 'success',
                  title: 'Connection Restored',
                  message: 'jtop service connection has been successfully restored!'
                });
                return; // Success, stop retrying
              }
            }

            // If we haven't reached max retries, try again
            if (retryCount < maxRetries) {
              setTimeout(forceReloadUntilFixed, retryInterval);
            } else {
              console.log('Max retry attempts reached, connection may still have issues');
              addNotification({
                type: 'warning',
                title: 'Connection Issues Persist',
                message: 'Service was installed but connection issues may persist. Please check the monitoring section.'
              });
            }
          } catch (error) {
            console.error(`Force reload attempt ${retryCount} failed:`, error);
            if (retryCount < maxRetries) {
              setTimeout(forceReloadUntilFixed, retryInterval);
            }
          }
        };

        // Start the force reload process after a short delay
        setTimeout(forceReloadUntilFixed, 1000);
        
      } else {
        // Handle different types of errors
        if (response.status === 401) {
          setSudoError('Invalid sudo password. Please try again.');
        } else {
          setSudoError(result.error || 'Failed to authenticate or execute command. Please check your password.');
        }
      }
    } catch (error) {
      setSudoError(`Network error: ${error}`);
    } finally {
      setIsSubmittingSudo(false);
      setIsResolving(false);
    }
  };

  const handleSudoModalCancel = () => {
    setShowSudoModal(false);
    setSudoPassword('');
    setSudoError('');
    setPendingAction(null);
    setIsSubmittingSudo(false);
    setIsResolving(false);
  };

  return (
    <>
      {/* System Error Banner - Always at top */}
      {systemError && (
        <SystemErrorBanner>
          <div className="error-content">
            <i className="error-icon fas fa-exclamation-triangle"></i>
            <div className="error-details">
              <div className="error-title">
                {systemError.title}
              </div>
              <div className="error-message">
                {systemError.message}
              </div>
              {systemError.command && (
                <div className="error-command">
                  {systemError.command}
                </div>
              )}
              <div className="error-timestamp">
                Error occurred: {new Date(systemError.timestamp).toLocaleString()}
              </div>
            </div>
            <div className="error-actions">
              {systemError.errorType === 'jtop_service_inactive' && (
                <button 
                  className="resolve-btn"
                  onClick={handleResolveJtopError}
                  disabled={isResolving}
                >
                  <i className={isResolving ? "fas fa-spinner fa-spin" : "fas fa-wrench"}></i> 
                  {isResolving ? ' Resolving...' : ' Resolve'}
                </button>
              )}
              <button 
                className="dismiss-btn"
                onClick={() => setSystemError(null)}
              >
                <i className="fas fa-times"></i> Dismiss
              </button>
            </div>
          </div>
        </SystemErrorBanner>
      )}

      {/* Regular Notifications */}
      <NotificationContainer style={{ top: systemError ? '80px' : '20px' }}>
        {notifications.map((notification) => (
          <NotificationCard key={notification.id} type={notification.type}>
            <div className="notification-header">
              <div className="notification-title">
                <i className={`notification-icon ${getNotificationIcon(notification.type)}`}></i>
                {notification.title}
              </div>
              <button 
                className="close-btn"
                onClick={() => removeNotification(notification.id)}
              >
                ×
              </button>
            </div>
            <div className="notification-message">{notification.message}</div>
            {notification.command && (
              <div className="notification-command">{notification.command}</div>
            )}
            {notification.action && (
              <div className="notification-action">
                <button onClick={notification.action.onClick}>
                  {notification.action.label}
                </button>
              </div>
            )}
            <div className="notification-timestamp">
              {new Date(notification.timestamp).toLocaleString()}
            </div>
          </NotificationCard>
        ))}
      </NotificationContainer>

      {/* Auto-Recovery Status Indicator */}
      {isMonitoringLogs && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'rgba(118, 185, 0, 0.1)',
          border: '1px solid rgba(118, 185, 0, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          color: '#76b900',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10000,
          backdropFilter: 'blur(10px)'
        }}>
          <i className="fas fa-cog fa-spin"></i>
          Auto-recovering from broken pipes... ({brokenPipeCount} detected)
        </div>
      )}

      {/* Sudo Password Modal */}
      {showSudoModal && pendingAction && (
        <SudoModal>
          <SudoModalContent>
            <h3>
              <i className="fas fa-shield-alt"></i>
              Administrator Authentication Required
            </h3>
            <p>
              Enter your sudo password to {pendingAction.actionText}:
            </p>
            <SudoPasswordInput
              type="password"
              placeholder="Enter sudo password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              className={sudoError ? 'error' : ''}
              disabled={isSubmittingSudo}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sudoPassword.trim() && !isSubmittingSudo) {
                  e.preventDefault();
                  handleSudoModalConfirm();
                } else if (e.key === 'Escape' && !isSubmittingSudo) {
                  e.preventDefault();
                  handleSudoModalCancel();
                }
              }}
              autoFocus
            />
            {sudoError && (
              <SudoErrorMessage>
                <i className="fas fa-exclamation-circle"></i>
                {sudoError}
              </SudoErrorMessage>
            )}
            <SudoModalButtons>
              <button 
                className="cancel" 
                onClick={handleSudoModalCancel}
                disabled={isSubmittingSudo}
              >
                Cancel
              </button>
              <button 
                className="confirm" 
                onClick={handleSudoModalConfirm}
                disabled={!sudoPassword.trim() || isSubmittingSudo}
              >
                {isSubmittingSudo ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Authenticating...
                  </>
                ) : (
                  pendingAction?.isRestart ? 'Restart Service' : 'Install Service'
                )}
              </button>
            </SudoModalButtons>
          </SudoModalContent>
        </SudoModal>
      )}
    </>
  );
};

export default GlobalNotifications;