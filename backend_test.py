#!/usr/bin/env python3
"""
Backend API Testing Script for WhatsApp Automation System
Tests the core API endpoints for CSV upload, contacts, message logs, and WhatsApp status
"""

import requests
import json
import io
import csv
import time
from datetime import datetime
import os
from pathlib import Path

# Load environment variables to get the backend URL
def load_env_file(file_path):
    env_vars = {}
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value.strip('"')
    return env_vars

# Get backend URL from frontend .env file
frontend_env = load_env_file('/app/frontend/.env')
BACKEND_URL = frontend_env.get('REACT_APP_BACKEND_URL', 'http://localhost:8001')
API_BASE_URL = f"{BACKEND_URL}/api"

print(f"🔗 Testing backend API at: {API_BASE_URL}")

class WhatsAppBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name, success, message, details=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results.append({
            'test': test_name,
            'success': success,
            'message': message,
            'details': details,
            'timestamp': datetime.now().isoformat()
        })
    
    def create_sample_csv_data(self):
        """Create sample CSV data for testing"""
        csv_data = """name,phone,company,designation
Rajesh Kumar,+919876543210,Tech Solutions,Manager
Priya Sharma,9123456789,Digital Marketing,Executive
Amit Patel,+918765432109,Software Corp,Developer
Sneha Gupta,9234567890,Consulting Ltd,Analyst
Vikram Singh,+917654321098,Innovation Hub,Lead"""
        return csv_data
    
    def test_root_endpoint(self):
        """Test the root API endpoint"""
        try:
            response = self.session.get(f"{API_BASE_URL}/")
            if response.status_code == 200:
                data = response.json()
                if "WhatsApp CSV Messenger API" in data.get('message', ''):
                    self.log_test("Root Endpoint", True, "API is accessible and responding correctly")
                    return True
                else:
                    self.log_test("Root Endpoint", False, f"Unexpected response: {data}")
                    return False
            else:
                self.log_test("Root Endpoint", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Root Endpoint", False, f"Connection error: {str(e)}")
            return False
    
    def test_csv_upload_endpoint(self):
        """Test CSV upload endpoint (/api/contacts/upload)"""
        try:
            # Create sample CSV file
            csv_content = self.create_sample_csv_data()
            
            # Prepare file upload
            files = {
                'file': ('test_contacts.csv', io.StringIO(csv_content), 'text/csv')
            }
            
            response = self.session.post(f"{API_BASE_URL}/contacts/upload", files=files)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success') and data.get('count', 0) > 0:
                    self.log_test("CSV Upload", True, 
                                f"Successfully uploaded {data.get('count')} contacts",
                                f"Response: {data.get('message')}")
                    return True
                else:
                    self.log_test("CSV Upload", False, f"Upload failed: {data}")
                    return False
            else:
                self.log_test("CSV Upload", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("CSV Upload", False, f"Error during upload: {str(e)}")
            return False
    
    def test_contacts_retrieval(self):
        """Test contacts retrieval endpoint (/api/contacts)"""
        try:
            response = self.session.get(f"{API_BASE_URL}/contacts")
            
            if response.status_code == 200:
                contacts = response.json()
                if isinstance(contacts, list):
                    if len(contacts) > 0:
                        # Verify contact structure
                        sample_contact = contacts[0]
                        required_fields = ['id', 'name', 'phone', 'created_at']
                        missing_fields = [field for field in required_fields if field not in sample_contact]
                        
                        if not missing_fields:
                            self.log_test("Contacts Retrieval", True, 
                                        f"Retrieved {len(contacts)} contacts with correct structure",
                                        f"Sample contact: {sample_contact.get('name')} - {sample_contact.get('phone')}")
                            return True
                        else:
                            self.log_test("Contacts Retrieval", False, 
                                        f"Contacts missing required fields: {missing_fields}")
                            return False
                    else:
                        self.log_test("Contacts Retrieval", True, 
                                    "Endpoint working but no contacts found (empty database)")
                        return True
                else:
                    self.log_test("Contacts Retrieval", False, f"Expected list, got: {type(contacts)}")
                    return False
            else:
                self.log_test("Contacts Retrieval", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Contacts Retrieval", False, f"Error retrieving contacts: {str(e)}")
            return False
    
    def test_message_logs_endpoint(self):
        """Test message logs endpoint (/api/messages/logs)"""
        try:
            response = self.session.get(f"{API_BASE_URL}/messages/logs")
            
            if response.status_code == 200:
                logs = response.json()
                if isinstance(logs, list):
                    self.log_test("Message Logs", True, 
                                f"Retrieved {len(logs)} message logs",
                                f"Endpoint is working correctly")
                    
                    # If there are logs, verify structure
                    if len(logs) > 0:
                        sample_log = logs[0]
                        expected_fields = ['id', 'contact_id', 'phone', 'message', 'status', 'created_at']
                        missing_fields = [field for field in expected_fields if field not in sample_log]
                        
                        if missing_fields:
                            self.log_test("Message Logs Structure", False, 
                                        f"Logs missing fields: {missing_fields}")
                            return False
                        else:
                            print(f"   Sample log: {sample_log.get('phone')} - {sample_log.get('status')}")
                    
                    return True
                else:
                    self.log_test("Message Logs", False, f"Expected list, got: {type(logs)}")
                    return False
            else:
                self.log_test("Message Logs", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Message Logs", False, f"Error retrieving message logs: {str(e)}")
            return False
    
    def test_whatsapp_status_endpoint(self):
        """Test WhatsApp status endpoint (/api/whatsapp/status)"""
        try:
            response = self.session.get(f"{API_BASE_URL}/whatsapp/status")
            
            if response.status_code == 200:
                status_data = response.json()
                required_fields = ['authenticated', 'qr_available', 'message']
                missing_fields = [field for field in required_fields if field not in status_data]
                
                if not missing_fields:
                    self.log_test("WhatsApp Status", True, 
                                f"Status endpoint working correctly",
                                f"Auth: {status_data.get('authenticated')}, QR: {status_data.get('qr_available')}, Message: {status_data.get('message')}")
                    return True
                else:
                    self.log_test("WhatsApp Status", False, 
                                f"Status response missing fields: {missing_fields}")
                    return False
            else:
                self.log_test("WhatsApp Status", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("WhatsApp Status", False, f"Error checking WhatsApp status: {str(e)}")
            return False
    
    def test_additional_endpoints(self):
        """Test additional endpoints for completeness"""
        additional_tests = []
        
        # Test templates endpoint
        try:
            response = self.session.get(f"{API_BASE_URL}/messages/templates")
            if response.status_code == 200:
                templates = response.json()
                additional_tests.append(("Message Templates", True, f"Retrieved {len(templates)} templates"))
            else:
                additional_tests.append(("Message Templates", False, f"HTTP {response.status_code}"))
        except Exception as e:
            additional_tests.append(("Message Templates", False, f"Error: {str(e)}"))
        
        # Test WhatsApp initialization endpoint
        try:
            response = self.session.post(f"{API_BASE_URL}/whatsapp/init")
            if response.status_code == 200:
                init_data = response.json()
                additional_tests.append(("WhatsApp Init", True, f"Init response: {init_data.get('message', 'OK')[:50]}..."))
            else:
                additional_tests.append(("WhatsApp Init", False, f"HTTP {response.status_code}"))
        except Exception as e:
            additional_tests.append(("WhatsApp Init", False, f"Error: {str(e)}"))
        
        # Log additional test results
        for test_name, success, message in additional_tests:
            self.log_test(test_name, success, message)
        
        return all(result[1] for result in additional_tests)
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting WhatsApp Backend API Tests")
        print("=" * 60)
        
        # Test sequence
        tests = [
            ("Root Endpoint", self.test_root_endpoint),
            ("CSV Upload", self.test_csv_upload_endpoint),
            ("Contacts Retrieval", self.test_contacts_retrieval),
            ("Message Logs", self.test_message_logs_endpoint),
            ("WhatsApp Status", self.test_whatsapp_status_endpoint),
            ("Additional Endpoints", self.test_additional_endpoints)
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n📋 Running {test_name} test...")
            try:
                if test_func():
                    passed += 1
                time.sleep(1)  # Brief pause between tests
            except Exception as e:
                self.log_test(test_name, False, f"Test execution error: {str(e)}")
        
        # Summary
        print("\n" + "=" * 60)
        print(f"🏁 TEST SUMMARY: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All backend API tests PASSED!")
            return True
        else:
            print(f"⚠️  {total - passed} tests FAILED")
            print("\nFailed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  ❌ {result['test']}: {result['message']}")
            return False

def main():
    """Main test execution"""
    print("WhatsApp Automation Backend API Tester")
    print(f"Testing API at: {API_BASE_URL}")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    tester = WhatsAppBackendTester()
    success = tester.run_all_tests()
    
    # Save test results to file
    results_file = '/app/backend_test_results.json'
    with open(results_file, 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'api_base_url': API_BASE_URL,
            'overall_success': success,
            'test_results': tester.test_results
        }, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: {results_file}")
    
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)