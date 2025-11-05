#!/usr/bin/env python3
"""
System Monitor for Jetson Edge AI Dashboard
Monitors CPU, GPU, memory, temperature, fan, and system information using jetson-stats
"""

import threading
import time
import json
import math
from datetime import datetime
import logging

# Check for jetson-stats availability
try:
    from jtop import jtop
    JTOP_AVAILABLE = True
except Exception:
    JTOP_AVAILABLE = False

logger = logging.getLogger(__name__)

def safe_float(value, default=0, decimal_places=1):
    """Safely convert to float, handling inf/nan values and rounding"""
    try:
        result = float(value)
        if math.isnan(result) or math.isinf(result):
            return default
        return round(result, decimal_places)
    except (ValueError, TypeError):
        return default

def sanitize_data(data):
    """Recursively sanitize data to ensure JSON serialization compatibility"""
    if isinstance(data, dict):
        return {k: sanitize_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data):
            return 0
        return round(data, 1)
    else:
        return data

class SystemMonitor:
    def __init__(self):
        # Check if jetson-stats is available
        if not JTOP_AVAILABLE:
            error_msg = """
ERROR: jetson-stats (jtop) is not available!

This system monitor requires jetson-stats to function properly.
Please install it using:

    sudo apt update
    sudo apt install python3-pip
    sudo pip3 install jetson-stats

After installation, you may need to reboot your system.
            """
            print(error_msg)
            logger.error("jetson-stats is not available - system monitor cannot function")
            raise RuntimeError("jetson-stats is required but not available")
        
        self.monitoring = False
        self.monitor_thread = None
        self.system_data = {
            'cpu': {'usage': 0, 'frequency': 0, 'temperature': 0, 'cores': 0},
            'memory': {'total': 0, 'used': 0, 'available': 0, 'percent': 0},
            'gpu': {'usage': 0, 'memory_used': 0, 'memory_total': 0, 'temperature': 0, 'name': 'Jetson GPU'},
            'disk': {'total': 0, 'used': 0, 'free': 0, 'percent': 0},
            'network': {'bytes_sent': 0, 'bytes_recv': 0},
            'fan': {'speed': 0, 'rpm': 0, 'cpu_temp': 0, 'gpu_temp': 0, 'total_power': 0},
            'processes': 0,
            'uptime': '00:00:00',
            'nvp_model': 'Unknown',
            'jetson_model': 'Unknown',
            'jetson_module': 'Unknown',
            'jetpack_version': 'Unknown',
            'kernel_version': 'Unknown',
            'system_logs': {'recent_logs': [], 'log_count': 0, 'last_updated': None},
            'last_updated': None
        }
        
        # Initialize with real data immediately
        self._update_system_data()
        
    def start_monitoring(self):
        """Start the background monitoring thread"""
        if not self.monitoring:
            self.monitoring = True
            self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self.monitor_thread.start()
            logger.info("System monitoring started (jetson-stats only mode)")
    
    def stop_monitoring(self):
        """Stop the background monitoring"""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join()
        logger.info("System monitoring stopped")
    
    def _monitor_loop(self):
        """Main monitoring loop"""
        while self.monitoring:
            try:
                self._update_system_data()
                time.sleep(1.0)  # Update every 1 second
            except Exception as e:
                logger.error(f"Error in monitoring loop: {str(e)}")
                time.sleep(1.0)
    
    def _update_system_data(self):
        """Update all system metrics using jetson-stats only"""
        try:
            with jtop() as jt:
                stats = jt.stats
                
                # CPU metrics
                self._update_cpu_data(stats)
                
                # Memory metrics
                self._update_memory_data(stats)
                
                # GPU metrics
                self._update_gpu_data(stats)
                
                # Disk metrics
                self._update_disk_data(stats)
                
                # Network metrics
                self._update_network_data(stats)
                
                # Fan metrics
                self._update_fan_data(stats)
                
                # Process count
                self._update_process_data()
                
                # System logs
                self._update_system_logs()
                
                # System info with jtop object for board access
                self._update_system_info(stats, jt)
                
                # Update timestamp
                self.system_data['last_updated'] = datetime.now().isoformat()
                
        except Exception as e:
            logger.error(f"Failed to update system data from jetson-stats: {e}")
            print(f"ERROR: Failed to read from jetson-stats: {e}")
    
    def _update_cpu_data(self, stats):
        """Update CPU data from jetson-stats"""
        try:
            # CPU usage - look for individual CPU cores (CPU1, CPU2, etc.)
            cpu_cores = []
            cpu_total = 0
            core_count = 0
            
            for key, value in stats.items():
                if key.startswith('CPU') and key[3:].isdigit():  # CPU1, CPU2, etc.
                    if isinstance(value, (int, float)):
                        cpu_cores.append(safe_float(value))
                        cpu_total += safe_float(value)
                        core_count += 1
            
            if core_count > 0:
                self.system_data['cpu']['usage'] = round(cpu_total / core_count, 1)
                self.system_data['cpu']['cores'] = cpu_cores  # Store array of core usage values
                self.system_data['cpu']['core_count'] = core_count  # Store count separately
            else:
                # Fallback when no core data is available
                self.system_data['cpu']['usage'] = 0.0
                self.system_data['cpu']['cores'] = []
                self.system_data['cpu']['core_count'] = 0
            
            # CPU frequency - look for frequency data if available
            # Note: frequency might not be directly available in this format
            
            # CPU temperature - look for temperature data
            if 'Temp cpu' in stats:
                temp_val = safe_float(stats['Temp cpu'])
                if 20 < temp_val < 100:  # Reasonable temperature range
                    self.system_data['cpu']['temperature'] = temp_val
            elif 'Temp tj' in stats:  # Alternative CPU temperature
                temp_val = safe_float(stats['Temp tj'])
                if 20 < temp_val < 100:
                    self.system_data['cpu']['temperature'] = temp_val
                                
        except Exception as e:
            logger.debug(f"Error updating CPU data: {e}")
    
    def _update_memory_data(self, stats):
        """Update memory data from jetson-stats"""
        try:
            if 'RAM' in stats:
                ram_percentage = safe_float(stats['RAM'])
                
                # Get total system memory (we need to estimate this)
                # For Jetson devices, we can make reasonable estimates or get from system
                # Let's try to get actual memory values if available, otherwise estimate
                
                # Try to get total memory from system (fallback approach)
                try:
                    import psutil
                    memory_info = psutil.virtual_memory()
                    total_bytes = memory_info.total
                    used_bytes = int(total_bytes * ram_percentage)
                    available_bytes = total_bytes - used_bytes
                    
                    self.system_data['memory'] = {
                        'total': int(total_bytes),
                        'used': int(used_bytes),
                        'available': int(available_bytes),
                        'percent': round(ram_percentage * 100, 1)
                    }
                except ImportError:
                    # If psutil is not available, make reasonable estimates
                    # Assume 8GB for most Jetson devices
                    estimated_total = 8 * 1024 * 1024 * 1024  # 8GB in bytes
                    used_bytes = int(estimated_total * ram_percentage)
                    available_bytes = estimated_total - used_bytes
                    
                    self.system_data['memory'] = {
                        'total': int(estimated_total),
                        'used': int(used_bytes),
                        'available': int(available_bytes),
                        'percent': round(ram_percentage * 100, 1)
                    }
                        
        except Exception as e:
            logger.debug(f"Error updating memory data: {e}")
    
    def _update_gpu_data(self, stats):
        """Update GPU data from jetson-stats"""
        try:
            # GPU usage
            if 'GPU' in stats:
                gpu_usage = safe_float(stats['GPU'])
                self.system_data['gpu']['usage'] = gpu_usage
            
            # GPU memory - for Jetson, GPU shares system RAM
            if 'RAM' in stats:
                ram_percentage = safe_float(stats['RAM'])
                
                # Get total system memory for GPU memory calculation
                try:
                    import psutil
                    memory_info = psutil.virtual_memory()
                    total_bytes = memory_info.total
                    # For integrated GPU, estimate GPU memory as portion of system RAM
                    gpu_mem_total = int(total_bytes * 0.5)  # Estimate 50% can be used by GPU
                    gpu_mem_used = int(total_bytes * ram_percentage * 0.3)  # Rough estimate of GPU usage
                    
                    self.system_data['gpu']['memory_total'] = gpu_mem_total
                    self.system_data['gpu']['memory_used'] = gpu_mem_used
                except ImportError:
                    # Fallback estimates
                    estimated_total = 8 * 1024 * 1024 * 1024  # 8GB
                    self.system_data['gpu']['memory_total'] = int(estimated_total * 0.5)
                    self.system_data['gpu']['memory_used'] = int(estimated_total * ram_percentage * 0.3)
            
            # GPU temperature - directly available
            if 'Temp gpu' in stats:
                temp_val = safe_float(stats['Temp gpu'])
                if 20 < temp_val < 120:  # Reasonable GPU temperature range
                    self.system_data['gpu']['temperature'] = temp_val
                                
        except Exception as e:
            logger.debug(f"Error updating GPU data: {e}")
    
    def _update_disk_data(self, stats):
        """Update disk data from jetson-stats"""
        try:
            # DISK data not available in the stats format provided
            # Use fallback method with psutil if available
            try:
                import psutil
                disk = psutil.disk_usage('/')
                self.system_data['disk'] = {
                    'total': disk.total,
                    'used': disk.used,
                    'free': disk.free,
                    'percent': round((disk.used / disk.total) * 100, 1)
                }
            except ImportError:
                logger.debug("psutil not available for disk stats")
                                
        except Exception as e:
            logger.debug(f"Error updating disk data: {e}")
    
    def _update_network_data(self, stats):
        """Update network data from jetson-stats"""
        try:
            # NET data not available in the stats format provided
            # Use fallback method with psutil if available
            try:
                import psutil
                net_io = psutil.net_io_counters()
                self.system_data['network'] = {
                    'bytes_sent': net_io.bytes_sent,
                    'bytes_recv': net_io.bytes_recv
                }
            except ImportError:
                logger.debug("psutil not available for network stats")
                    
        except Exception as e:
            logger.debug(f"Error updating network data: {e}")
    
    def _update_fan_data(self, stats):
        """Update fan data from jetson-stats"""
        try:
            fan_data = {}
            
            # Look for fan speed data
            if 'Fan pwmfan0' in stats:
                fan_data['speed'] = safe_float(stats['Fan pwmfan0'], 0, 1)  # Fan speed percentage
            
            # Calculate RPM estimate (this is approximate - actual RPM depends on fan specs)
            # Most Jetson fans run at ~5000 RPM at 100% speed
            if 'speed' in fan_data:
                estimated_rpm = int((fan_data['speed'] / 100.0) * 5000)
                fan_data['rpm'] = estimated_rpm
            
            # Get temperature data that might be related to fan control
            if 'Temp cpu' in stats:
                fan_data['cpu_temp'] = safe_float(stats['Temp cpu'], 0, 1)
            if 'Temp gpu' in stats:
                fan_data['gpu_temp'] = safe_float(stats['Temp gpu'], 0, 1)
            
            # Get power data (fan control is often tied to power consumption)
            if 'Power TOT' in stats:
                fan_data['total_power'] = safe_float(stats['Power TOT'], 0, 1)
            
            # Set default values if no data available
            if not fan_data:
                fan_data = {
                    'speed': 0,
                    'rpm': 0,
                    'cpu_temp': 0,
                    'gpu_temp': 0,
                    'total_power': 0
                }
            
            self.system_data['fan'] = fan_data
            
        except Exception as e:
            logger.debug(f"Error updating fan data: {e}")
            # Set fallback values
            self.system_data['fan'] = {
                'speed': 0,
                'rpm': 0,
                'cpu_temp': 0,
                'gpu_temp': 0,
                'total_power': 0
            }

    def _update_process_data(self):
        """Update process count data"""
        try:
            # Try to get process count using psutil first
            try:
                import psutil
                # Get total number of running processes
                process_count = len(psutil.pids())
                self.system_data['processes'] = process_count
            except ImportError:
                # Fallback to reading from /proc if psutil is not available
                try:
                    import os
                    # Count directories in /proc that represent PIDs
                    proc_dirs = [d for d in os.listdir('/proc') if d.isdigit()]
                    self.system_data['processes'] = len(proc_dirs)
                except Exception:
                    # Final fallback - set a reasonable default
                    self.system_data['processes'] = 0
                    logger.debug("Could not determine process count")
                                
        except Exception as e:
            logger.debug(f"Error updating process data: {e}")
            self.system_data['processes'] = 0
    
    def _update_system_info(self, stats, jt=None):
        """Update system information from jetson-stats"""
        try:
            # Uptime - handle datetime.timedelta object
            if 'uptime' in stats:
                uptime_obj = stats['uptime']
                if hasattr(uptime_obj, 'total_seconds'):  # timedelta object
                    total_seconds = int(uptime_obj.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    seconds = total_seconds % 60
                    self.system_data['uptime'] = f"{hours}:{minutes:02d}:{seconds:02d}"
                else:
                    # Fallback to string conversion
                    uptime_str = str(uptime_obj)
                    if '.' in uptime_str:
                        uptime_str = uptime_str.split('.')[0]
                    self.system_data['uptime'] = uptime_str
            
            # NVP Model
            if 'nvp model' in stats:
                self.system_data['nvp_model'] = str(stats['nvp model'])
            
            # Jetson model - try to get from jtop board information
            jetson_model = 'Jetson Device'  # Default
            jetson_module = 'Unknown Module'  # Default for module
            jetpack_version = 'Unknown'  # Default for JetPack version
            
            if jt and hasattr(jt, 'board') and jt.board:
                try:
                    # Get model from jtop.board['hardware']['Model']
                    if 'hardware' in jt.board and 'Model' in jt.board['hardware']:
                        jetson_model = jt.board['hardware']['Model']
                        logger.debug(f"Got Jetson model from jtop: {jetson_model}")
                    
                    # Get module from jtop.board['hardware']['Module'] separately
                    if 'hardware' in jt.board and 'Module' in jt.board['hardware']:
                        jetson_module = jt.board['hardware']['Module']
                        logger.debug(f"Got Jetson module from jtop: {jetson_module}")
                    
                    # Get JetPack version from jtop.board['hardware']['Jetpack']
                    if 'hardware' in jt.board and 'Jetpack' in jt.board['hardware']:
                        jetpack_version = jt.board['hardware']['Jetpack']
                        logger.debug(f"Got JetPack version from jtop: {jetpack_version}")
                        
                except Exception as board_e:
                    logger.debug(f"Error accessing jtop board info: {board_e}")
            
            self.system_data['jetson_model'] = jetson_model
            self.system_data['jetson_module'] = jetson_module
            self.system_data['jetpack_version'] = jetpack_version
            
            # Get kernel version
            kernel_version = 'Unknown'
            try:
                # Try to get from jtop board platform info first
                if jt and hasattr(jt, 'board') and jt.board:
                    if 'platform' in jt.board and 'Release' in jt.board['platform']:
                        kernel_version = jt.board['platform']['Release']
                        logger.debug(f"Got kernel version from jtop platform: {kernel_version}")
                    else:
                        # Fallback to system uname
                        import platform
                        kernel_version = platform.release()
                        logger.debug(f"Got kernel version from platform.release(): {kernel_version}")
                else:
                    # Fallback to system uname
                    import platform
                    kernel_version = platform.release()
                    logger.debug(f"Got kernel version from platform.release(): {kernel_version}")
            except Exception as kernel_e:
                logger.debug(f"Error getting kernel version: {kernel_e}")
                # Final fallback - try reading from /proc/version
                try:
                    with open('/proc/version', 'r') as f:
                        version_line = f.read().strip()
                        # Extract kernel version (usually the third word)
                        parts = version_line.split()
                        if len(parts) >= 3:
                            kernel_version = parts[2]
                except Exception:
                    kernel_version = 'Unknown'
            
            self.system_data['kernel_version'] = kernel_version
                    
        except Exception as e:
            logger.debug(f"Error updating system info: {e}")
    
    def _update_system_logs(self):
        """Update system logs data"""
        try:
            import subprocess
            from datetime import datetime
            
            logs = []
            
            # Try to get recent system logs from journalctl first
            try:
                result = subprocess.run(
                    ['journalctl', '--no-pager', '-n', '20', '--since', '1 hour ago'],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    log_lines = result.stdout.strip().split('\n')
                    for line in log_lines:
                        if line.strip():
                            logs.append(line.strip())
            except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
                # Fallback to reading syslog directly
                try:
                    with open('/var/log/syslog', 'r') as f:
                        # Read last 20 lines
                        lines = f.readlines()
                        for line in lines[-20:]:
                            if line.strip():
                                logs.append(line.strip())
                except (FileNotFoundError, PermissionError):
                    # Fallback to dmesg
                    try:
                        result = subprocess.run(
                            ['dmesg', '-T', '--level=err,warn,info'], 
                            capture_output=True, text=True, timeout=5
                        )
                        if result.returncode == 0:
                            log_lines = result.stdout.strip().split('\n')
                            for line in log_lines[-10:]:  # Last 10 dmesg entries
                                if line.strip():
                                    logs.append(line.strip())
                    except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
                        logs.append("System logs unavailable")
            
            # Update system logs data
            self.system_data['system_logs'].update({
                'recent_logs': logs[-20:],  # Keep last 20 logs
                'log_count': len(logs),
                'last_updated': datetime.now().isoformat()
            })
                    
        except Exception as e:
            logger.debug(f"Error updating system logs: {e}")
            self.system_data['system_logs'].update({
                'recent_logs': [f"Error reading logs: {str(e)}"],
                'log_count': 1,
                'last_updated': datetime.now().isoformat()
            })
    
    def get_system_status(self):
        """Get current system status with sanitized data"""
        return sanitize_data(dict(self.system_data))
    
    def get_gpu_status(self):
        """Get detailed GPU status"""
        return self.system_data['gpu']
    
    def get_cpu_cores_usage(self):
        """Get per-core CPU usage from jetson-stats"""
        try:
            with jtop() as jt:
                stats = jt.stats
                cores_usage = []
                
                # Look for individual CPU cores (CPU1, CPU2, etc.)
                cpu_keys = [key for key in stats.keys() if key.startswith('CPU') and key[3:].isdigit()]
                cpu_keys.sort()  # Sort to get consistent order
                
                for key in cpu_keys:
                    if isinstance(stats[key], (int, float)):
                        cores_usage.append(safe_float(stats[key]))
                
                return cores_usage if cores_usage else [self.system_data['cpu']['usage']]
                
        except Exception as e:
            logger.debug(f"Error getting CPU cores usage: {e}")
            return [self.system_data['cpu']['usage']]
    
    def get_process_list(self, limit=10):
        """Get top processes - not available from jetson-stats, return empty list"""
        logger.warning("Process list not available in jetson-stats only mode")
        return []
    
    def get_network_connections(self):
        """Get network connections - not available from jetson-stats, return empty list"""
        logger.warning("Network connections not available in jetson-stats only mode")
        return []
    
    def get_jetson_info(self):
        """Get Jetson-specific information from jetson-stats"""
        info = {
            'nvp_model': self.system_data.get('nvp_model', 'Unknown'),
            'jetson_model': self.system_data.get('jetson_model', 'Unknown'),
            'jetson_module': self.system_data.get('jetson_module', 'Unknown'),
            'jetpack_version': self.system_data.get('jetpack_version', 'Unknown'),
            'kernel_version': self.system_data.get('kernel_version', 'Unknown'),
            'board_name': 'Unknown'
        }
        
        # Try to get additional info from jetson-stats
        try:
            with jtop() as jt:
                stats = jt.stats
                
                # Board information
                if 'board' in stats:
                    board_info = stats['board']
                    if isinstance(board_info, dict):
                        info['board_name'] = str(board_info.get('model', board_info.get('name', 'Unknown')))
                
        except Exception as e:
            logger.debug(f"Error getting Jetson info: {e}")
        
        return info
    
    def get_system_logs(self):
        """Get current system logs data"""
        return sanitize_data(self.system_data['system_logs'])