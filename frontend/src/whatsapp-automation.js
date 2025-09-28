// WhatsApp Web Automation Script
// This script runs in the WhatsApp Web context to automate message sending

class WhatsAppAutomation {
  constructor() {
    this.messageQueue = [];
    this.isProcessing = false;
    this.delay = 3000; // 3 seconds between messages
  }

  // Inject the automation into WhatsApp Web
  static inject() {
    if (window.location.hostname !== 'web.whatsapp.com') {
      console.log('Not on WhatsApp Web');
      return false;
    }
    
    window.WhatsAppAutomation = new WhatsAppAutomation();
    console.log('WhatsApp Automation injected successfully');
    return true;
  }

  // Add messages to the queue
  addMessages(contacts, messageTemplate) {
    const messages = contacts.map(contact => ({
      phone: this.formatPhone(contact.phone),
      message: this.personalizeMessage(messageTemplate, contact),
      name: contact.name
    }));
    
    this.messageQueue = [...this.messageQueue, ...messages];
    console.log(`Added ${messages.length} messages to queue`);
  }

  // Format phone number for WhatsApp Web
  formatPhone(phone) {
    // Remove all non-digits
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Add country code if missing
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone; // India
    }
    
    return cleanPhone;
  }

  // Personalize message with contact data
  personalizeMessage(template, contact) {
    let message = template.replace(/{name}/g, contact.name);
    
    // Replace other placeholders if they exist
    if (contact.additional_fields) {
      Object.keys(contact.additional_fields).forEach(field => {
        const placeholder = new RegExp(`{${field}}`, 'g');
        message = message.replace(placeholder, contact.additional_fields[field]);
      });
    }
    
    return message;
  }

  // Start processing the message queue
  async startSending() {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    console.log(`Starting to send ${this.messageQueue.length} messages`);
    
    for (const messageData of this.messageQueue) {
      try {
        const result = await this.sendSingleMessage(messageData);
        console.log(`Message to ${messageData.name}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
        
        // Update parent app about progress
        this.notifyProgress(messageData, result.success);
        
        // Wait between messages
        await this.sleep(this.delay);
        
      } catch (error) {
        console.error(`Error sending message to ${messageData.name}:`, error);
        this.notifyProgress(messageData, false, error.message);
      }
    }
    
    this.isProcessing = false;
    this.messageQueue = [];
    console.log('Finished sending all messages');
  }

  // Send a single message
  async sendSingleMessage(messageData) {
    try {
      // Create WhatsApp Web URL
      const url = `https://web.whatsapp.com/send?phone=${messageData.phone}&text=${encodeURIComponent(messageData.message)}`;
      
      // Navigate to the URL
      window.location.href = url;
      
      // Wait for page to load
      await this.sleep(3000);
      
      // Find and click send button
      const sendButton = await this.waitForSendButton();
      if (sendButton) {
        sendButton.click();
        await this.sleep(1000);
        return { success: true };
      } else {
        return { success: false, error: 'Send button not found' };
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Wait for send button to appear
  async waitForSendButton(timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Try different selectors for the send button
      const selectors = [
        'span[data-testid="send"]',
        'button[data-testid="compose-btn-send"]',
        '[data-icon="send"]',
        '[aria-label="Send"]'
      ];
      
      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent !== null) {
          return button;
        }
      }
      
      await this.sleep(500);
    }
    
    return null;
  }

  // Sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Notify parent window about progress
  notifyProgress(messageData, success, error = null) {
    try {
      window.parent.postMessage({
        type: 'whatsapp_message_status',
        data: {
          phone: messageData.phone,
          name: messageData.name,
          success: success,
          error: error
        }
      }, '*');
    } catch (e) {
      console.log('Could not notify parent window');
    }
  }

  // Get current status
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.messageQueue.length
    };
  }
}

// Auto-inject if on WhatsApp Web
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    WhatsAppAutomation.inject();
  });
} else {
  WhatsAppAutomation.inject();
}

// Export for manual access
window.WhatsAppAutomationClass = WhatsAppAutomation;