#!/usr/bin/env python3
"""
Test script to verify jtop board information access
"""

import json
import time

try:
    from jtop import jtop
    print("✓ jtop module imported successfully")
    
    with jtop() as jt:
        print("✓ jtop connection established")
        
        # Wait for data to be available
        time.sleep(0.5)
        
        print("\n=== Board Information ===")
        if hasattr(jt, 'board') and jt.board:
            print("Board data available:")
            print(json.dumps(jt.board, indent=2, default=str))
            
            if 'hardware' in jt.board:
                hardware = jt.board['hardware']
                print(f"\n=== Hardware Details ===")
                print(f"Model: {hardware.get('Model', 'Not Available')}")
                print(f"Module: {hardware.get('Module', 'Not Available')}")
                print(f"Serial Number: {hardware.get('Serial Number', 'Not Available')}")
                print(f"SOC: {hardware.get('SOC', 'Not Available')}")
                print(f"CUDA Arch BIN: {hardware.get('CUDA Arch BIN', 'Not Available')}")
                print(f"L4T: {hardware.get('L4T', 'Not Available')}")
        else:
            print("No board data available")
            
        # Test our backend function
        print(f"\n=== Testing Backend Function ===")
        # Import our backend function
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
        
        from app import get_jtop_board_info
        board_info = get_jtop_board_info()
        print("Board info from backend function:")
        print(json.dumps(board_info, indent=2, default=str))
        
except ImportError as e:
    print(f"✗ Import error: {e}")
except Exception as e:
    print(f"✗ Error: {e}")