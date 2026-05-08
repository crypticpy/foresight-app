#!/usr/bin/env python3
"""
Script to create a test user for the Foresight system
Run this after setting up the database to create a test account
"""

import os
import sys
from supabase import create_client
import uuid
from datetime import datetime

def main():
    # Get Supabase configuration from environment or prompt
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
    test_email = os.getenv('TEST_USER_EMAIL')
    test_password = os.getenv('TEST_USER_PASSWORD')

    if not supabase_url or not supabase_key:
        print("❌ Missing Supabase configuration")
        print("Please set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables")
        sys.exit(1)

    if not test_email or not test_password:
        print("❌ Missing test user credentials")
        print("Please set TEST_USER_EMAIL and TEST_USER_PASSWORD in backend/.env")
        sys.exit(1)

    # Initialize Supabase client
    supabase = create_client(supabase_url, supabase_key)

    # Create test user
    test_user_data = {
        'id': str(uuid.uuid4()),
        'email': test_email,
        'password': test_password,
        'user_metadata': {
            'full_name': 'Test User',
            'department': 'City Manager\'s Office',
            'role': 'Strategic Planner'
        }
    }
    
    try:
        # Create auth user
        print("🔐 Creating test user in Supabase Auth...")
        auth_response = supabase.auth.admin.create_user({
            'email': test_user_data['email'],
            'password': test_user_data['password'],
            'email_confirm': True,
            'user_metadata': test_user_data['user_metadata']
        })
        
        if auth_response.user:
            user_id = auth_response.user.id
            
            # Create profile record
            print("👤 Creating user profile...")
            profile_data = {
                'id': user_id,
                'email': test_user_data['email'],
                'display_name': 'Test User',
                'department': 'City Manager\'s Office',
                'role': 'Strategic Planner',
                'preferences': {
                    'digest_frequency': 'weekly',
                    'notification_email': True,
                    'default_pillars': ['CH', 'MC', 'EC'],
                    'theme': 'light'
                }
            }
            
            profile_response = supabase.table('users').insert(profile_data).execute()
            
            if profile_response.data:
                print("✅ Test user created successfully!")
                print("\n📝 Test Credentials:")
                print(f"   Email: {test_user_data['email']}")
                print(f"   Password: {test_user_data['password']}")
                print(f"   User ID: {user_id}")
                print("\n🔗 You can now use these credentials to log into the Foresight system.")
                
                # Add some test pillar preferences
                print("\n🎯 Adding pillar preferences...")
                pillar_prefs = [
                    {'user_id': user_id, 'pillar': 'CH', 'weight': 1.0},
                    {'user_id': user_id, 'pillar': 'MC', 'weight': 0.8},
                    {'user_id': user_id, 'pillar': 'EC', 'weight': 0.9}
                ]
                
                prefs_response = supabase.table('pillar_preferences').insert(pillar_prefs).execute()
                if prefs_response.data:
                    print("✅ Pillar preferences added!")
                
                return True
            else:
                print("❌ Failed to create user profile")
                return False
        else:
            print("❌ Failed to create auth user")
            return False
            
    except Exception as e:
        print(f"❌ Error creating test user: {str(e)}")
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
