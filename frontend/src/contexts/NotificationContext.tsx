import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Notification {
  id: string;
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  command?: string;
  timestamp: string;
  persistent?: boolean; // If true, notification won't auto-dismiss
  errorType?: string; // For system error types like 'jtop_service_inactive'
  action?: {
    label: string;
    onClick: () => void;
  };
}

type NewNotification = Omit<Notification, 'id' | 'timestamp'> & { id?: string };

interface NotificationContextType {
  notifications: Notification[];
  // Returns the notification's id. Pass `id` to choose it yourself (needed to
  // update/remove the notification later).
  addNotification: (notification: NewNotification) => string;
  removeNotification: (id: string) => void;
  updateNotification: (id: string, updates: Partial<Notification>) => void;
  clearNotifications: () => void;
  systemError: Notification | null;
  setSystemError: (error: Notification | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [systemError, setSystemError] = useState<Notification | null>(null);

  const addNotification = useCallback((notification: NewNotification) => {
    const newNotification: Notification = {
      ...notification,
      id: notification.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString()
    };

    // Replace an existing notification with the same id instead of duplicating it
    setNotifications(prev => [...prev.filter(n => n.id !== newNotification.id), newNotification]);

    // Auto-remove non-persistent notifications after 5 seconds
    if (!notification.persistent) {
      setTimeout(() => {
        removeNotification(newNotification.id);
      }, 5000);
    }
    return newNotification.id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const updateNotification = useCallback((id: string, updates: Partial<Notification>) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, ...updates } : n
    ));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        updateNotification,
        clearNotifications,
        systemError,
        setSystemError
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};