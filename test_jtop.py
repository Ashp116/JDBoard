#!/usr/bin/env python3
"""
Test script to check jtop functionality and data structure
"""

import json
import time

try:
    from jtop import jtop
    JTOP_AVAILABLE = True
    print("✓ jtop module imported successfully")
except Exception as e:
    JTOP_AVAILABLE = False
    print(f"✗ jtop import failed: {e}")

if JTOP_AVAILABLE:
    try:
        print("\n=== Testing jtop connection ===")
        with jtop() as jt:
            print("✓ jtop connection established")
            
            # Wait a moment for data to be available
            time.sleep(0.5)
            print(jt.board)

            stats = jt.stats
            print(f"\n=== Available stats keys ===")
            if isinstance(stats, dict):
                for key in sorted(stats.keys()):
                    #print(f"  {key}: {type(stats[key])}")
                    pass
            else:
                print(f"Stats is not a dict: {type(stats)}")
            
            # Print detailed stats structure
            print(f"\n=== Full stats structure ===")
            #print(json.dumps(stats, indent=2, default=str))
            
            # Check for GPU-related data
            print(f"\n=== GPU-related data ===")
            gpu_keys = ['GPU', 'gpu', 'GR3D_FREQ', 'gr3d']
            for key in gpu_keys:
                if key in stats:
                    print(f"  {key}: {stats[key]}")
            
            # Check thermal data
            print(f"\n=== Thermal data ===")
            thermal_keys = ['thermal', 'temperature', 'temp', 'THRM']
            for key in thermal_keys:
                if key in stats:
                    print(f"  {key}: {stats[key]}")
            
            # Check power data
            print(f"\n=== Power data ===")
            power_keys = ['power', 'Power', 'POWER']
            for key in power_keys:
                if key in stats:
                    print(f"  {key}: {stats[key]}")
            
            # Check memory data
            print(f"\n=== Memory data ===")
            mem_keys = ['RAM', 'ram', 'MEM', 'memory']
            for key in mem_keys:
                if key in stats:
                    print(f"  {key}: {stats[key]}")
                    
    except Exception as e:
        print(f"✗ jtop test failed: {e}")
        import traceback
        traceback.print_exc()
else:
    print("Cannot test jtop - module not available")
    print("Install with: pip install jetson-stats")