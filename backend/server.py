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
        chrome_options = Options()
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--headless")  # Run in headless mode for server
        # Store session data
        chrome_options.add_argument("--user-data-dir=/tmp/whatsapp-session")
        
        # Use chromium binary
        chrome_options.binary_location = "/usr/bin/chromium"
        
        driver = webdriver.Chrome(options=chrome_options)
        driver.get("https://web.whatsapp.com")
        return True
    except Exception as e:
        logging.error(f"Failed to initialize WhatsApp driver: {e}")
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

async def send_whatsapp_message(phone: str, message: str) -> dict:
    global driver
    try:
        if not driver or not whatsapp_authenticated:
            return {"success": False, "error": "WhatsApp not authenticated"}
        
        # Format phone number
        phone = re.sub(r'\D', '', phone)
        if not phone.startswith('+'):
            phone = f"+{phone}"
        
        # Create WhatsApp Web URL
        url = f"https://web.whatsapp.com/send?phone={phone}&text={quote(message)}"
        driver.get(url)
        
        # Wait for page to load and send button to appear
        await asyncio.sleep(3)
        
        try:
            # Wait for and click send button
            send_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, "//span[@data-testid='send']/../.."))
            )
            send_button.click()
            
            # Wait a bit to ensure message is sent
            await asyncio.sleep(2)
            
            return {"success": True}
        except TimeoutException:
            return {"success": False, "error": "Could not find send button or contact"}
    
    except Exception as e:
        return {"success": False, "error": str(e)}

# API Routes
@api_router.get("/")
async def root():
    return {"message": "WhatsApp CSV Messenger API"}

@api_router.get("/whatsapp/status", response_model=WhatsAppStatus)
async def whatsapp_status():
    global driver, whatsapp_authenticated
    
    if not driver:
        init_whatsapp_driver()
    
    is_auth = check_whatsapp_auth()
    qr_available = get_qr_code() is not None
    
    message = "Authenticated" if is_auth else "QR code available" if qr_available else "Initializing..."
    
    return WhatsAppStatus(
        authenticated=is_auth,
        qr_available=qr_available,
        message=message
    )

@api_router.post("/whatsapp/init")
async def init_whatsapp():
    success = init_whatsapp_driver()
    return {"success": success, "message": "WhatsApp driver initialized" if success else "Failed to initialize"}

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
            # Extract name and phone from CSV
            name = row.get('name', '') or row.get('Name', '') or row.get('NAME', '')
            phone = row.get('phone', '') or row.get('Phone', '') or row.get('PHONE', '') or row.get('number', '')
            
            if not name or not phone:
                continue
            
            # Store additional fields
            additional_fields = {k: v for k, v in row.items() if k.lower() not in ['name', 'phone', 'number']}
            
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
        # Check WhatsApp authentication
        if not check_whatsapp_auth():
            raise HTTPException(status_code=400, detail="WhatsApp not authenticated. Please scan QR code first.")
        
        # Get contacts
        contact_filter = {"id": {"$in": request.contact_ids}} if request.contact_ids else {}
        contacts = await db.contacts.find(contact_filter).to_list(1000)
        
        message_logs = []
        sent_count = 0
        failed_count = 0
        
        for contact in contacts:
            try:
                # Personalize message
                message = request.template.replace("{name}", contact["name"])
                
                # Replace any additional field placeholders
                for field, value in contact.get("additional_fields", {}).items():
                    message = message.replace(f"{{{field}}}", str(value))
                
                # Send message
                result = await send_whatsapp_message(contact["phone"], message)
                
                if result["success"]:
                    status = "sent"
                    sent_count += 1
                    error_message = None
                else:
                    status = "failed"
                    failed_count += 1
                    error_message = result.get("error")
                
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
                
                # Add delay between messages to avoid rate limiting
                await asyncio.sleep(2)
                
            except Exception as e:
                failed_count += 1
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
        
        return {
            "success": True,
            "total_contacts": len(contacts),
            "sent_count": sent_count,
            "failed_count": failed_count,
            "message": f"Sent {sent_count} messages successfully, {failed_count} failed"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending bulk messages: {str(e)}")

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
    # Initialize WhatsApp driver
    init_whatsapp_driver()
