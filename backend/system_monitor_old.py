#!/usr/bin/env python3
"""
System Monitor for Jetson Edge AI Dashboard
Monitors CPU, GPU, memory, temperature, and other system metrics using jetson-stats only
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
            'uptime': '00:00:00',
            'nvp_model': 'Unknown',
            'jetson_model': 'Unknown',
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
                
                # System info
                self._update_system_info(stats)
                
                # Update timestamp
                self.system_data['last_updated'] = datetime.now().isoformat()
                
        except Exception as e:
            logger.error(f"Failed to update system data from jetson-stats: {e}")
            print(f"ERROR: Failed to read from jetson-stats: {e}")
    
    def _update_cpu_data(self, stats):
        """Update CPU data from jetson-stats"""
        try:
            # CPU usage
            if 'CPU' in stats:
                cpu_data = stats['CPU']
                if isinstance(cpu_data, dict):
                    # If CPU is a dict with individual core data
                    total_usage = 0
                    core_count = 0
                    for key, value in cpu_data.items():
                        if isinstance(value, (int, float)):
                            total_usage += safe_float(value)
                            core_count += 1
                    if core_count > 0:
                        self.system_data['cpu']['usage'] = round(total_usage / core_count, 1)
                        self.system_data['cpu']['cores'] = core_count
                else:
                    # If CPU is a single value
                    self.system_data['cpu']['usage'] = safe_float(cpu_data)
            
            # CPU frequency
            if 'FREQ' in stats and 'CPU' in stats['FREQ']:
                cpu_freq = stats['FREQ']['CPU']
                if isinstance(cpu_freq, dict):
                    # Get current frequency
                    freq_val = cpu_freq.get('cur', cpu_freq.get('val', 0))
                    self.system_data['cpu']['frequency'] = safe_float(freq_val, 0, 0)
                else:
                    self.system_data['cpu']['frequency'] = safe_float(cpu_freq, 0, 0)
            
            # CPU temperature
            if 'thermal' in stats:
                thermal = stats['thermal']
                if isinstance(thermal, dict):
                    # Look for CPU temperature in thermal data
                    for key in ['CPU', 'cpu', 'BCPU-therm', 'CPU-therm']:
                        if key in thermal:
                            temp_val = safe_float(thermal[key])
                            if 20 < temp_val < 100:  # Reasonable temperature range
                                self.system_data['cpu']['temperature'] = temp_val
                                break
                                
        except Exception as e:
            logger.debug(f"Error updating CPU data: {e}")
    
    def _update_memory_data(self, stats):
        """Update memory data from jetson-stats"""
        try:
            if 'RAM' in stats:
                ram_data = stats['RAM']
                if isinstance(ram_data, dict):
                    # Extract memory information
                    total = ram_data.get('tot', ram_data.get('total', 0))
                    used = ram_data.get('used', 0)
                    free = ram_data.get('free', 0)
                    
                    if total > 0:
                        total_bytes = safe_float(total) * 1024 * 1024  # Convert MB to bytes
                        used_bytes = safe_float(used) * 1024 * 1024
                        free_bytes = safe_float(free) * 1024 * 1024
                        available_bytes = total_bytes - used_bytes
                        
                        self.system_data['memory'] = {
                            'total': int(total_bytes),
                            'used': int(used_bytes),
                            'available': int(available_bytes),
                            'percent': round((used_bytes / total_bytes) * 100, 1) if total_bytes > 0 else 0
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
            
            # GPU memory
            if 'RAM' in stats:
                ram_data = stats['RAM']
                if isinstance(ram_data, dict):
                    # For Jetson, GPU shares system RAM
                    total = ram_data.get('tot', ram_data.get('total', 0))
                    used = ram_data.get('used', 0)
                    
                    if total > 0:
                        # Estimate GPU memory usage (this is approximate for integrated GPU)
                        gpu_mem_total = safe_float(total) * 1024 * 1024  # Convert MB to bytes
                        gpu_mem_used = safe_float(used) * 0.3 * 1024 * 1024  # Rough estimate
                        
                        self.system_data['gpu']['memory_total'] = int(gpu_mem_total)
                        self.system_data['gpu']['memory_used'] = int(gpu_mem_used)
            
            # GPU temperature
            if 'thermal' in stats:
                thermal = stats['thermal']
                if isinstance(thermal, dict):
                    # Look for GPU temperature
                    for key in ['GPU', 'gpu', 'GPU-therm', 'thermal-fan-est']:
                        if key in thermal:
                            temp_val = safe_float(thermal[key])
                            if 20 < temp_val < 120:  # Reasonable GPU temperature range
                                self.system_data['gpu']['temperature'] = temp_val
                                break
                                
        except Exception as e:
            logger.debug(f"Error updating GPU data: {e}")
    
    def _update_disk_data(self, stats):
        """Update disk data from jetson-stats"""
        try:
            if 'DISK' in stats:
                disk_data = stats['DISK']
                if isinstance(disk_data, dict):
                    # Look for root partition or main disk
                    for partition_name, partition_data in disk_data.items():
                        if isinstance(partition_data, dict) and ('/' in partition_name or 'mmcblk' in partition_name):
                            total = partition_data.get('total', 0)
                            used = partition_data.get('used', 0)
                            free = partition_data.get('free', partition_data.get('avail', 0))
                            
                            if total > 0:
                                total_bytes = safe_float(total) * 1024 * 1024  # Convert MB to bytes
                                used_bytes = safe_float(used) * 1024 * 1024
                                free_bytes = safe_float(free) * 1024 * 1024
                                
                                self.system_data['disk'] = {
                                    'total': int(total_bytes),
                                    'used': int(used_bytes),
                                    'free': int(free_bytes),
                                    'percent': round((used_bytes / total_bytes) * 100, 1) if total_bytes > 0 else 0
                                }
                                break
                                
        except Exception as e:
            logger.debug(f"Error updating disk data: {e}")
    
    def _update_network_data(self, stats):
        """Update network data from jetson-stats"""
        try:
            if 'NET' in stats:
                net_data = stats['NET']
                if isinstance(net_data, dict):
                    total_sent = 0
                    total_recv = 0
                    
                    for interface, interface_data in net_data.items():
                        if isinstance(interface_data, dict):
                            sent = interface_data.get('tx', interface_data.get('sent', 0))
                            recv = interface_data.get('rx', interface_data.get('recv', 0))
                            
                            total_sent += safe_float(sent, 0, 0)
                            total_recv += safe_float(recv, 0, 0)
                    
                    self.system_data['network'] = {
                        'bytes_sent': int(total_sent),
                        'bytes_recv': int(total_recv)
                    }
                    
        except Exception as e:
            logger.debug(f"Error updating network data: {e}")
    
    def _update_system_info(self, stats):
        """Update system information from jetson-stats"""
        try:
            # Uptime
            if 'uptime' in stats:
                uptime_str = str(stats['uptime'])
                # Parse and round jtop uptime string (like "2:42:37.940000" -> "2:42:38")
                if uptime_str and uptime_str != 'None':
                    if '.' in uptime_str:
                        time_part = uptime_str.split('.')[0]
                        parts = time_part.split(':')
                        if len(parts) == 3:
                            try:
                                hours, minutes, seconds = parts
                                # Round the fractional part from original string
                                original_seconds = float(uptime_str.split(':')[-1])
                                rounded_seconds = round(original_seconds)
                                self.system_data['uptime'] = f"{hours}:{minutes}:{rounded_seconds:02d}"
                            except ValueError:
                                self.system_data['uptime'] = time_part
                        else:
                            self.system_data['uptime'] = time_part
                    else:
                        self.system_data['uptime'] = uptime_str
            
            # NVP Model
            if 'nvp model' in stats:
                self.system_data['nvp_model'] = str(stats['nvp model'])
            
            # Jetson model
            if 'board' in stats:
                board_info = stats['board']
                if isinstance(board_info, dict):
                    model = board_info.get('model', board_info.get('name', 'Unknown'))
                    self.system_data['jetson_model'] = str(model)
                else:
                    self.system_data['jetson_model'] = str(board_info)
                    
        except Exception as e:
            logger.debug(f"Error updating system info: {e}")
    
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
                if 'CPU' in stats and isinstance(stats['CPU'], dict):
                    cores_usage = []
                    for key, value in stats['CPU'].items():
                        if isinstance(value, (int, float)):
                            cores_usage.append(safe_float(value))
                    return cores_usage
                else:
                    # Return single core usage as list
                    return [self.system_data['cpu']['usage']]
        except Exception as e:
            logger.debug(f"Error getting CPU cores usage: {e}")
            return [self.system_data['cpu']['usage']]
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
        self.monitoring = False
        self.monitor_thread = None
        self.system_data = {
            'cpu': {'usage': 0, 'frequency': 0, 'temperature': 0},
            'memory': {'total': 0, 'used': 0, 'available': 0, 'percent': 0},
            'gpu': {'usage': 0, 'memory_used': 0, 'memory_total': 0, 'name': 'Unknown'},
            'disk': {'total': 0, 'used': 0, 'free': 0, 'percent': 0},
            'network': {'bytes_sent': 0, 'bytes_recv': 0},
            'uptime': '00:00:00',
            'nvp_model': 'Unknown',
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
            logger.info("System monitoring started")
    
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
                time.sleep(1.0)  # Update every 1 second to match websocket
            except Exception as e:
                logger.error(f"Error in monitoring loop: {str(e)}")
                time.sleep(1.0)  # Reduced from 2 seconds to 1 second
    
    def _update_system_data(self):
        """Update all system metrics"""
        # CPU metrics - use faster readings
        cpu_usage = psutil.cpu_percent(interval=None)  # Non-blocking for faster updates
        if cpu_usage == 0:  # If still zero, force a very quick calculation
            cpu_usage = psutil.cpu_percent(interval=0.1)
        
        self.system_data['cpu']['usage'] = round(cpu_usage, 1)
        
        cpu_freq = psutil.cpu_freq()
        if cpu_freq:
            self.system_data['cpu']['frequency'] = round(cpu_freq.current, 0)
        
        # CPU temperature (Jetson specific)
        self.system_data['cpu']['temperature'] = self._get_cpu_temperature()
        
        # Memory metrics
        memory = psutil.virtual_memory()
        self.system_data['memory'] = {
            'total': memory.total,
            'used': memory.used,
            'available': memory.available,
            'percent': round(memory.percent, 1)
        }
        
        # GPU metrics - prefer jetson-stats if available
        if JTOP_AVAILABLE:
            try:
                jtop_data = self._update_from_jtop()
                self.system_data.update(jtop_data)
            except Exception as e:
                logger.debug(f"jtop failed, falling back: {e}")
                self.system_data['gpu'] = self._get_gpu_stats()
        else:
            self.system_data['gpu'] = self._get_gpu_stats()
        
        # Disk metrics
        disk = psutil.disk_usage('/')
        self.system_data['disk'] = {
            'total': disk.total,
            'used': disk.used,
            'free': disk.free,
            'percent': round((disk.used / disk.total) * 100, 1)
        }
        
        # Network metrics
        net_io = psutil.net_io_counters()
        self.system_data['network'] = {
            'bytes_sent': net_io.bytes_sent,
            'bytes_recv': net_io.bytes_recv
        }
        
        # System uptime (fallback to psutil if not set by jtop)
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        # Format uptime as a readable string (HH:MM:SS)
        hours = int(uptime_seconds // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        seconds = int(uptime_seconds % 60)
        self.system_data['uptime'] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        
        # NVP Model (if not already set by jtop)
        if self.system_data.get('nvp_model') == 'Unknown':
            self.system_data['nvp_model'] = self._get_nvp_model()
        
        # Update timestamp
        self.system_data['last_updated'] = datetime.now().isoformat()
    
    def _get_cpu_temperature(self):
        """Get CPU temperature for Jetson devices"""
        try:
            # If jtop is available, prefer its thermal readings
            if JTOP_AVAILABLE:
                try:
                    with jtop() as jt:
                        stats = jt.stats
                        # Use CPU temperature directly from jtop
                        if 'Temp cpu' in stats:
                            cpu_temp = safe_float(stats['Temp cpu'])
                            if cpu_temp > -200:  # Filter out invalid readings
                                return cpu_temp
                        # Try other temperature sensors as fallback
                        temp_keys = ['Temp tj', 'Temp soc0', 'Temp soc1', 'Temp soc2']
                        for key in temp_keys:
                            if key in stats:
                                temp_val = safe_float(stats[key])
                                if 20 < temp_val < 100:
                                    return temp_val
                except Exception as e:
                    logger.debug(f"jtop CPU temperature read failed: {e}")

            # Fallback methods for temperature reading
            # Try Jetson thermal zones
            thermal_zones = [
                '/sys/class/thermal/thermal_zone0/temp',
                '/sys/class/thermal/thermal_zone1/temp',
                '/sys/devices/virtual/thermal/thermal_zone0/temp',
                '/sys/devices/virtual/thermal/thermal_zone1/temp'
            ]
            
            for zone in thermal_zones:
                try:
                    with open(zone, 'r') as f:
                        temp = int(f.read().strip()) / 1000.0
                        if 20 < temp < 100:  # Reasonable temperature range
                            return temp
                except (FileNotFoundError, ValueError, PermissionError):
                    continue
            
            # Fallback: try sensors command
            try:
                result = subprocess.run(['sensors'], capture_output=True, text=True, timeout=1)
                if result.returncode == 0:
                    # Parse sensors output for temperature
                    lines = result.stdout.split('\n')
                    for line in lines:
                        if 'Core' in line or 'CPU' in line or 'temp' in line.lower():
                            match = re.search(r'(\d+\.?\d*)\s*°C', line)
                            if match:
                                return safe_float(match.group(1))
            except (subprocess.TimeoutExpired, subprocess.SubprocessError):
                pass
                
        except Exception as e:
            logger.debug(f"Could not get CPU temperature: {str(e)}")
        
        return 0
    
    def _get_gpu_stats(self):
        """Get GPU statistics with improved monitoring - prioritizing tegrastats for Jetson"""
        gpu_stats = {
            'usage': 0,
            'memory_used': 0,
            'memory_total': 0,
            'name': 'Unknown'
        }
        
        # Method 1: Try jetson-stats (jtop) Python module for Jetson devices
        if JTOP_AVAILABLE:
            try:
                with jtop() as jt:
                    stats = jt.stats
                    logger.debug(f"jtop stats available: {list(stats.keys()) if isinstance(stats, dict) else 'N/A'}")
                    
                    # GPU usage - direct from 'GPU' key
                    if 'GPU' in stats:
                        gpu_stats['usage'] = safe_float(stats['GPU'])
                    
                    # Memory info - RAM is a percentage, need to get actual values
                    if 'RAM' in stats:
                        # RAM is given as a percentage (0-1), we need to convert to actual values
                        ram_percent = safe_float(stats['RAM'])
                        # Get total system memory for calculation
                        import psutil
                        memory = psutil.virtual_memory()
                        gpu_stats['memory_used'] = int(memory.total * ram_percent)
                        gpu_stats['memory_total'] = memory.total
                    
                    
                    gpu_stats['name'] = 'Jetson GPU'
                    logger.debug(f"jtop GPU stats: {gpu_stats}")
                    
                    # Return if we got meaningful data
                    if (gpu_stats['usage'] > 0 or gpu_stats['memory_total'] > 0):
                        return gpu_stats
                        
            except Exception as e:
                logger.debug(f"jtop GPU read failed: {e}")
        
        # Method 2: Try jtop command directly for Jetson devices (fallback)
        try:
            # Use jtop command with --json flag to get structured data
            result = subprocess.run(['jtop', '--json'], 
                                  capture_output=True, text=True, timeout=1)
            if result.returncode == 0 and result.stdout:
                try:
                    jtop_data = json.loads(result.stdout)
                    logger.debug(f"jtop JSON data keys: {list(jtop_data.keys()) if isinstance(jtop_data, dict) else 'N/A'}")
                    
                    # Extract GPU usage
                    if 'gpu' in jtop_data:
                        gpu_info = jtop_data['gpu']
                        if isinstance(gpu_info, dict):
                            for key in ['val', 'cur', 'usage', '%']:
                                if key in gpu_info:
                                    gpu_stats['usage'] = safe_float(gpu_info[key])
                                    break
                        else:
                            gpu_stats['usage'] = safe_float(gpu_info)
                    
                    # Extract memory info
                    if 'ram' in jtop_data and isinstance(jtop_data['ram'], dict):
                        ram = jtop_data['ram']
                        used = ram.get('used', 0)
                        total = ram.get('tot', 0) or ram.get('total', 0)
                        if used and total:
                            gpu_stats['memory_used'] = safe_float(used) * 1024 * 1024  # Convert MB to bytes
                            gpu_stats['memory_total'] = safe_float(total) * 1024 * 1024
                    
                    # Extract power if available
                    if 'power' in jtop_data and isinstance(jtop_data['power'], dict):
                        power = jtop_data['power']
                        for power_key in ['gpu', 'GPU', 'cur']:
                            if power_key in power:
                                gpu_stats['power_draw'] = safe_float(power[power_key])
                                break
                    
                    gpu_stats['name'] = 'Jetson GPU'
                    logger.debug(f"jtop command GPU stats: {gpu_stats}")
                    
                    # Return if we got meaningful data
                    if (gpu_stats['usage'] > 0 or gpu_stats['memory_total'] > 0):
                        return gpu_stats
                        
                except json.JSONDecodeError as e:
                    logger.debug(f"jtop JSON parse failed: {e}")
                    
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, ValueError, FileNotFoundError) as e:
            logger.debug(f"jtop command failed: {e}")
        
        # Method 2: Try tegrastats for Jetson devices (fallback)
        try:
            result = subprocess.run(['tegrastats', '--interval', '200'], 
                                  capture_output=True, text=True, timeout=1)
            if result.returncode == 0 and result.stdout:
                output = result.stdout
                logger.debug(f"tegrastats output: {output[:200]}...")
                
                # Parse GR3D (GPU) usage - multiple possible formats
                gr3d_patterns = [
                    r'GR3D_FREQ\s+(\d+)%',
                    r'GR3D\s+(\d+)%',
                    r'GPU\s+(\d+)%'
                ]
                for pattern in gr3d_patterns:
                    gr3d_match = re.search(pattern, output)
                    if gr3d_match:
                        gpu_stats['usage'] = safe_float(gr3d_match.group(1))
                        break
                
                # Parse memory usage - look for RAM or MEM
                mem_patterns = [
                    r'RAM\s+(\d+)/(\d+)MB',
                    r'MEM\s+(\d+)/(\d+)MB',
                    r'memory\s+(\d+)/(\d+)MB'
                ]
                for pattern in mem_patterns:
                    mem_match = re.search(pattern, output)
                    if mem_match:
                        used_mb, total_mb = mem_match.groups()
                        gpu_stats['memory_used'] = safe_float(used_mb) * 1024 * 1024
                        gpu_stats['memory_total'] = safe_float(total_mb) * 1024 * 1024
                        break
                
                gpu_stats['name'] = 'Jetson GPU'
                logger.debug(f"tegrastats GPU stats: {gpu_stats}")
                
                # Return if we got meaningful data
                if (gpu_stats['usage'] > 0 or gpu_stats['memory_total'] > 0):
                    return gpu_stats
                    
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, ValueError, FileNotFoundError) as e:
            logger.debug(f"tegrastats failed: {e}")
        
        # Method 2: Try nvidia-smi for discrete GPUs
        try:
            result = subprocess.run([
                'nvidia-smi', 
                '--query-gpu=utilization.gpu,memory.used,memory.total,name',
                '--format=csv,noheader,nounits'
            ], capture_output=True, text=True, timeout=1)
            
            if result.returncode == 0 and result.stdout.strip():
                lines = result.stdout.strip().split('\n')
                if lines and lines[0]:
                    values = [v.strip() for v in lines[0].split(',')]
                    if len(values) >= 6:
                        gpu_stats.update({
                            'usage': safe_float(values[0]) if values[0] not in ['[Not Supported]', 'N/A'] else 0,
                            'memory_used': safe_float(values[1]) * 1024 * 1024 if values[1] not in ['[Not Supported]', 'N/A'] else 0,  # Convert MB to bytes
                            'memory_total': safe_float(values[2]) * 1024 * 1024 if values[2] not in ['[Not Supported]', 'N/A'] else 0,
                            'temperature': safe_float(values[3]) if values[3] not in ['[Not Supported]', 'N/A'] else 0,
                            'power_draw': safe_float(values[4]) if values[4] not in ['[Not Supported]', 'N/A'] else 0,
                            'name': values[5].strip() if len(values) > 5 else 'NVIDIA GPU'
                        })
                        logger.debug(f"nvidia-smi GPU stats: {gpu_stats}")
                        return gpu_stats
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, ValueError, FileNotFoundError) as e:
            logger.debug(f"nvidia-smi failed: {e}")
        
        # Method 2: Try jetson-stats (jtop) for Jetson devices
        if JTOP_AVAILABLE:
            try:
                with jtop() as jt:
                    stats = jt.stats
                    logger.debug(f"jtop stats available: {list(stats.keys()) if isinstance(stats, dict) else 'N/A'}")
                    
                    # GPU usage - try multiple possible keys
                    gpu_usage_keys = ['GPU', 'gpu', 'GR3D_FREQ', 'gr3d']
                    for key in gpu_usage_keys:
                        if key in stats:
                            usage_val = stats.get(key)
                            if isinstance(usage_val, dict):
                                # Sometimes GPU info is nested
                                for subkey in ['val', 'cur', 'usage', '%']:
                                    if subkey in usage_val:
                                        gpu_stats['usage'] = safe_float(usage_val[subkey])
                                        break
                            else:
                                gpu_stats['usage'] = safe_float(usage_val)
                            if gpu_stats['usage'] > 0:
                                break
                    
                    # Memory info - try multiple approaches
                    ram_keys = ['RAM', 'ram', 'MEM', 'memory']
                    for ram_key in ram_keys:
                        if ram_key in stats and isinstance(stats[ram_key], dict):
                            ram = stats[ram_key]
                            # Try different memory field combinations
                            used = (ram.get('used') or ram.get('use') or 
                                   ram.get('lfb', {}).get('used', 0) or 0)
                            total = (ram.get('total') or ram.get('tot') or 
                                    ram.get('lfb', {}).get('total', 0) or 0)
                            
                            if used > 0 and total > 0:
                                gpu_stats['memory_used'] = safe_float(used) * 1024 * 1024  # Convert MB to bytes
                                gpu_stats['memory_total'] = safe_float(total) * 1024 * 1024
                                break
                    
                    # Temperature - comprehensive search
                    temp_sources = [
                        ('thermal', ['GPU', 'gpu', 'thermal-fan-est', 'GPU-therm', 'GPU_temp', 'BCPU-therm']),
                        ('temperature', ['GPU', 'gpu', 'thermal']),
                        ('temp', ['GPU', 'gpu'])
                    ]
                    
                    for temp_section, temp_keys in temp_sources:
                        if temp_section in stats:
                            thermal = stats[temp_section]
                            if isinstance(thermal, dict):
                                for temp_key in temp_keys:
                                    if temp_key in thermal:
                                        temp_val = safe_float(thermal[temp_key])
                                        if 20 < temp_val < 120:  # Reasonable temperature range
                                            gpu_stats['temperature'] = temp_val
                                            break
                                if gpu_stats['temperature'] > 0:
                                    break
                    
                    # Power (if available)
                    if 'power' in stats and isinstance(stats['power'], dict):
                        power = stats['power']
                        gpu_power_keys = ['GPU', 'gpu', 'GR3D', 'gr3d']
                        for power_key in gpu_power_keys:
                            if power_key in power:
                                power_val = power[power_key]
                                if isinstance(power_val, dict):
                                    power_val = power_val.get('cur', power_val.get('val', 0))
                                gpu_stats['power_draw'] = safe_float(power_val)
                                if gpu_stats['power_draw'] > 0:
                                    break
                    
                    gpu_stats['name'] = 'Jetson GPU'
                    logger.debug(f"jtop GPU stats: {gpu_stats}")
                    
                    # Only return if we got meaningful data
                    if (gpu_stats['usage'] > 0 or gpu_stats['temperature'] > 0 or 
                        gpu_stats['memory_total'] > 0):
                        return gpu_stats
                        
            except Exception as e:
                logger.debug(f"jtop GPU read failed: {e}")
        
        # Method 3: Try tegrastats for Jetson devices
        try:
            result = subprocess.run(['tegrastats', '--interval', '100'], 
                                  capture_output=True, text=True, timeout=3)
            if result.returncode == 0 and result.stdout:
                output = result.stdout
                logger.debug(f"tegrastats output: {output[:200]}...")
                
                # Parse GR3D (GPU) usage
                gr3d_match = re.search(r'GR3D_FREQ\s+(\d+)%', output)
                if gr3d_match:
                    gpu_stats['usage'] = safe_float(gr3d_match.group(1))
                
                # Parse memory usage
                mem_match = re.search(r'RAM\s+(\d+)/(\d+)MB', output)
                if mem_match:
                    used_mb, total_mb = mem_match.groups()
                    gpu_stats['memory_used'] = safe_float(used_mb) * 1024 * 1024
                    gpu_stats['memory_total'] = safe_float(total_mb) * 1024 * 1024
                
                # Parse temperature
                temp_match = re.search(r'thermal@([\d.]+)C', output)
                if temp_match:
                    gpu_stats['temperature'] = safe_float(temp_match.group(1))
                
                gpu_stats['name'] = 'Jetson GPU'
                logger.debug(f"tegrastats GPU stats: {gpu_stats}")
                return gpu_stats
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError) as e:
            logger.debug(f"tegrastats failed: {e}")
        
        # Method 4: Fallback to GPUtil if available
        if GPU_AVAILABLE:
            try:
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu = gpus[0]
                    gpu_stats.update({
                        'usage': safe_float(gpu.load * 100),
                        'memory_used': safe_float(gpu.memoryUsed) * 1024 * 1024,  # Convert MB to bytes
                        'memory_total': safe_float(gpu.memoryTotal) * 1024 * 1024,
                        'temperature': safe_float(gpu.temperature),
                        'name': gpu.name or 'GPU'
                    })
                    logger.debug(f"GPUtil GPU stats: {gpu_stats}")
                    return gpu_stats
            except Exception as e:
                logger.debug(f"GPUtil failed: {str(e)}")
        
        logger.debug(f"No GPU monitoring method succeeded, returning defaults: {gpu_stats}")
        return gpu_stats

    def _update_from_jtop(self):
        """Collect a small set of system metrics from jtop and return a dict compatible with system_data
        This function is defensive: it returns only fields it can safely read and leaves others to existing logic.
        """
        result = {}
        try:
            with jtop() as jt:
                stats = jt.stats or {}

                # GPU block
                gpu_block = {
                    'usage': 0,
                    'memory_used': 0,
                    'memory_total': 0,
                    'temperature': 0,
                    'power_draw': 0,
                    'name': 'Jetson GPU'
                }

                # Try common GPU keys
                if 'GPU' in stats:
                    try:
                        gpu_block['usage'] = safe_float(stats.get('GPU', 0))
                    except Exception:
                        pass

                # RAM info
                if 'RAM' in stats and isinstance(stats.get('RAM'), dict):
                    try:
                        ram = stats.get('RAM')
                        # jtop RAM units may be MB
                        used = ram.get('used') or ram.get('used_mb') or 0
                        total = ram.get('total') or ram.get('total_mb') or 0
                        gpu_block['memory_used'] = int(used) * 1024 * 1024 if safe_float(used) > 0 else 0
                        gpu_block['memory_total'] = int(total) * 1024 * 1024 if safe_float(total) > 0 else 0
                    except Exception:
                        pass

                # Thermal
                thermal = stats.get('thermal') or stats.get('THRM') or {}
                if isinstance(thermal, dict):
                    for k, v in thermal.items():
                        try:
                            val = safe_float(v)
                            if 20 < val < 120:
                                gpu_block['temperature'] = val
                                break
                        except Exception:
                            continue

                result['gpu'] = gpu_block

                # CPU temperature if available
                cpu_temp = None
                if isinstance(thermal, dict):
                    for key in ('CPU', 'cpu', 'CPU_temp'):
                        if key in thermal:
                            try:
                                cpu_temp = safe_float(thermal[key])
                                break
                            except Exception:
                                pass
                if cpu_temp:
                    result['cpu'] = result.get('cpu', {})
                    result['cpu']['temperature'] = cpu_temp

                # NVP Model information
                nvp_model = 'Unknown'
                
                if 'nvp model' in stats:
                    try:
                        nvp_model = str(stats['nvp model'])
                    except Exception:
                        pass
                
                if nvp_model != 'Unknown':
                    result['nvp_model'] = nvp_model

                # Uptime and other fields are still read from psutil elsewhere
        except Exception as e:
            logger.debug(f"_update_from_jtop failed: {e}")

        return result
    
    def get_system_status(self):
        """Get current system status with sanitized data"""
        return sanitize_data(dict(self.system_data))
    
    def get_gpu_status(self):
        """Get detailed GPU status"""
        return self.system_data['gpu']
    
    def get_cpu_cores_usage(self):
        """Get per-core CPU usage"""
        return psutil.cpu_percent(interval=None, percpu=True)
    
    def get_process_list(self, limit=10):
        """Get top processes by CPU usage"""
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                proc_info = proc.info
                proc_info['cpu_percent'] = proc.cpu_percent()
                processes.append(proc_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        
        # Sort by CPU usage
        processes.sort(key=lambda x: x['cpu_percent'], reverse=True)
        return processes[:limit]
    
    def get_network_connections(self):
        """Get active network connections"""
        try:
            connections = psutil.net_connections(kind='inet')
            return len([c for c in connections if c.status == 'ESTABLISHED'])
        except psutil.AccessDenied:
            return 0
    
    def get_jetson_info(self):
        """Get Jetson-specific information"""
        info = {
            'model': 'Unknown',
            'jetpack_version': 'Unknown',
            'cuda_version': 'Unknown',
            'l4t_version': 'Unknown'
        }
        
        try:
            # Try to get Jetson model
            with open('/proc/device-tree/model', 'r') as f:
                info['model'] = f.read().strip().replace('\x00', '')
        except (FileNotFoundError, PermissionError):
            pass
        
        try:
            # Try to get L4T version
            with open('/etc/nv_tegra_release', 'r') as f:
                content = f.read()
                match = re.search(r'R(\d+\.\d+)', content)
                if match:
                    info['l4t_version'] = match.group(1)
        except (FileNotFoundError, PermissionError):
            pass
        
        try:
            # Try to get CUDA version
            result = subprocess.run(['nvcc', '--version'], 
                                  capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                match = re.search(r'release (\d+\.\d+)', result.stdout)
                if match:
                    info['cuda_version'] = match.group(1)
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
            pass
        
        return info
    
    def _get_nvp_model(self):
        """Get NVP model information from Jetson device"""        
        if JTOP_AVAILABLE:
            with jtop() as jt:
                jtop_nvp = jt.stats
                print(jtop_nvp)
        try:
            # Method 1: Try nvpmodel command
            result = subprocess.run(['nvpmodel', '-q'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                # Parse nvpmodel output for current mode
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if 'NV Power Mode' in line and 'with' in line:
                        # Extract mode name from line like "NV Power Mode: MAXN with ID=0 and Name=15W"
                        if 'Name=' in line:
                            mode_name = line.split('Name=')[1].strip()
                            return mode_name
                        elif 'ID=' in line:
                            # Fallback to ID if name not found
                            mode_id = line.split('ID=')[1].split()[0]
                            return f"Mode {mode_id}"
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
            pass
        
        try:
            # Method 2: Try reading from sysfs
            with open('/sys/kernel/nvpmodel/status', 'r') as f:
                content = f.read().strip()
                if content:
                    return content
        except (FileNotFoundError, PermissionError):
            pass
        
        try:
            # Method 3: Try jetson_clocks --show
            result = subprocess.run(['jetson_clocks', '--show'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0 and 'nvpmodel' in result.stdout.lower():
                # Extract nvpmodel info from jetson_clocks output
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    if 'nvpmodel' in line.lower():
                        return line.strip()
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
            pass
        
        return 'Unknown'
    
