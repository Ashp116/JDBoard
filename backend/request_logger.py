#!/usr/bin/env python3
"""
Request Logger for Jetson Edge AI Dashboard
Logs all requests, inference operations, and system events
"""

import json
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path
import logging
import hashlib
from collections import defaultdict

logger = logging.getLogger(__name__)

class RequestLogger:
    def __init__(self, logs_dir='../logs'):
        self.logs_dir = Path(logs_dir)
        self.logs_dir.mkdir(exist_ok=True)
        self.db_path = self.logs_dir / 'requests.db'
        self.lock = threading.Lock()
        self._init_database()
    
    def _init_database(self):
        """Initialize SQLite database for logging"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS requests (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        endpoint TEXT NOT NULL,
                        method TEXT NOT NULL,
                        client_ip TEXT NOT NULL,
                        user_agent TEXT,
                        response_time REAL,
                        status_code INTEGER,
                        data TEXT,
                        session_id TEXT
                    )
                ''')
                
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS inference_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        model_id TEXT NOT NULL,
                        client_ip TEXT NOT NULL,
                        inference_time REAL NOT NULL,
                        result TEXT,
                        image_hash TEXT,
                        session_id TEXT
                    )
                ''')
                
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS system_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp TEXT NOT NULL,
                        event_type TEXT NOT NULL,
                        event_data TEXT,
                        severity TEXT DEFAULT 'INFO'
                    )
                ''')
                
                # Create indexes for better performance
                conn.execute('CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_requests_client_ip ON requests(client_ip)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_inference_timestamp ON inference_logs(timestamp)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_inference_model ON inference_logs(model_id)')
                
                conn.commit()
                logger.info("Database initialized successfully")
                
        except Exception as e:
            logger.error(f"Error initializing database: {str(e)}")
    
    def log_request(self, endpoint, client_ip, user_agent=None, method='GET', 
                   response_time=None, status_code=None, data=None, session_id=None):
        """Log an API request"""
        try:
            with self.lock:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute('''
                        INSERT INTO requests 
                        (timestamp, endpoint, method, client_ip, user_agent, 
                         response_time, status_code, data, session_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        datetime.now().isoformat(),
                        endpoint,
                        method,
                        client_ip,
                        user_agent,
                        response_time,
                        status_code,
                        json.dumps(data) if data else None,
                        session_id or self._generate_session_id(client_ip, user_agent)
                    ))
                    conn.commit()
        except Exception as e:
            logger.error(f"Error logging request: {str(e)}")
    
    def log_inference(self, model_id, client_ip, inference_time, result=None, 
                     image_data=None, session_id=None):
        """Log an inference operation"""
        try:
            # Generate hash of image data for tracking
            image_hash = None
            if image_data is not None:
                image_hash = hashlib.md5(str(image_data).encode()).hexdigest()
            
            with self.lock:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute('''
                        INSERT INTO inference_logs 
                        (timestamp, model_id, client_ip, inference_time, 
                         result, image_hash, session_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        datetime.now().isoformat(),
                        model_id,
                        client_ip,
                        inference_time,
                        json.dumps(result) if result else None,
                        image_hash,
                        session_id or self._generate_session_id(client_ip)
                    ))
                    conn.commit()
        except Exception as e:
            logger.error(f"Error logging inference: {str(e)}")
    
    def log_system_event(self, event_type, event_data=None, severity='INFO'):
        """Log a system event"""
        try:
            with self.lock:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute('''
                        INSERT INTO system_events 
                        (timestamp, event_type, event_data, severity)
                        VALUES (?, ?, ?, ?)
                    ''', (
                        datetime.now().isoformat(),
                        event_type,
                        json.dumps(event_data) if event_data else None,
                        severity
                    ))
                    conn.commit()
        except Exception as e:
            logger.error(f"Error logging system event: {str(e)}")
    
    def _generate_session_id(self, client_ip, user_agent=None):
        """Generate a session ID based on client info"""
        data = f"{client_ip}_{user_agent or 'unknown'}_{datetime.now().strftime('%Y%m%d')}"
        return hashlib.md5(data.encode()).hexdigest()[:12]
    
    def get_logs(self, log_type='requests', page=1, per_page=50, 
                client_ip=None, start_date=None, end_date=None):
        """Get logs with pagination and filtering"""
        try:
            offset = (page - 1) * per_page
            
            # Build query based on log type
            if log_type == 'requests':
                table = 'requests'
                base_query = 'SELECT * FROM requests'
            elif log_type == 'inference':
                table = 'inference_logs'
                base_query = 'SELECT * FROM inference_logs'
            elif log_type == 'system':
                table = 'system_events'
                base_query = 'SELECT * FROM system_events'
            else:
                raise ValueError(f"Invalid log type: {log_type}")
            
            # Add filters
            where_conditions = []
            params = []
            
            if client_ip:
                where_conditions.append('client_ip = ?')
                params.append(client_ip)
            
            if start_date:
                where_conditions.append('timestamp >= ?')
                params.append(start_date)
            
            if end_date:
                where_conditions.append('timestamp <= ?')
                params.append(end_date)
            
            if where_conditions:
                base_query += ' WHERE ' + ' AND '.join(where_conditions)
            
            # Add ordering and pagination
            query = f"{base_query} ORDER BY timestamp DESC LIMIT ? OFFSET ?"
            params.extend([per_page, offset])
            
            # Get count for pagination
            count_query = f"SELECT COUNT(*) FROM {table}"
            if where_conditions:
                count_query += ' WHERE ' + ' AND '.join(where_conditions[:-2] if len(params) > 2 else where_conditions)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                
                # Get total count
                if where_conditions:
                    total_count = conn.execute(count_query, params[:-2]).fetchone()[0]
                else:
                    total_count = conn.execute(count_query).fetchone()[0]
                
                # Get logs
                cursor = conn.execute(query, params)
                logs = [dict(row) for row in cursor.fetchall()]
                
                # Parse JSON data
                for log in logs:
                    if 'data' in log and log['data']:
                        try:
                            log['data'] = json.loads(log['data'])
                        except json.JSONDecodeError:
                            pass
                    
                    if 'result' in log and log['result']:
                        try:
                            log['result'] = json.loads(log['result'])
                        except json.JSONDecodeError:
                            pass
                    
                    if 'event_data' in log and log['event_data']:
                        try:
                            log['event_data'] = json.loads(log['event_data'])
                        except json.JSONDecodeError:
                            pass
                
                return {
                    'logs': logs,
                    'pagination': {
                        'page': page,
                        'per_page': per_page,
                        'total': total_count,
                        'pages': (total_count + per_page - 1) // per_page
                    }
                }
                
        except Exception as e:
            logger.error(f"Error getting logs: {str(e)}")
            return {'logs': [], 'pagination': {'page': 1, 'per_page': per_page, 'total': 0, 'pages': 0}}
    
    def get_stats(self):
        """Get comprehensive statistics"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                stats = {}
                
                # Request stats
                cursor = conn.execute('''
                    SELECT 
                        COUNT(*) as total_requests,
                        COUNT(DISTINCT client_ip) as unique_clients,
                        AVG(response_time) as avg_response_time
                    FROM requests
                    WHERE timestamp >= datetime('now', '-24 hours')
                ''')
                request_stats = cursor.fetchone()
                stats['requests_24h'] = {
                    'total': request_stats[0] or 0,
                    'unique_clients': request_stats[1] or 0,
                    'avg_response_time': request_stats[2] or 0
                }
                
                # Inference stats
                cursor = conn.execute('''
                    SELECT 
                        COUNT(*) as total_inferences,
                        COUNT(DISTINCT model_id) as models_used,
                        AVG(inference_time) as avg_inference_time
                    FROM inference_logs
                    WHERE timestamp >= datetime('now', '-24 hours')
                ''')
                inference_stats = cursor.fetchone()
                stats['inference_24h'] = {
                    'total': inference_stats[0] or 0,
                    'models_used': inference_stats[1] or 0,
                    'avg_inference_time': inference_stats[2] or 0
                }
                
                # Top endpoints
                cursor = conn.execute('''
                    SELECT endpoint, COUNT(*) as count
                    FROM requests
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY endpoint
                    ORDER BY count DESC
                    LIMIT 10
                ''')
                stats['top_endpoints'] = [{'endpoint': row[0], 'count': row[1]} 
                                        for row in cursor.fetchall()]
                
                # Top clients
                cursor = conn.execute('''
                    SELECT client_ip, COUNT(*) as count
                    FROM requests
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY client_ip
                    ORDER BY count DESC
                    LIMIT 10
                ''')
                stats['top_clients'] = [{'client_ip': row[0], 'count': row[1]} 
                                      for row in cursor.fetchall()]
                
                # Model usage
                cursor = conn.execute('''
                    SELECT model_id, COUNT(*) as count, AVG(inference_time) as avg_time
                    FROM inference_logs
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY model_id
                    ORDER BY count DESC
                    LIMIT 10
                ''')
                stats['model_usage'] = [{'model_id': row[0], 'count': row[1], 'avg_time': row[2]} 
                                      for row in cursor.fetchall()]
                
                # Hourly request distribution
                cursor = conn.execute('''
                    SELECT 
                        strftime('%H', timestamp) as hour,
                        COUNT(*) as count
                    FROM requests
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY hour
                    ORDER BY hour
                ''')
                stats['hourly_distribution'] = [{'hour': int(row[0]), 'count': row[1]} 
                                              for row in cursor.fetchall()]
                
                # Error rates
                cursor = conn.execute('''
                    SELECT 
                        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors,
                        COUNT(*) as total
                    FROM requests
                    WHERE timestamp >= datetime('now', '-24 hours')
                ''')
                error_stats = cursor.fetchone()
                total_requests = error_stats[1] or 0
                error_count = error_stats[0] or 0
                stats['error_rate'] = {
                    'errors': error_count,
                    'total': total_requests,
                    'rate': (error_count / total_requests * 100) if total_requests > 0 else 0
                }
                
                return stats
                
        except Exception as e:
            logger.error(f"Error getting stats: {str(e)}")
            return {}
    
    def get_client_activity(self, client_ip, hours=24):
        """Get activity for a specific client"""
        try:
            since = datetime.now() - timedelta(hours=hours)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                
                # Get request activity
                cursor = conn.execute('''
                    SELECT timestamp, endpoint, method, status_code
                    FROM requests
                    WHERE client_ip = ? AND timestamp >= ?
                    ORDER BY timestamp DESC
                ''', (client_ip, since.isoformat()))
                
                requests = [dict(row) for row in cursor.fetchall()]
                
                # Get inference activity
                cursor = conn.execute('''
                    SELECT timestamp, model_id, inference_time
                    FROM inference_logs
                    WHERE client_ip = ? AND timestamp >= ?
                    ORDER BY timestamp DESC
                ''', (client_ip, since.isoformat()))
                
                inferences = [dict(row) for row in cursor.fetchall()]
                
                return {
                    'client_ip': client_ip,
                    'requests': requests,
                    'inferences': inferences,
                    'summary': {
                        'total_requests': len(requests),
                        'total_inferences': len(inferences),
                        'first_seen': requests[-1]['timestamp'] if requests else None,
                        'last_seen': requests[0]['timestamp'] if requests else None
                    }
                }
                
        except Exception as e:
            logger.error(f"Error getting client activity: {str(e)}")
            return {'client_ip': client_ip, 'requests': [], 'inferences': [], 'summary': {}}
    
    def cleanup_old_logs(self, days=30):
        """Clean up logs older than specified days"""
        try:
            cutoff_date = datetime.now() - timedelta(days=days)
            
            with self.lock:
                with sqlite3.connect(self.db_path) as conn:
                    # Delete old requests
                    cursor = conn.execute('''
                        DELETE FROM requests 
                        WHERE timestamp < ?
                    ''', (cutoff_date.isoformat(),))
                    
                    requests_deleted = cursor.rowcount
                    
                    # Delete old inference logs
                    cursor = conn.execute('''
                        DELETE FROM inference_logs 
                        WHERE timestamp < ?
                    ''', (cutoff_date.isoformat(),))
                    
                    inference_deleted = cursor.rowcount
                    
                    # Delete old system events
                    cursor = conn.execute('''
                        DELETE FROM system_events 
                        WHERE timestamp < ?
                    ''', (cutoff_date.isoformat(),))
                    
                    events_deleted = cursor.rowcount
                    
                    conn.commit()
                    
                    logger.info(f"Cleaned up old logs: {requests_deleted} requests, "
                              f"{inference_deleted} inferences, {events_deleted} events")
                    
                    return {
                        'requests_deleted': requests_deleted,
                        'inference_deleted': inference_deleted,
                        'events_deleted': events_deleted
                    }
                    
        except Exception as e:
            logger.error(f"Error cleaning up logs: {str(e)}")
            return {'requests_deleted': 0, 'inference_deleted': 0, 'events_deleted': 0}
    
    def get_total_inference_count(self):
        """Get total lifetime inference count"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute('SELECT COUNT(*) FROM inference_logs')
                result = cursor.fetchone()
                return result[0] if result else 0
        except Exception as e:
            logger.error(f"Error getting total inference count: {str(e)}")
            return 0