#!/usr/bin/env python3
"""Bloom health checker — pings each service and verifies the Atomizer WebSocket."""
import urllib.request
import asyncio
import sys

# Try to import websockets; gracefully degrade if not installed
try:
    import websockets
    HAS_WS = True
except ImportError:
    HAS_WS = False

SERVICES = {
    "Frontend":  "http://localhost:3000",
    "Atomizer":  "http://localhost:8000/health",
    "Worker":    "http://localhost:3001/workers",
}

def check_http(name, url):
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            ok = r.status < 400
    except Exception as e:
        ok = False
        print(f"  [{name}] FAIL — {e}")
        return False
    print(f"  [{name}] OK ({r.status})")
    return True

async def check_ws():
    url = "ws://localhost:8000/ws/atomizer"
    if not HAS_WS:
        print("  [Atomizer WS] SKIP — 'websockets' package not installed (pip install websockets)")
        return True
    try:
        async with websockets.connect(url, open_timeout=5) as ws:
            await ws.send('{"prompt":"healthcheck"}')
            msg = await asyncio.wait_for(ws.recv(), timeout=5)
            print(f"  [Atomizer WS] OK — first message received")
            return True
    except Exception as e:
        print(f"  [Atomizer WS] FAIL — {e}")
        return False

def main():
    print("=== Bloom Health Check ===")
    results = [check_http(name, url) for name, url in SERVICES.items()]
    results.append(asyncio.run(check_ws()))
    if all(results):
        print("\nAll services healthy ✓")
    else:
        print("\nOne or more services are unhealthy ✗")
        sys.exit(1)

if __name__ == "__main__":
    main()
