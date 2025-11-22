#!/usr/bin/env python3
"""
JtopManager - Singleton class for managing a single jtop connection
This provides a centralized, thread-safe way to access jtop across the entire application
"""

import threading
import logging
from typing import Optional

# Check for jetson-stats availability
try:
    from jtop import jtop
    JTOP_AVAILABLE = True
except Exception:
    JTOP_AVAILABLE = False

logger = logging.getLogger(__name__)


class JtopManager:
    """
    Singleton manager for jtop connections.
    Provides thread-safe access to a single jtop instance across the application.
    
    Usage:
        from jtop_manager import JtopManager
        
        # Get the singleton instance
        jtop_mgr = JtopManager.get_instance()
        
        # Get the jtop connection
        jt = jtop_mgr.get_jtop()
        stats = jt.stats
    """
    
    _instance: Optional['JtopManager'] = None
    _lock = threading.Lock()
    
    def __init__(self):
        """Private constructor - use get_instance() instead"""
        if not JTOP_AVAILABLE:
            raise RuntimeError("jetson-stats (jtop) is not available. Please install it first.")
        
        self._jtop_instance = None
        self._jtop_lock = threading.Lock()
        self._initialized = False
        
        # Initialize the connection
        self._initialize()
    
    @classmethod
    def get_instance(cls) -> 'JtopManager':
        """
        Get the singleton instance of JtopManager.
        Thread-safe lazy initialization.
        
        Returns:
            JtopManager: The singleton instance
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    def _initialize(self):
        """Initialize the jtop connection"""
        try:
            with self._jtop_lock:
                if self._jtop_instance is None:
                    self._jtop_instance = jtop()
                    self._jtop_instance.start()
                    self._initialized = True
                    logger.info("JtopManager: Initialized singleton jtop connection")
        except Exception as e:
            logger.error(f"JtopManager: Failed to initialize jtop connection: {e}")
            raise
    
    def get_jtop(self):
        """
        Get the singleton jtop instance (thread-safe).
        Auto-reinitializes if connection was closed.
        
        Returns:
            jtop: The jtop instance
        """
        with self._jtop_lock:
            if self._jtop_instance is None or not self._initialized:
                self._initialize()
            return self._jtop_instance
    
    def close(self):
        """Close the jtop connection"""
        try:
            with self._jtop_lock:
                if self._jtop_instance is not None:
                    self._jtop_instance.close()
                    self._jtop_instance = None
                    self._initialized = False
                    logger.info("JtopManager: Closed singleton jtop connection")
        except Exception as e:
            logger.error(f"JtopManager: Error closing jtop connection: {e}")
    
    def restart(self):
        """
        Restart the jtop connection.
        Useful for recovering from connection errors.
        """
        logger.info("JtopManager: Restarting jtop connection...")
        self.close()
        import time
        time.sleep(1)  # Brief delay before reconnecting
        self._initialize()
        logger.info("JtopManager: Jtop connection restarted successfully")
    
    def is_initialized(self) -> bool:
        """Check if jtop connection is initialized"""
        return self._initialized and self._jtop_instance is not None
    
    @classmethod
    def reset_instance(cls):
        """
        Reset the singleton instance (mainly for testing).
        Closes connection and clears the singleton.
        """
        with cls._lock:
            if cls._instance is not None:
                cls._instance.close()
                cls._instance = None
                logger.info("JtopManager: Singleton instance reset")


# Convenience function for quick access
def get_jtop():
    """
    Convenience function to get jtop instance directly.
    
    Returns:
        jtop: The singleton jtop instance
        
    Example:
        from jtop_manager import get_jtop
        
        jt = get_jtop()
        stats = jt.stats
    """
    return JtopManager.get_instance().get_jtop()
