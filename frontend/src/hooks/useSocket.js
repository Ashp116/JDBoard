import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import dataCollectionService from '../services/dataCollectionService';

export const useSocket = (serverPath) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [systemData, setSystemData] = useState(null);
  const [error, setError] = useState(null);
  const reconnectTimeoutRef = useRef(null);

  // Automatically determine the best server path
  const getServerPath = () => {
    if (serverPath) return serverPath;
    
    // Get current host from browser location
    const host = window.location.hostname;
    const port = 5000; // Backend port
    
    // Use the same host but different port for backend
    const backendUrl = `http://${host}:${port}`;
    
    console.log(`Auto-detected backend URL: ${backendUrl}`);
    return backendUrl;
  };

  useEffect(() => {
    const finalServerPath = getServerPath();
    console.log('Connecting to backend:', finalServerPath);
    
    // Create socket connection
    const newSocket = io(finalServerPath, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      maxReconnectionAttempts: 5,
      timeout: 15000,
      forceNew: false,
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setError(null);
      
      // Start data collection service when connected
      dataCollectionService.start();
      
      // Clear any reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setIsConnected(false);
      
      // Stop data collection service when disconnected
      dataCollectionService.stop();
      
      // Handle different disconnect reasons
      if (reason === 'parse error') {
        console.error('WebSocket parse error - server may be sending malformed data');
        setError('Server communication error (parse error)');
        // For parse errors, wait longer before reconnecting
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect after parse error...');
          newSocket.connect();
        }, 5000);
      } else if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect after server disconnect...');
          newSocket.connect();
        }, 2000);
      } else if (reason === 'transport close' || reason === 'transport error') {
        // Network issues, try reconnecting with delay
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect after transport error...');
          newSocket.connect();
        }, 3000);
      }
      // For other reasons like 'io client disconnect', don't auto-reconnect
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setError(error.message);
      setIsConnected(false);
    });

    // Data event handlers
    newSocket.on('system_update', (data) => {
      try {
        console.log('Received system update:', data);
        // Extract the actual system data from the response
        if (data && data.success && data.data) {
          setSystemData(data.data);
          setError(null); // Clear any previous errors
          
          // Always add data to the background collection service
          // This runs regardless of which page is active
          dataCollectionService.addDataPoint(data.data);
        } else if (data && !data.success) {
          console.error('System update error:', data.error);
          setError(data.error || 'System update failed');
        } else {
          console.warn('Invalid system update format:', data);
          setError('Invalid data format received');
        }
      } catch (err) {
        console.error('Error processing system update:', err);
        setError('Error processing system data');
      }
    });

    newSocket.on('model_update', (data) => {
      console.log('Received model update:', data);
      setSystemData(prevData => ({
        ...prevData,
        models: data
      }));
    });

    newSocket.on('inference_result', (data) => {
      console.log('Received inference result:', data);
      setSystemData(prevData => ({
        ...prevData,
        lastInference: data
      }));
    });

    newSocket.on('log_entry', (data) => {
      console.log('Received log entry:', data);
      setSystemData(prevData => ({
        ...prevData,
        logs: prevData?.logs ? [...prevData.logs, data] : [data]
      }));
    });

    setSocket(newSocket);

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      newSocket.close();
    };
  }, [serverPath]);

  // Socket utility functions
  const emit = (event, data) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  };

  const requestSystemInfo = () => {
    emit('get_system_info');
  };

  const loadModel = (modelName) => {
    emit('load_model', { model: modelName });
  };

  const unloadModel = (modelName) => {
    emit('unload_model', { model: modelName });
  };

  const runInference = (imageData, modelName) => {
    emit('run_inference', { image: imageData, model: modelName });
  };

  const getModelList = () => {
    emit('get_models');
  };

  const getLogs = (count = 100) => {
    emit('get_logs', { count });
  };

  const getBufferedData = () => {
    return dataCollectionService.getBufferedData();
  };

  const getBufferStats = () => {
    return dataCollectionService.getBufferStats();
  };

  const clearDataBuffer = () => {
    dataCollectionService.clearBuffer();
  };

  return {
    socket,
    isConnected,
    systemData,
    error,
    emit,
    requestSystemInfo,
    loadModel,
    unloadModel,
    runInference,
    getModelList,
    getLogs,
    getBufferedData,
    getBufferStats,
    clearDataBuffer
  };
};