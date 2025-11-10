import React, { useState } from 'react';
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

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'error': return 'fas fa-exclamation-triangle';
    case 'warning': return 'fas fa-exclamation-circle';
    case 'success': return 'fas fa-check-circle';
    default: return 'fas fa-info-circle';
  }
};

const GlobalNotifications: React.FC = () => {
  const { notifications, removeNotification, systemError, setSystemError } = useNotifications();
  const [isResolving, setIsResolving] = useState(false);

  const handleResolveJtopError = async () => {
    if (!systemError || systemError.errorType !== 'jtop_service_inactive') return;

    setIsResolving(true);
    
    try {
      // For broken pipe errors, try force reconnect first (no sudo needed)
      if (systemError.message?.toLowerCase().includes('broken pipe')) {
        console.log('Attempting force reconnect for broken pipe error...');
        
        const reconnectResponse = await fetch(`${getBackendUrl()}/api/system/jtop-force-reconnect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const reconnectResult = await reconnectResponse.json();
        
        if (reconnectResult.success) {
          setSystemError(null);
          alert('jtop connection restored successfully!');
          return;
        } else {
          console.log('Force reconnect failed, falling back to service restart...');
        }
      }

      // Determine which service action to take
      const isRestartCommand = systemError.command?.includes('restart');
      const actionText = isRestartCommand ? 'restart jtop service' : 'install jtop service';
      const endpoint = isRestartCommand ? '/api/system/jtop-restart-service' : '/api/system/jtop-install-service';

      // Ask user for sudo password
      const password = prompt(`Enter your sudo password to ${actionText}:`);
      if (!password) return;

      const response = await fetch(`${getBackendUrl()}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sudo_password: password })
      });

      const result = await response.json();
      
      if (result.success) {
        // Clear the error as it should be resolved
        setSystemError(null);
        alert(`jtop service ${isRestartCommand ? 'restarted' : 'installed'} successfully! The connection should be restored.`);
      } else {
        alert(`Failed to ${actionText}: ${result.error}`);
      }
    } catch (error) {
      alert(`Error resolving jtop service: ${error}`);
    } finally {
      setIsResolving(false);
    }
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
    </>
  );
};

export default GlobalNotifications;