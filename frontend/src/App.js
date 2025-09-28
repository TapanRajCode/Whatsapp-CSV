import React, { useState, useEffect } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Badge } from './components/ui/badge';
import { Alert, AlertDescription } from './components/ui/alert';
import { Progress } from './components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Separator } from './components/ui/separator';
import { Upload, Send, Users, MessageSquare, CheckCircle2, AlertCircle, FileText } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const WhatsAppMessenger = () => {
  const [contacts, setContacts] = useState([]);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [whatsappStatus, setWhatsappStatus] = useState({ authenticated: false, qr_available: false, message: 'Initializing...' });
  const [uploadStatus, setUploadStatus] = useState(null);
  const [sendingProgress, setSendingProgress] = useState({ active: false, progress: 0, message: '' });
  const [messageLogs, setMessageLogs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [connectionInstructions, setConnectionInstructions] = useState(null);

  useEffect(() => {
    checkWhatsAppStatus();
    fetchContacts();
    fetchMessageLogs();
    
    // Polling for WhatsApp status
    const interval = setInterval(checkWhatsAppStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkWhatsAppStatus = async () => {
    try {
      const response = await axios.get(`${API}/whatsapp/status`);
      setWhatsappStatus(response.data);
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
    }
  };

  const initWhatsApp = async () => {
    try {
      setWhatsappStatus({...whatsappStatus, message: 'Initializing WhatsApp connection...'});
      
      const response = await axios.post(`${API}/whatsapp/init`);
      
      if (response.data.success) {
        setWhatsappStatus({
          authenticated: false,
          qr_available: true,
          message: response.data.message
        });
        
        // Show detailed instructions if available
        if (response.data.instructions) {
          alert(`WhatsApp Connection Started!\n\n${response.data.instructions.join('\n')}`);
        }
      } else {
        setWhatsappStatus({
          authenticated: false,
          qr_available: false,
          message: response.data.message || 'Failed to connect WhatsApp'
        });
        
        // Show alternative guidance
        if (response.data.alternative) {
          alert(`Connection Info:\n\n${response.data.alternative}`);
        }
      }
      
      // Continue polling for status updates
      setTimeout(checkWhatsAppStatus, 3000);
    } catch (error) {
      console.error('Error initializing WhatsApp:', error);
      setWhatsappStatus({
        authenticated: false,
        qr_available: false,
        message: 'Failed to connect to WhatsApp. Please try again or use WhatsApp Web manually.'
      });
      
      alert('Connection Error: Unable to initialize WhatsApp. Please ensure the app is running properly.');
    }
  };

  const fetchContacts = async () => {
    try {
      const response = await axios.get(`${API}/contacts`);
      setContacts(response.data);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };

  const fetchMessageLogs = async () => {
    try {
      const response = await axios.get(`${API}/messages/logs`);
      setMessageLogs(response.data);
    } catch (error) {
      console.error('Error fetching message logs:', error);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadStatus({ type: 'loading', message: 'Uploading CSV file...' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API}/contacts/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setUploadStatus({ type: 'success', message: response.data.message });
      fetchContacts();
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.response?.data?.detail || 'Error uploading file' });
    }
  };

  const sendBulkMessages = async () => {
    if (!messageTemplate.trim()) {
      alert('Please enter a message template');
      return;
    }

    if (contacts.length === 0) {
      alert('Please upload contacts first');
      return;
    }

    setSendingProgress({ active: true, progress: 0, message: 'Sending messages...' });

    try {
      const contactIds = contacts.map(contact => contact.id);
      const response = await axios.post(`${API}/messages/send-bulk`, {
        template: messageTemplate,
        contact_ids: contactIds
      });

      setSendingProgress({ 
        active: false, 
        progress: 100, 
        message: response.data.message 
      });
      
      fetchMessageLogs();
    } catch (error) {
      setSendingProgress({ 
        active: false, 
        progress: 0, 
        message: error.response?.data?.detail || 'Error sending messages' 
      });
    }
  };

  const clearContacts = async () => {
    try {
      await axios.delete(`${API}/contacts`);
      setContacts([]);
      setUploadStatus(null);
      setSelectedFile(null);
    } catch (error) {
      console.error('Error clearing contacts:', error);
    }
  };

  const clearLogs = async () => {
    try {
      await axios.delete(`${API}/messages/logs`);
      setMessageLogs([]);
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <MessageSquare className="h-10 w-10 text-emerald-600" />
            <h1 className="text-4xl font-bold text-gray-900">WhatsApp CSV Messenger</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Send personalized WhatsApp messages to your contacts from CSV files. 
            Upload your contact list and create custom message templates with placeholders like {'{name}'}.
          </p>
        </div>

        {/* WhatsApp Status Card */}
        <Card className="mb-8 border-l-4 border-l-emerald-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              WhatsApp Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {whatsappStatus.authenticated ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                )}
                <Badge 
                  variant={whatsappStatus.authenticated ? "default" : "secondary"}
                  className={whatsappStatus.authenticated ? "bg-green-500 hover:bg-green-600" : ""}
                >
                  {whatsappStatus.authenticated ? 'Connected' : 'Not Connected'}
                </Badge>
              </div>
              <span className="text-sm text-gray-600">{whatsappStatus.message}</span>
            </div>
            {!whatsappStatus.authenticated && (
              <div className="mt-4">
                <Button onClick={initWhatsApp} className="bg-emerald-600 hover:bg-emerald-700">
                  Connect WhatsApp
                </Button>
                <p className="text-sm text-gray-500 mt-2">
                  Click to open WhatsApp Web and scan the QR code with your phone
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload Contacts
            </TabsTrigger>
            <TabsTrigger value="message" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Create Message
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Contacts ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Message Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload CSV File</CardTitle>
                <CardDescription>
                  Upload a CSV file with your contacts. Required columns: 'name' and 'phone'. 
                  Additional columns can be used as placeholders in your messages.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <Input 
                      type="file" 
                      accept=".csv" 
                      onChange={handleFileUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <Label 
                      htmlFor="csv-upload" 
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="h-12 w-12 text-gray-400" />
                      <span className="text-lg font-medium text-gray-600">
                        {selectedFile ? selectedFile.name : 'Choose CSV file'}
                      </span>
                      <span className="text-sm text-gray-500">
                        Click to browse or drag and drop
                      </span>
                    </Label>
                  </div>
                  
                  {uploadStatus && (
                    <Alert className={uploadStatus.type === 'error' ? 'border-red-200 bg-red-50' : 
                                     uploadStatus.type === 'success' ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}>
                      <AlertDescription className={uploadStatus.type === 'error' ? 'text-red-700' :
                                                  uploadStatus.type === 'success' ? 'text-green-700' : 'text-blue-700'}>
                        {uploadStatus.message}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">CSV Format Example:</h4>
                    <pre className="text-sm text-gray-600">
name,phone,company
John Doe,+1234567890,ABC Corp
Jane Smith,+0987654321,XYZ Inc
                    </pre>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                {contacts.length > 0 && (
                  <Button 
                    variant="outline" 
                    onClick={clearContacts}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Clear All Contacts
                  </Button>
                )}
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="message" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Message Template</CardTitle>
                <CardDescription>
                  Write your message template. Use {'{name}'} for personalization. 
                  You can also use any column from your CSV as placeholders (e.g., {'{company}'}).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="message-template">Message Template</Label>
                    <Textarea
                      id="message-template"
                      placeholder="Hi {name}! 👋\n\nI hope this message finds you well. I wanted to reach out about our upcoming event...\n\nBest regards!"
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      rows={8}
                      className="mt-2"
                    />
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2 text-blue-900">Available Placeholders:</h4>
                    <div className="text-sm text-blue-700">
                      <span className="inline-block bg-blue-100 px-2 py-1 rounded mr-2 mb-2">{'{name}'}</span>
                      {contacts.length > 0 && contacts[0].additional_fields && 
                        Object.keys(contacts[0].additional_fields).map(field => (
                          <span key={field} className="inline-block bg-blue-100 px-2 py-1 rounded mr-2 mb-2">
                            {`{${field}}`}
                          </span>
                        ))
                      }
                    </div>
                  </div>

                  {sendingProgress.active && (
                    <div className="space-y-2">
                      <Progress value={sendingProgress.progress} className="w-full" />
                      <p className="text-sm text-gray-600">{sendingProgress.message}</p>
                    </div>
                  )}
                  
                  {sendingProgress.message && !sendingProgress.active && (
                    <Alert className="border-green-200 bg-green-50">
                      <AlertDescription className="text-green-700">
                        {sendingProgress.message}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={sendBulkMessages}
                  disabled={!whatsappStatus.authenticated || contacts.length === 0 || !messageTemplate.trim() || sendingProgress.active}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  size="lg"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Messages to {contacts.length} Contacts
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="contacts" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Uploaded Contacts</CardTitle>
                  <CardDescription>{contacts.length} contacts ready for messaging</CardDescription>
                </div>
                {contacts.length > 0 && (
                  <Button 
                    variant="outline" 
                    onClick={clearContacts}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Clear All
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {contacts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>No contacts uploaded yet. Upload a CSV file to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {contacts.map((contact, index) => (
                      <div key={contact.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-sm text-gray-600">{contact.phone}</p>
                        </div>
                        <div className="text-right">
                          {Object.entries(contact.additional_fields || {}).map(([key, value]) => (
                            <div key={key} className="text-xs text-gray-500">
                              {key}: {value}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Message Logs</CardTitle>
                  <CardDescription>History of sent and failed messages</CardDescription>
                </div>
                {messageLogs.length > 0 && (
                  <Button 
                    variant="outline" 
                    onClick={clearLogs}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Clear Logs
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {messageLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Send className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>No messages sent yet. Send some messages to see the logs here.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {messageLogs.map((log) => (
                      <div key={log.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={log.status === 'sent' ? 'default' : 'destructive'}
                              className={log.status === 'sent' ? 'bg-green-500 hover:bg-green-600' : ''}
                            >
                              {log.status}
                            </Badge>
                            <span className="font-medium">{log.phone}</span>
                          </div>
                          <span className="text-sm text-gray-500">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{log.message}</p>
                        {log.error_message && (
                          <p className="text-sm text-red-600">Error: {log.error_message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WhatsAppMessenger />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
