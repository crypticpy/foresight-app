#!/usr/bin/env python3
"""
Foresight System - Local Testing Script
Quick verification that all components are working correctly
"""

import requests
import json
import time
import sys
import os

def test_backend_health():
    """Test if backend is running and healthy"""
    try:
        response = requests.get('http://localhost:8000/api/v1/health', timeout=5)
        if response.status_code == 200:
            print("✅ Backend API is healthy")
            return True
        else:
            print(f"❌ Backend returned status {response.status_code}")
            return False
    except requests.exceptions.RequestException:
        print("❌ Backend is not running or not accessible")
        return False

def test_frontend_accessible():
    """Test if frontend is running"""
    try:
        response = requests.get('http://localhost:5173', timeout=5)
        if response.status_code == 200:
            print("✅ Frontend is accessible")
            return True
        else:
            print(f"❌ Frontend returned status {response.status_code}")
            return False
    except requests.exceptions.RequestException:
        print("❌ Frontend is not running or not accessible")
        return False

def test_api_endpoints():
    """Test core API endpoints"""
    print("\n🧪 Testing API Endpoints...")
    
    endpoints_to_test = [
        ('GET', '/api/v1/health', 'Health check'),
        ('GET', '/api/v1/taxonomy', 'Taxonomy data'),
        ('GET', '/api/v1/cards', 'Cards list'),
    ]
    
    results = []
    for method, endpoint, description in endpoints_to_test:
        try:
            if method == 'GET':
                response = requests.get(f'http://localhost:8000{endpoint}', timeout=5)
            else:
                response = requests.request(method, f'http://localhost:8000{endpoint}', timeout=5)
            
            if response.status_code in [200, 401]:  # 401 is OK for protected endpoints
                print(f"✅ {description}: {response.status_code}")
                results.append(True)
            else:
                print(f"❌ {description}: {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ {description}: {str(e)}")
            results.append(False)
    
    return all(results)

def check_environment_files():
    """Check if environment files are properly configured"""
    print("\n🔍 Checking Environment Configuration...")
    
    backend_env = 'backend/.env'
    frontend_env = 'frontend/foresight-frontend/.env'
    
    issues = []
    
    if os.path.exists(backend_env):
        print("✅ Backend .env file exists")
        with open(backend_env, 'r') as f:
            content = f.read()
            required_vars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY']
            for var in required_vars:
                if f'{var}=' in content and not content.split(f'{var}=')[1].split('\n')[0] == '':
                    print(f"✅ {var} configured")
                else:
                    print(f"❌ {var} missing or empty")
                    issues.append(f"Backend {var}")
    else:
        print("❌ Backend .env file missing")
        issues.append("Backend .env file")
    
    if os.path.exists(frontend_env):
        print("✅ Frontend .env file exists")
        with open(frontend_env, 'r') as f:
            content = f.read()
            required_vars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']
            for var in required_vars:
                if f'{var}=' in content and not content.split(f'{var}=')[1].split('\n')[0] == '':
                    print(f"✅ {var} configured")
                else:
                    print(f"❌ {var} missing or empty")
                    issues.append(f"Frontend {var}")
    else:
        print("❌ Frontend .env file missing")
        issues.append("Frontend .env file")
    
    return len(issues) == 0

def check_dependencies():
    """Check if dependencies are installed"""
    print("\n📦 Checking Dependencies...")
    
    # Check if virtual environment exists
    if os.path.exists('backend/venv'):
        print("✅ Python virtual environment exists")
    else:
        print("❌ Python virtual environment missing")
        return False
    
    # Check if node_modules exists
    if os.path.exists('frontend/foresight-frontend/node_modules'):
        print("✅ Node.js dependencies installed")
    else:
        print("❌ Node.js dependencies missing")
        return False
    
    return True

def main():
    print("🎯 Foresight System - Local Testing")
    print("===================================")
    
    # Check prerequisites
    print("\n1️⃣ Checking Prerequisites...")
    deps_ok = check_dependencies()
    env_ok = check_environment_files()
    
    # Check if services are running
    print("\n2️⃣ Checking Services...")
    backend_ok = test_backend_health()
    frontend_ok = test_frontend_accessible()
    
    # Test API if backend is running
    if backend_ok:
        api_ok = test_api_endpoints()
    else:
        api_ok = False
    
    # Summary
    print("\n📋 Test Summary:")
    print(f"   Dependencies: {'✅' if deps_ok else '❌'}")
    print(f"   Environment: {'✅' if env_ok else '❌'}")
    print(f"   Backend: {'✅' if backend_ok else '❌'}")
    print(f"   Frontend: {'✅' if frontend_ok else '❌'}")
    print(f"   API: {'✅' if api_ok else '❌'}")
    
    all_ok = deps_ok and env_ok and backend_ok and frontend_ok and api_ok
    
    if all_ok:
        print("\n🎉 All tests passed! System is ready for testing.")
        print("\n🔗 Access Points:")
        print("   Frontend: http://localhost:5173")
        print("   Backend: http://localhost:8000")
        print("   API Docs: http://localhost:8000/docs")
        print("\n👤 Test User:")
        print("   See backend/.env (TEST_USER_EMAIL / TEST_USER_PASSWORD)")
    else:
        print("\n⚠️  Some issues found. Please check the setup.")
        print("\n🛠️  Quick Fixes:")
        if not deps_ok:
            print("   - Run: bash setup_local.sh")
        if not backend_ok:
            print("   - Backend: cd backend && source venv/bin/activate && uvicorn app.main:app --reload")
        if not frontend_ok:
            print("   - Frontend: cd frontend/foresight-frontend && pnpm dev")
    
    return 0 if all_ok else 1

if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
