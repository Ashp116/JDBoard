import React, { useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useSocket } from '../hooks/useSocket';

const SystemErrorDetector: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { systemData } = useSocket();
  const { setSystemError } = useNotifications();

  useEffect(() => {
    if (systemData?.error) {
      // Set the system error notification
      setSystemError({
        id: 'system-error',
        type: 'error',
        title: 'Jetson Stats Service Error',
        message: systemData.error.message,
        command: systemData.error.command,
        timestamp: systemData.error.timestamp,
        persistent: true,
        errorType: systemData.error.type // Add error type for conditional resolve button
      });
    } else {
      // Clear system error when it's resolved
      setSystemError(null);
    }
  }, [systemData?.error, setSystemError]);

  return <>{children}</>;
};

export default SystemErrorDetector;