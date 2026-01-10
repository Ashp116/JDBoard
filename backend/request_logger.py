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
                        session_id TEXT,
                        user_agent TEXT,
                        device_info TEXT,
                        framework TEXT,
                        image_size TEXT,
                        predictions_count INTEGER,
                        confidence_avg REAL
                    )
                ''')

                # Add new columns to existing table if they don't exist
                try:
                    conn.execute('ALTER TABLE inference_logs ADD COLUMN user_agent TEXT')
                except sqlite3.OperationalError:
                    pass  # Column already exists
                try:
                    conn.execute('ALTER TABLE inference_logs ADD COLUMN device_info TEXT')
                except sqlite3.OperationalError:
                    pass  # Column already exists
                try:
                    conn.execute('ALTER TABLE inference_logs ADD COLUMN framework TEXT')
                except sqlite3.OperationalError:
                    pass  # Column already exists
                try:
                    conn.execute('ALTER TABLE inference_logs ADD COLUMN image_size TEXT')
                except sqlite3.OperationalError:
                    pass  # Column already exists
                try:
                    conn.execute('ALTER TABLE inference_logs ADD COLUMN predictions_count INTEGER')
                except sqlite3.OperationalError:
                    pass  # Column already exists
                try:
                    conn.execute('ALTER TABLE inference_logs ADD COLUMN confidence_avg REAL')
                except sqlite3.OperationalError:
                    pass  # Column already exists
                try:
                    conn.execute('ALTER TABLE inference_logs ADD COLUMN device_id TEXT')
                except sqlite3.OperationalError:
                    pass  # Column already exists
                
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
                     image_data=None, session_id=None, user_agent=None, 
                     framework=None, image_size=None):
        # Log an inference operation with enhanced metadata
        try:
            # Debug logging for IP address tracking
            logger.debug(f"Logging inference - Client IP: {client_ip}, Model: {model_id}, User-Agent: {user_agent}")
            # Generate hash of image data for tracking
            image_hash = None
            if image_data is not None:
                image_hash = hashlib.md5(str(image_data).encode()).hexdigest()
            
            # Extract predictions info from result
            predictions_count = 0
            confidence_avg = None
            if result and isinstance(result, dict):
                predictions = result.get('predictions', [])
                if predictions and isinstance(predictions, list):
                    predictions_count = len(predictions)
                    # Calculate average confidence
                    confidences = []
                    for pred in predictions:
                        if isinstance(pred, dict):
                            conf = pred.get('confidence') or pred.get('score') or pred.get('prob')
                            if conf is not None:
                                confidences.append(float(conf))
                    if confidences:
                        confidence_avg = sum(confidences) / len(confidences)
            
            # Parse device info from user agent
            device_info = 'Unknown'
            if user_agent:
                user_agent_lower = user_agent.lower()
                
                # Mobile device detection (more comprehensive)
                if any(keyword in user_agent_lower for keyword in [
                    'mobile', 'android', 'iphone', 'ipod', 'blackberry', 
                    'windows phone', 'opera mini', 'iemobile', 'mobile safari'
                ]):
                    device_info = 'Mobile'
                
                # Tablet detection
                elif any(keyword in user_agent_lower for keyword in [
                    'ipad', 'tablet', 'kindle', 'silk', 'playbook', 'nexus 7',
                    'nexus 9', 'nexus 10', 'galaxy tab', 'sm-t', 'tab-'
                ]):
                    device_info = 'Tablet'
                
                # Jetson/embedded device detection
                elif any(keyword in user_agent_lower for keyword in [
                    'jetson', 'tegra', 'nvidia', 'l4t', 'aarch64', 'arm64'
                ]):
                    device_info = 'Jetson'
                
                # Bot/API detection
                elif any(keyword in user_agent_lower for keyword in [
                    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
                    'python-requests', 'postman', 'insomnia', 'httpie'
                ]):
                    device_info = 'API/Bot'
                
                # Desktop browsers (catch-all for common desktop browsers)
                elif any(keyword in user_agent_lower for keyword in [
                    'chrome', 'firefox', 'safari', 'edge', 'opera', 'webkit'
                ]) and 'mobile' not in user_agent_lower:
                    device_info = 'Desktop'
                
                # If it has Mozilla but no mobile indicators, likely desktop
                elif 'mozilla' in user_agent_lower and 'mobile' not in user_agent_lower:
                    device_info = 'Desktop'
            
            with self.lock:
                with sqlite3.connect(self.db_path) as conn:
                    conn.execute('''
                        INSERT INTO inference_logs 
                        (timestamp, model_id, client_ip, inference_time, 
                         result, image_hash, session_id, user_agent, 
                         device_info, framework, image_size, predictions_count, confidence_avg, device_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        datetime.now().isoformat(),
                        model_id,
                        client_ip,
                        inference_time,
                        json.dumps(result) if result else None,
                        image_hash,
                        session_id or self._generate_session_id(client_ip, user_agent),
                        user_agent,
                        device_info,
                        framework,
                        image_size,
                        predictions_count,
                        confidence_avg,
                        self._generate_device_id(client_ip, user_agent)
                    ))
                    conn.commit()
                    
            # Log successful inference record for debugging
            logger.info(f"Inference logged successfully - Model: {model_id}, IP: {client_ip}, Time: {inference_time:.3f}s, Device: {device_info}")
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
    
    def _generate_device_id(self, client_ip, user_agent=None):
        """Generate a persistent device ID based on client characteristics"""
        # Create a more stable device fingerprint that persists across sessions
        # Use user agent and IP to create a consistent device identifier
        device_data = f"{user_agent or 'unknown'}_{client_ip}"
        device_hash = hashlib.sha256(device_data.encode()).hexdigest()
        
        # Take first 8 characters for a shorter, readable device ID
        device_id = device_hash[:8].upper()
        
        # Add a prefix to make it more readable
        return f"DEV-{device_id}"
    
    def get_logs(self, log_type='requests', page=1, per_page=50, 
                client_ip=None, start_date=None, end_date=None, model_id=None, 
                search=None, device_info=None):
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
            
            # Add model_id filter for inference logs
            if model_id and log_type == 'inference':
                where_conditions.append('model_id = ?')
                params.append(model_id)
            
            # Add device_info filter for inference logs
            if device_info and log_type == 'inference':
                where_conditions.append('device_info = ?')
                params.append(device_info)
            
            # Add search functionality - search across multiple fields
            if search and log_type == 'inference':
                search_term = f"%{search}%"
                search_conditions = [
                    'model_id LIKE ?',
                    'client_ip LIKE ?', 
                    'device_info LIKE ?',
                    'framework LIKE ?',
                    'image_size LIKE ?',
                    'device_id LIKE ?'
                ]
                where_conditions.append(f"({' OR '.join(search_conditions)})")
                # Add search term for each search condition
                params.extend([search_term] * len(search_conditions))
            elif search and log_type == 'requests':
                search_term = f"%{search}%"
                search_conditions = [
                    'endpoint LIKE ?',
                    'method LIKE ?',
                    'client_ip LIKE ?',
                    'user_agent LIKE ?'
                ]
                where_conditions.append(f"({' OR '.join(search_conditions)})")
                params.extend([search_term] * len(search_conditions))
            
            if where_conditions:
                base_query += ' WHERE ' + ' AND '.join(where_conditions)
            
            # Add ordering and pagination
            query = f"{base_query} ORDER BY timestamp DESC LIMIT ? OFFSET ?"
            query_params = params.copy()
            query_params.extend([per_page, offset])
            
            # Get count for pagination
            count_query = f"SELECT COUNT(*) FROM {table}"
            if where_conditions:
                count_query += ' WHERE ' + ' AND '.join(where_conditions)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                
                # Get total count
                total_count = conn.execute(count_query, params).fetchone()[0] if params else conn.execute(count_query).fetchone()[0]
                
                # Get logs
                cursor = conn.execute(query, query_params)
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

    def clear_inference_logs(self):
        """Clear all inference logs"""
        try:
            with self.lock:
                with sqlite3.connect(self.db_path) as conn:
                    # Get count before deletion
                    cursor = conn.execute('SELECT COUNT(*) FROM inference_logs')
                    count_result = cursor.fetchone()
                    count_before = count_result[0] if count_result else 0
                    
                    # Delete all inference logs
                    conn.execute('DELETE FROM inference_logs')
                    conn.commit()
                    
                    # Verify deletion
                    cursor = conn.execute('SELECT COUNT(*) FROM inference_logs')
                    count_result_after = cursor.fetchone()
                    count_after = count_result_after[0] if count_result_after else 0
                    
                    cleared_count = count_before - count_after
                    
                    logger.info(f"Cleared {cleared_count} inference logs (from {count_before} to {count_after})")
                    
                    return {
                        'cleared_count': cleared_count,
                        'timestamp': datetime.now().isoformat()
                    }
                    
        except Exception as e:
            logger.error(f"Error clearing inference logs: {str(e)}")
            return {'cleared_count': 0, 'error': str(e)}

    def get_inference_stats(self):
        """Get detailed inference statistics"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                stats = {}
                
                # Total inference count
                cursor = conn.execute('SELECT COUNT(*) FROM inference_logs')
                stats['total_inferences'] = cursor.fetchone()[0] or 0
                
                # Inferences in last 24 hours
                cursor = conn.execute('''
                    SELECT COUNT(*) FROM inference_logs 
                    WHERE timestamp >= datetime('now', '-24 hours')
                ''')
                stats['inferences_24h'] = cursor.fetchone()[0] or 0
                
                # Inferences in last 7 days
                cursor = conn.execute('''
                    SELECT COUNT(*) FROM inference_logs 
                    WHERE timestamp >= datetime('now', '-7 days')
                ''')
                stats['inferences_7d'] = cursor.fetchone()[0] or 0
                
                # Average inference time (last 100 inferences)
                cursor = conn.execute('''
                    SELECT AVG(inference_time) FROM (
                        SELECT inference_time FROM inference_logs 
                        ORDER BY timestamp DESC LIMIT 100
                    )
                ''')
                result = cursor.fetchone()
                stats['avg_inference_time'] = result[0] if result and result[0] else 0
                
                # Most used models (last 7 days)
                cursor = conn.execute('''
                    SELECT model_id, COUNT(*) as count 
                    FROM inference_logs 
                    WHERE timestamp >= datetime('now', '-7 days')
                    GROUP BY model_id 
                    ORDER BY count DESC 
                    LIMIT 10
                ''')
                stats['top_models'] = [{'model_id': row[0], 'count': row[1]} 
                                     for row in cursor.fetchall()]
                
                # Top clients (last 7 days)
                cursor = conn.execute('''
                    SELECT client_ip, COUNT(*) as count 
                    FROM inference_logs 
                    WHERE timestamp >= datetime('now', '-7 days')
                    GROUP BY client_ip 
                    ORDER BY count DESC 
                    LIMIT 10
                ''')
                stats['top_clients'] = [{'client_ip': row[0], 'count': row[1]} 
                                      for row in cursor.fetchall()]
                
                # Inference frequency by hour (last 24 hours)
                cursor = conn.execute('''
                    SELECT 
                        strftime('%H', timestamp) as hour,
                        COUNT(*) as count
                    FROM inference_logs
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY hour
                    ORDER BY hour
                ''')
                stats['hourly_distribution'] = [{'hour': row[0], 'count': row[1]} 
                                              for row in cursor.fetchall()]
                
                # Performance distribution
                cursor = conn.execute('''
                    SELECT 
                        CASE 
                            WHEN inference_time < 0.1 THEN 'fast'
                            WHEN inference_time < 0.5 THEN 'medium'
                            ELSE 'slow'
                        END as performance,
                        COUNT(*) as count
                    FROM inference_logs
                    WHERE timestamp >= datetime('now', '-7 days')
                    GROUP BY performance
                ''')
                perf_dist = {row[0]: row[1] for row in cursor.fetchall()}
                stats['performance_distribution'] = {
                    'fast': perf_dist.get('fast', 0),
                    'medium': perf_dist.get('medium', 0),
                    'slow': perf_dist.get('slow', 0)
                }
                
                # Recent activity
                cursor = conn.execute('''
                    SELECT timestamp, model_id, client_ip, inference_time
                    FROM inference_logs
                    ORDER BY timestamp DESC
                    LIMIT 10
                ''')
                stats['recent_inferences'] = [
                    {
                        'timestamp': row[0],
                        'model_id': row[1],
                        'client_ip': row[2],
                        'inference_time': row[3]
                    } for row in cursor.fetchall()
                ]
                
                return stats
                
        except Exception as e:
            logger.error(f"Error getting inference stats: {str(e)}")
            return {'total_inferences': 0, 'error': str(e)}