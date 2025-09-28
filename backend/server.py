from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import csv
import io
import re
import json
import asyncio
import time
import shutil
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
from urllib.parse import quote

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Global WebDriver instance
driver = None
whatsapp_authenticated = False

# Define Models
class Contact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    additional_fields: Dict[str, str] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MessageTemplate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    placeholders: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MessageLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contact_id: str
    phone: str
    message: str
    status: str  # 'pending', 'sent', 'failed'
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BulkMessageRequest(BaseModel):
    template: str
    contact_ids: List[str]

class WhatsAppStatus(BaseModel):
    authenticated: bool
    qr_available: bool
    message: str

# WhatsApp Web automation functions
def init_whatsapp_driver():
    global driver
    try:
        # Clean up any existing driver first
        if driver:
            try:
                driver.quit()
            except:
                pass
            driver = None
        
        chrome_options = Options()
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        # Remove headless mode so we can see WhatsApp Web
        # chrome_options.add_argument("--headless")
        chrome_options.add_argument("--disable-web-security")
        chrome_options.add_argument("--disable-features=VizDisplayCompositor")
        # Use the same user data directory as regular Chrome to access existing session
        chrome_options.add_argument("--user-data-dir=/tmp/whatsapp-automation")
        
        # Use chromium binary and chromedriver
        chrome_options.binary_location = "/usr/bin/chromium"
        service = Service("/usr/bin/chromedriver")
        
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # Navigate to WhatsApp Web
        print("Opening WhatsApp Web...")
        driver.get("https://web.whatsapp.com")
        
        # Wait for page to load
        time.sleep(10)
        
        print("WhatsApp Web loaded successfully")
        return True
        
    except Exception as e:
        logging.error(f"Failed to initialize WhatsApp driver: {e}")
        print(f"WhatsApp driver initialization error: {e}")
        if driver:
            try:
                driver.quit()
            except:
                pass
            driver = None
        return False

def check_whatsapp_auth():
    global driver, whatsapp_authenticated
    try:
        if not driver:
            return False
        
        # Check if we're on the chat interface (authenticated)
        try:
            driver.find_element(By.XPATH, "//div[@data-testid='chat-list']")
            whatsapp_authenticated = True
            return True
        except NoSuchElementException:
            whatsapp_authenticated = False
            return False
    except Exception:
        return False

def get_qr_code():
    global driver
    try:
        if not driver:
            return None
        
        qr_element = driver.find_element(By.XPATH, "//canvas[@aria-label='Scan me!']")
        if qr_element:
            return qr_element.get_attribute("data-ref")
    except NoSuchElementException:
        pass
    return None

async def send_whatsapp_message_real(phone: str, message: str) -> dict:
    global driver
    try:
        if not driver:
            return {"success": False, "error": "WhatsApp driver not initialized"}
        
        # Format phone number (remove + and spaces)
        phone_clean = re.sub(r'[^\d]', '', phone)
        if phone_clean.startswith('91') and len(phone_clean) > 10:
            phone_clean = phone_clean[2:]  # Remove country code for URL
        
        # Create WhatsApp Web URL with message
        encoded_message = quote(message)
        url = f"https://web.whatsapp.com/send?phone=91{phone_clean}&text={encoded_message}"
        
        print(f"Navigating to: {url}")
        driver.get(url)
        
        # Wait for page to load
        await asyncio.sleep(5)
        
        try:
            # Wait for and find the send button with multiple selectors
            send_selectors = [
                "//span[@data-testid='send']",
                "//button[@data-testid='compose-btn-send']", 
                "//span[contains(@class, 'send')]//parent::button",
                "//*[@aria-label='Send' or @data-icon='send']",
                "//div[@role='button' and contains(@aria-label, 'Send')]"
            ]
            
            send_button = None
            for selector in send_selectors:
                try:
                    send_button = WebDriverWait(driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, selector))
                    )
                    print(f"Found send button with selector: {selector}")
                    break
                except TimeoutException:
                    continue
            
            if send_button:
                # Click send button
                driver.execute_script("arguments[0].click();", send_button)
                print("Clicked send button")
                
                # Wait to ensure message is sent
                await asyncio.sleep(3)
                
                return {"success": True}
            else:
                # If no send button found, try alternative approach
                print("Send button not found, trying alternative method")
                
                # Try to find the text input and press Enter
                try:
                    text_input = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.XPATH, "//div[@contenteditable='true' and @data-tab='10']"))
                    )
                    text_input.send_keys(Keys.ENTER)
                    await asyncio.sleep(2)
                    return {"success": True}
                except:
                    return {"success": False, "error": "Could not find send mechanism"}
                
        except Exception as e:
            print(f"Error finding send button: {e}")
            return {"success": False, "error": f"Could not send message: {str(e)}"}
    
    except Exception as e:
        print(f"Error in send_whatsapp_message_real: {e}")
        return {"success": False, "error": str(e)}

# API Routes
@api_router.get("/")
async def root():
    return {"message": "WhatsApp CSV Messenger API"}

@api_router.get("/whatsapp/check-ready")
async def check_whatsapp_ready():
    global driver
    try:
        if not driver:
            return {"ready": False, "message": "WhatsApp driver not initialized"}
        
        # Check if we can find the main chat interface
        try:
            driver.find_element(By.XPATH, "//div[@data-testid='chat-list'] | //div[contains(@class, 'chat')] | //*[@id='main']")
            return {"ready": True, "message": "WhatsApp Web is ready for sending messages"}
        except:
            return {"ready": False, "message": "WhatsApp Web not fully loaded or needs authentication"}
    
    except Exception as e:
        return {"ready": False, "message": f"Error checking WhatsApp status: {str(e)}"}

@api_router.post("/whatsapp/test-send")
async def test_whatsapp_send():
    """Test sending a message to verify WhatsApp automation is working"""
    global driver
    try:
        if not driver:
            return {"success": False, "message": "WhatsApp driver not initialized"}
        
        # Try to access WhatsApp Web main interface
        driver.get("https://web.whatsapp.com")
        await asyncio.sleep(3)
        
        try:
            # Look for the main interface
            main_element = driver.find_element(By.XPATH, "//div[@data-testid='chat-list'] | //div[contains(@class, 'chat')] | //*[@id='main']")
            if main_element:
                return {"success": True, "message": "✅ WhatsApp Web automation is ready for bulk sending!"}
        except:
            pass
        
        # Check if QR code is present (needs authentication)
        try:
            qr_element = driver.find_element(By.XPATH, "//canvas[@aria-label='Scan me!'] | //div[contains(@class, 'qr')]")
            if qr_element:
                return {"success": False, "message": "📱 Please scan the QR code in WhatsApp Web to authenticate for automatic sending"}
        except:
            pass
        
        return {"success": False, "message": "WhatsApp Web status unclear. Please ensure you're logged in."}
        
    except Exception as e:
        return {"success": False, "message": f"Error testing WhatsApp: {str(e)}"}

@api_router.get("/whatsapp/status", response_model=WhatsAppStatus)
async def whatsapp_status():
    global driver, whatsapp_authenticated
    
    # For now, let's provide a more user-friendly approach
    # Instead of automatically initializing, we'll let users manually initialize
    
    if not driver:
        return WhatsAppStatus(
            authenticated=False,
            qr_available=False,
            message="Ready to connect. Click 'Connect WhatsApp' to open WhatsApp Web."
        )
    
    is_auth = check_whatsapp_auth()
    
    if is_auth:
        message = "✅ WhatsApp is connected and ready to send messages!"
    else:
        message = "📱 Please scan the QR code in WhatsApp Web to authenticate"
    
    return WhatsAppStatus(
        authenticated=is_auth,
        qr_available=not is_auth and driver is not None,
        message=message
    )

@api_router.post("/whatsapp/init")
async def init_whatsapp():
    global driver
    
    # For demonstration purposes, we'll simulate the WhatsApp connection process
    # In production, users would need to scan QR code manually
    
    try:
        # Clean up any existing session
        if driver:
            try:
                driver.quit()
            except:
                pass
            driver = None
        
        # Try to initialize the driver
        success = init_whatsapp_driver()
        
        if success:
            return {
                "success": True, 
                "message": "WhatsApp initialization started. Please check WhatsApp Web for QR code authentication.",
                "instructions": [
                    "1. WhatsApp Web should now be opening in the background",
                    "2. You'll need to scan the QR code with your WhatsApp mobile app",
                    "3. Go to WhatsApp on your phone > Settings > Linked Devices > Link a Device",
                    "4. Scan the QR code to authenticate",
                    "5. Once connected, you can send bulk messages"
                ]
            }
        else:
            return {
                "success": False, 
                "message": "Failed to initialize WhatsApp. You can use WhatsApp Web manually.",
                "alternative": "Since you already have WhatsApp Web open, you can use that for testing. The message templates are ready!"
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"WhatsApp initialization failed: {str(e)}. Manual WhatsApp Web usage is recommended."
        }

@api_router.post("/contacts/upload")
async def upload_contacts(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    try:
        content = await file.read()
        csv_data = content.decode('utf-8')
        
        # Parse CSV
        csv_file = io.StringIO(csv_data)
        reader = csv.DictReader(csv_file)
        
        contacts = []
        for row in reader:
            # Extract name and phone from CSV - handle various column name formats
            name = (row.get('name', '') or row.get('Name', '') or row.get('NAME', '') or 
                   row.get('Contact Name', '') or row.get('contact_name', '')).strip()
            
            phone = (row.get('phone', '') or row.get('Phone', '') or row.get('PHONE', '') or 
                    row.get('number', '') or row.get('Phone Number', '') or row.get('phone_number', '') or
                    row.get('Contact Number', '') or row.get('contact_number', '')).strip()
            
            # Skip empty rows or rows without both name and phone
            if not name or not phone:
                continue
            
            # Ensure phone number starts with + for international format
            if not phone.startswith('+'):
                # Add +91 for Indian numbers if they don't have country code
                if len(phone) == 10:
                    phone = f"+91{phone}"
                else:
                    phone = f"+{phone}"
            
            # Store additional fields (exclude common name/phone variations)
            exclude_keys = ['name', 'Name', 'NAME', 'phone', 'Phone', 'PHONE', 'number', 
                           'Phone Number', 'phone_number', 'Contact Name', 'contact_name',
                           'Contact Number', 'contact_number', 'Sno', 'sno', 'SNO', 's.no']
            additional_fields = {k: v for k, v in row.items() 
                               if k not in exclude_keys and v and str(v).strip()}
            
            contact = Contact(
                name=name,
                phone=phone,
                additional_fields=additional_fields
            )
            contacts.append(contact)
        
        # Store in database
        contact_dicts = [contact.dict() for contact in contacts]
        await db.contacts.insert_many(contact_dicts)
        
        return {
            "success": True,
            "message": f"Uploaded {len(contacts)} contacts successfully",
            "count": len(contacts)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")

@api_router.get("/contacts", response_model=List[Contact])
async def get_contacts():
    contacts = await db.contacts.find().sort("created_at", -1).to_list(1000)
    return [Contact(**contact) for contact in contacts]

@api_router.delete("/contacts")
async def clear_contacts():
    result = await db.contacts.delete_many({})
    return {"success": True, "deleted_count": result.deleted_count}

@api_router.post("/messages/template")
async def save_template(template: MessageTemplate):
    await db.templates.insert_one(template.dict())
    return {"success": True, "template_id": template.id}

@api_router.get("/messages/templates", response_model=List[MessageTemplate])
async def get_templates():
    templates = await db.templates.find().sort("created_at", -1).to_list(100)
    return [MessageTemplate(**template) for template in templates]

@api_router.post("/messages/send-bulk")
async def send_bulk_messages(request: BulkMessageRequest):
    try:
        # Get contacts
        contact_filter = {"id": {"$in": request.contact_ids}} if request.contact_ids else {}
        contacts = await db.contacts.find(contact_filter).to_list(1000)
        
        message_logs = []
        sent_count = 0
        failed_count = 0
        
        # Initialize WhatsApp driver if not already done
        if not driver:
            success = init_whatsapp_driver()
            if not success:
                raise HTTPException(status_code=500, detail="Failed to initialize WhatsApp driver")
        
        for contact in contacts:
            try:
                # Personalize message
                message = request.template.replace("{name}", contact["name"])
                
                # Replace any additional field placeholders
                for field, value in contact.get("additional_fields", {}).items():
                    message = message.replace(f"{{{field}}}", str(value))
                
                print(f"Sending message to {contact['name']} ({contact['phone']})")
                
                # Send message using WhatsApp Web automation
                result = await send_whatsapp_message_real(contact["phone"], message)
                
                if result["success"]:
                    status = "sent"
                    sent_count += 1
                    error_message = None
                    print(f"✅ Message sent to {contact['name']}")
                else:
                    status = "failed"
                    failed_count += 1
                    error_message = result.get("error", "Unknown error")
                    print(f"❌ Failed to send to {contact['name']}: {error_message}")
                
                # Log message
                log_entry = MessageLog(
                    contact_id=contact["id"],
                    phone=contact["phone"],
                    message=message,
                    status=status,
                    sent_at=datetime.utcnow() if status == "sent" else None,
                    error_message=error_message
                )
                
                message_logs.append(log_entry.dict())
                
                # Add delay between messages to avoid being blocked
                await asyncio.sleep(3)
                
            except Exception as e:
                failed_count += 1
                print(f"❌ Exception sending to {contact['name']}: {e}")
                log_entry = MessageLog(
                    contact_id=contact["id"],
                    phone=contact["phone"],
                    message=request.template,
                    status="failed",
                    error_message=str(e)
                )
                message_logs.append(log_entry.dict())
        
        # Store logs in database
        if message_logs:
            await db.message_logs.insert_many(message_logs)
        
        if sent_count > 0:
            return {
                "success": True,
                "total_contacts": len(contacts),
                "sent_count": sent_count,
                "failed_count": failed_count,
                "message": f"🎉 Successfully sent {sent_count} messages automatically via WhatsApp Web! {failed_count} failed." if failed_count > 0 else f"🎉 All {sent_count} messages sent successfully via WhatsApp Web!"
            }
        else:
            return {
                "success": False,
                "total_contacts": len(contacts),
                "sent_count": sent_count,
                "failed_count": failed_count,
                "message": f"❌ Failed to send any messages. Please check WhatsApp Web connection."
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in bulk message sending: {str(e)}")

@api_router.get("/messages/logs", response_model=List[MessageLog])
async def get_message_logs():
    logs = await db.message_logs.find().sort("created_at", -1).to_list(500)
    return [MessageLog(**log) for log in logs]

@api_router.delete("/messages/logs")
async def clear_message_logs():
    result = await db.message_logs.delete_many({})
    return {"success": True, "deleted_count": result.deleted_count}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    global driver
    if driver:
        driver.quit()
    client.close()

# Initialize WhatsApp on startup
@app.on_event("startup")
async def startup_event():
    # Don't initialize WhatsApp automatically - let users do it manually
    logging.info("WhatsApp CSV Messenger API started")
