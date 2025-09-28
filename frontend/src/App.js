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
  const [showFormatting, setShowFormatting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMessagePreview, setShowMessagePreview] = useState(true);
  const [whatsappManualOverride, setWhatsappManualOverride] = useState(false);

  // Common emojis for quick access
  const commonEmojis = [
    '😊', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
    '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
    '🙂', '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶',
    '👋', '👍', '👎', '👌', '🤝', '🙏', '💪', '👏',
    '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '⭐', '✨',
    '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍',
    '🔥', '💯', '✅', '❌', '⚡', '💡', '🚀', '🎯'
  ];

  const insertFormatting = (format) => {
    const textarea = document.querySelector('textarea[placeholder*="Hi {name}"]');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = messageTemplate.substring(start, end);
    
    let formattedText = '';
    switch (format) {
      case 'bold':
        formattedText = selectedText ? `*${selectedText}*` : '*bold text*';
        break;
      case 'italic':
        formattedText = selectedText ? `_${selectedText}_` : '_italic text_';
        break;
      case 'monospace':
        formattedText = selectedText ? `\`\`\`${selectedText}\`\`\`` : '```monospace text```';
        break;
      case 'strikethrough':
        formattedText = selectedText ? `~${selectedText}~` : '~strikethrough text~';
        break;
      default:
        formattedText = selectedText;
    }

    const newMessage = messageTemplate.substring(0, start) + formattedText + messageTemplate.substring(end);
    setMessageTemplate(newMessage);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.focus();
      const newPos = start + formattedText.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const renderWhatsAppFormatting = (text) => {
    if (!text) return '';
    
    // Replace WhatsApp formatting with HTML
    let formattedText = text
      // Bold: *text* -> <strong>text</strong>
      .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
      // Italic: _text_ -> <em>text</em>  
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      // Strikethrough: ~text~ -> <s>text</s>
      .replace(/~([^~]+)~/g, '<s>$1</s>')
      // Monospace: ```text``` -> <code>text</code>
      .replace(/```([^`]+)```/g, '<code style="background: #f1f1f1; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>')
      // Line breaks
      .replace(/\n/g, '<br />');
    
    return formattedText;
  };

  const getPreviewMessage = () => {
    if (!messageTemplate) return '';
    
    // Replace {name} with example name for preview
    let preview = messageTemplate.replace(/{name}/g, '<span style="background: #e3f2fd; padding: 2px 4px; border-radius: 3px; color: #1565c0; font-weight: 500;">[Contact Name]</span>');
    
    // Replace other placeholders
    preview = preview.replace(/{(\w+)}/g, '<span style="background: #f3e5f5; padding: 2px 4px; border-radius: 3px; color: #7b1fa2; font-weight: 500;">[$1]</span>');
    
    return renderWhatsAppFormatting(preview);
  };

  const insertEmoji = (emoji) => {
    const textarea = document.querySelector('textarea[placeholder*="Hi {name}"]');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    const newMessage = messageTemplate.substring(0, start) + emoji + messageTemplate.substring(end);
    setMessageTemplate(newMessage);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
    
    setShowEmojiPicker(false);
  };

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
      
      // Check for manual override or existing detection
      if (whatsappManualOverride) {
        setWhatsappStatus({
          authenticated: true,
          qr_available: false,
          message: '✅ WhatsApp manually marked as connected!'
        });
      } else {
        setWhatsappStatus(response.data);
      }
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
    }
  };

  const initWhatsApp = async () => {
    try {
      setWhatsappStatus({...whatsappStatus, message: 'Initializing WhatsApp connection...'});
      setConnectionInstructions(null);
      
      const response = await axios.post(`${API}/whatsapp/init`);
      
      if (response.data.success) {
        setWhatsappStatus({
          authenticated: false,
          qr_available: true,
          message: response.data.message
        });
        
        // Show detailed instructions in the UI instead of alert
        if (response.data.instructions) {
          setConnectionInstructions(response.data.instructions);
        }
      } else {
        setWhatsappStatus({
          authenticated: false,
          qr_available: false,
          message: response.data.message || 'Failed to connect WhatsApp'
        });
        
        // Show alternative guidance
        if (response.data.alternative) {
          setConnectionInstructions([response.data.alternative]);
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
      
      setConnectionInstructions(['Connection Error: Unable to initialize WhatsApp. Please ensure the app is running properly.']);
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

    setSendingProgress({ active: true, progress: 0, message: 'Initializing WhatsApp automation...' });

    try {
      const contactIds = contacts.map(contact => contact.id);
      
      // Update progress during sending
      setSendingProgress({ active: true, progress: 25, message: `Sending messages to ${contacts.length} contacts automatically...` });
      
      const response = await axios.post(`${API}/messages/send-bulk`, {
        template: messageTemplate,
        contact_ids: contactIds
      });

      setSendingProgress({ 
        active: false, 
        progress: 100, 
        message: response.data.message 
      });
      
      // Auto-refresh message logs to show results
      fetchMessageLogs();
      
      // Show success notification
      if (response.data.success && response.data.sent_count > 0) {
        setTimeout(() => {
          alert(`🎉 Bulk sending complete!\n\nSent: ${response.data.sent_count} messages\nFailed: ${response.data.failed_count} messages\n\nCheck Message Logs tab for details.`);
        }, 1000);
      }
      
    } catch (error) {
      setSendingProgress({ 
        active: false, 
        progress: 0, 
        message: error.response?.data?.detail || 'Error sending messages via WhatsApp automation' 
      });
      
      alert(`Sending Error: ${error.response?.data?.detail || 'Failed to send messages. Please try again or check WhatsApp Web connection.'}`);
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
            {!whatsappStatus.authenticated && !whatsappManualOverride && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={initWhatsApp} className="bg-emerald-600 hover:bg-emerald-700">
                    Connect WhatsApp
                  </Button>
                  <Button 
                    onClick={() => setWhatsappManualOverride(true)} 
                    variant="outline" 
                    className="border-blue-500 text-blue-600 hover:bg-blue-50"
                  >
                    ✅ I Already Have WhatsApp Web Open
                  </Button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Click "Connect WhatsApp" to scan QR code, or click "I Already Have WhatsApp Web Open" if you're already logged in elsewhere
                </p>
              </div>
            )}

            {whatsappManualOverride && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-800 font-medium">✅ WhatsApp marked as connected!</p>
                    <p className="text-xs text-green-600 mt-1">You can now send real messages using your existing WhatsApp Web session</p>
                  </div>
                  <Button 
                    onClick={() => setWhatsappManualOverride(false)}
                    variant="ghost"
                    size="sm"
                    className="text-green-600 hover:text-green-800"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            )}

            {connectionInstructions && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">📱 Connection Instructions:</h4>
                <ol className="text-sm text-blue-800 space-y-1">
                  {connectionInstructions.map((instruction, index) => (
                    <li key={index} className="flex items-start">
                      <span className="font-medium mr-2">{typeof instruction === 'string' && instruction.match(/^\d+\./) ? '' : `${index + 1}.`}</span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ol>
                <button 
                  onClick={() => setConnectionInstructions(null)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload Contacts
            </TabsTrigger>
            <TabsTrigger value="message" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Create Message
            </TabsTrigger>
            <TabsTrigger value="bulk-send" className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Bulk Send ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Contacts ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Message Logs
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
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="message-template">Message Template</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowFormatting(!showFormatting)}
                          className="text-xs"
                        >
                          📝 Formatting
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="text-xs"
                        >
                          😊 Emojis
                        </Button>
                      </div>
                    </div>
                    
                    {/* WhatsApp Formatting Toolbar */}
                    {showFormatting && (
                      <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
                        <div className="text-sm text-gray-600 mb-2">WhatsApp Text Formatting:</div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => insertFormatting('bold')}
                            className="text-xs"
                          >
                            <strong>B</strong> Bold
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => insertFormatting('italic')}
                            className="text-xs"
                          >
                            <em>I</em> Italic
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => insertFormatting('strikethrough')}
                            className="text-xs"
                          >
                            <s>S</s> Strike
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => insertFormatting('monospace')}
                            className="text-xs font-mono"
                          >
                            M Mono
                          </Button>
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          💡 **How it works:** Select text and click formatting to add WhatsApp syntax. 
                          Check the preview below to see how it will look when sent!
                        </div>
                      </div>
                    )}

                    {/* Emoji Picker */}
                    {showEmojiPicker && (
                      <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
                        <div className="text-sm text-gray-600 mb-2">Click to insert emoji:</div>
                        <div className="grid grid-cols-8 gap-1">
                          {commonEmojis.map((emoji, index) => (
                            <Button
                              key={index}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => insertEmoji(emoji)}
                              className="text-lg hover:bg-gray-200 p-1 h-8 w-8"
                            >
                              {emoji}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <Textarea
                      id="message-template"
                      placeholder="Hi {name}! 👋\n\nI hope this message finds you well. I wanted to reach out about our upcoming event...\n\nBest regards!"
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      rows={8}
                      className="mt-2"
                    />
                  </div>
                  
                  {/* Message Preview */}
                  {messageTemplate && showMessagePreview && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-green-900">📱 WhatsApp Preview:</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowMessagePreview(false)}
                          className="text-xs text-green-600 hover:text-green-800"
                        >
                          Hide Preview
                        </Button>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-green-300 max-w-sm">
                        <div className="text-sm" dangerouslySetInnerHTML={{ __html: getPreviewMessage() }} />
                      </div>
                      <div className="text-xs text-green-600 mt-2">
                        This is how your message will look in WhatsApp with formatting applied.
                      </div>
                    </div>
                  )}
                  
                  {/* Show Preview Button */}
                  {messageTemplate && !showMessagePreview && (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowMessagePreview(true)}
                        className="text-xs"
                      >
                        📱 Show WhatsApp Preview
                      </Button>
                    </div>
                  )}
                  
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
                  disabled={!(whatsappStatus.authenticated || whatsappManualOverride) || contacts.length === 0 || !messageTemplate.trim() || sendingProgress.active}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  size="lg"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Messages to {contacts.length} Contacts
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="bulk-send" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-emerald-600" />
                  RocketSend-Style Bulk Messaging
                </CardTitle>
                <CardDescription>
                  Send personalized messages directly through WhatsApp Web with automated bulk sending
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Status Check */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium mb-2">📋 Pre-Send Checklist:</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {contacts.length > 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className={contacts.length > 0 ? 'text-green-700' : 'text-red-700'}>
                          {contacts.length} contacts uploaded
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {messageTemplate.trim() ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className={messageTemplate.trim() ? 'text-green-700' : 'text-red-700'}>
                          Message template created
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {whatsappStatus.authenticated || whatsappManualOverride ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className={(whatsappStatus.authenticated || whatsappManualOverride) ? 'text-green-700' : 'text-red-700'}>
                          WhatsApp connection ready
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* RocketSend-Style Interface */}
                  <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-l-blue-500">
                    <h4 className="font-medium text-blue-900 mb-3">🚀 RocketSend-Style Automation</h4>
                    
                    {/* Step 1: Open WhatsApp Web */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div>
                          <h5 className="font-medium">Step 1: Open WhatsApp Web</h5>
                          <p className="text-sm text-gray-600">Log in to WhatsApp Web in a separate tab</p>
                        </div>
                        <Button
                          onClick={() => window.open('https://web.whatsapp.com', '_blank')}
                          className="bg-green-600 hover:bg-green-700"
                          size="sm"
                        >
                          📱 Open WhatsApp Web
                        </Button>
                      </div>
                      
                      {/* Step 2: Inject Automation */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div>
                          <h5 className="font-medium">Option 1: Ultimate Auto-Send Script</h5>
                          <p className="text-sm text-gray-600">Most aggressive auto-send attempt with user simulation</p>
                        </div>
                        <Button
                          onClick={() => {
                            try {
                              const cleanContacts = contacts.map(contact => ({
                                name: contact.name,
                                phone: contact.phone,
                                additional_fields: contact.additional_fields || {}
                              }));
                              
                              const script = `
console.clear();
console.log('🚀 ENHANCED WhatsApp Sender 2025 - Human Simulation Mode');

const contacts = ${JSON.stringify(cleanContacts, null, 2)};
const messageTemplate = \`${messageTemplate}\`;

class EnhancedWhatsAppSender {
  constructor() {
    this.isRunning = false;
    this.successCount = 0;
    this.failCount = 0;
    this.currentContactIndex = 0;
  }

  formatPhone(phone) {
    let clean = phone.replace(/\\D/g, '');
    if (clean.startsWith('91') && clean.length > 10) {
      clean = clean.substring(2);
    }
    return clean;
  }

  personalizeMessage(template, contact) {
    let message = template.replace(/{name}/g, contact.name);
    // Handle additional fields
    if (contact.additional_fields) {
      Object.keys(contact.additional_fields).forEach(field => {
        const placeholder = new RegExp(\`{\${field}}\`, 'g');
        message = message.replace(placeholder, contact.additional_fields[field]);
      });
    }
    return message;
  }

  // Generate random delay to mimic human behavior
  randomDelay(min = 50, max = 200) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Human-like mouse movement simulation
  async humanMouseMove(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Add slight randomness to click position
    const offsetX = (Math.random() - 0.5) * 10;
    const offsetY = (Math.random() - 0.5) * 10;
    
    const mouseEvent = new MouseEvent('mouseover', {
      clientX: centerX + offsetX,
      clientY: centerY + offsetY,
      bubbles: true
    });
    element.dispatchEvent(mouseEvent);
    await this.sleep(this.randomDelay(50, 150));
  }

  // Enhanced human-like typing simulation
  async humanTyping(element, text) {
    element.focus();
    await this.sleep(this.randomDelay(100, 300));
    
    // Clear existing content with backspace simulation
    if (element.textContent && element.textContent.trim() !== '') {
      const deleteEvents = [
        new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true }),
        new KeyboardEvent('keyup', { key: 'Backspace', keyCode: 8, bubbles: true })
      ];
      
      for (let i = 0; i < element.textContent.length; i++) {
        deleteEvents.forEach(event => element.dispatchEvent(event));
        await this.sleep(this.randomDelay(10, 30));
      }
    }
    
    // Clear element content
    element.textContent = '';
    element.innerHTML = '';
    
    // Type each character with human-like delays
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Simulate keydown, keypress, keyup for each character
      const keyEvents = [
        new KeyboardEvent('keydown', { key: char, bubbles: true }),
        new KeyboardEvent('keypress', { key: char, bubbles: true }),
        new KeyboardEvent('keyup', { key: char, bubbles: true })
      ];
      
      // Add character to element
      if (char === '\\n') {
        element.innerHTML += '<br>';
      } else {
        element.textContent += char;
      }
      
      // Dispatch keyboard events
      keyEvents.forEach(event => element.dispatchEvent(event));
      
      // Trigger input and change events
      const inputEvent = new Event('input', { bubbles: true });
      const changeEvent = new Event('change', { bubbles: true });
      element.dispatchEvent(inputEvent);
      element.dispatchEvent(changeEvent);
      
      // Human-like delay between keystrokes (varies based on character)
      let delay = this.randomDelay(80, 200);
      if (char === ' ') delay = this.randomDelay(150, 350); // Longer pause for spaces
      if (char === '.' || char === ',' || char === '!') delay = this.randomDelay(200, 400);
      
      await this.sleep(delay);
    }
  }

  // Enhanced send button detection using 2025 selectors
  async findSendButton() {
    // Latest WhatsApp Web send button selectors (2024-2025)
    const sendButtonSelectors = [
      'button[data-testid="compose-btn-send"]', // Primary 2025 selector
      'button[data-testid="send"]', // Alternative 2025 selector
      'span[data-testid="send"]', // Sometimes it's a span
      'button[aria-label="Send"]',
      'div[role="button"][data-testid*="send"]',
      'button[title="Send"]',
      '[data-icon="send"]',
      'button svg[data-icon="send"]'
    ];
    
    for (const selector of sendButtonSelectors) {
      const buttons = document.querySelectorAll(selector);
      for (const button of buttons) {
        if (this.isVisibleAndClickable(button)) {
          console.log(\`✅ Found send button with selector: \${selector}\`);
          return button;
        }
      }
    }
    
    // Fallback: search by visual characteristics
    const allButtons = document.querySelectorAll('button, div[role="button"], span[role="button"]');
    for (const button of allButtons) {
      if (this.isSendButtonByContext(button)) {
        console.log('✅ Found send button by context analysis');
        return button;
      }
    }
    
    return null;
  }

  isVisibleAndClickable(element) {
    if (!element || !element.offsetParent) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && 
           rect.top >= 0 && rect.left >= 0;
  }

  isSendButtonByContext(element) {
    if (!this.isVisibleAndClickable(element)) return false;
    
    // Check if button is in the compose area (bottom of screen)
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    if (rect.top < windowHeight * 0.7) return false;
    
    // Check for send-related attributes or content
    const hasIcon = element.querySelector('svg');
    const dataIcon = element.getAttribute('data-icon');
    const ariaLabel = element.getAttribute('aria-label');
    const title = element.getAttribute('title');
    
    return hasIcon && (
      (dataIcon && dataIcon.includes('send')) ||
      (ariaLabel && ariaLabel.toLowerCase().includes('send')) ||
      (title && title.toLowerCase().includes('send'))
    );
  }

  // Find message input using latest selectors
  async findMessageInput() {
    const inputSelectors = [
      'div[contenteditable="true"][data-testid="conversation-compose-box-input"]', // 2025 primary
      'div[contenteditable="true"][data-tab="10"]', // Legacy but still used
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]', // Fallback
      '[data-testid="conversation-compose-box-input"]'
    ];
    
    for (const selector of inputSelectors) {
      const input = document.querySelector(selector);
      if (input && this.isVisibleAndClickable(input)) {
        console.log(\`✅ Found input with selector: \${selector}\`);
        return input;
      }
    }
    
    return null;
  }

  // Enhanced send attempt with multiple strategies
  async enhancedSendAttempt() {
    console.log('🚀 Starting enhanced send attempt...');
    
    // Wait for page to fully load
    await this.sleep(3000);
    
    // Strategy 1: Direct send button click (most reliable)
    console.log('🎯 Strategy 1: Direct send button click');
    const sendButton = await this.findSendButton();
    if (sendButton) {
      await this.humanMouseMove(sendButton);
      await this.sleep(this.randomDelay(200, 500));
      
      // Human-like click sequence
      sendButton.dispatchEvent(new MouseEvent('mousedown', { 
        bubbles: true, cancelable: true,
        clientX: sendButton.getBoundingClientRect().left + sendButton.getBoundingClientRect().width / 2,
        clientY: sendButton.getBoundingClientRect().top + sendButton.getBoundingClientRect().height / 2
      }));
      await this.sleep(this.randomDelay(50, 150));
      
      sendButton.dispatchEvent(new MouseEvent('mouseup', { 
        bubbles: true, cancelable: true 
      }));
      await this.sleep(this.randomDelay(30, 80));
      
      sendButton.dispatchEvent(new MouseEvent('click', { 
        bubbles: true, cancelable: true 
      }));
      
      await this.sleep(2000);
      if (await this.checkMessageSent()) {
        console.log('✅ Success with direct button click!');
        return true;
      }
    }
    
    // Strategy 2: Enter key simulation on message input
    console.log('🎯 Strategy 2: Enter key on message input');
    const messageInput = await this.findMessageInput();
    if (messageInput) {
      messageInput.focus();
      await this.sleep(this.randomDelay(100, 200));
      
      // Comprehensive Enter key event sequence
      const enterEvents = [
        new KeyboardEvent('keydown', { 
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, 
          bubbles: true, cancelable: true 
        }),
        new KeyboardEvent('keypress', { 
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, 
          bubbles: true, cancelable: true 
        }),
        new KeyboardEvent('keyup', { 
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, 
          bubbles: true, cancelable: true 
        })
      ];
      
      for (const event of enterEvents) {
        messageInput.dispatchEvent(event);
        await this.sleep(this.randomDelay(30, 80));
      }
      
      await this.sleep(2000);
      if (await this.checkMessageSent()) {
        console.log('✅ Success with Enter key!');
        return true;
      }
    }
    
    // Strategy 3: Form submission
    console.log('🎯 Strategy 3: Form submission');
    const form = document.querySelector('form');
    if (form) {
      try {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
        await this.sleep(2000);
        if (await this.checkMessageSent()) {
          console.log('✅ Success with form submission!');
          return true;
        }
      } catch (e) {
        console.log('Form submission failed:', e);
      }
    }
    
    console.log('❌ All send strategies failed');
    return false;
  }

  async checkMessageSent() {
    const inputSelectors = [
      'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"]'
    ];
    
    for (const selector of inputSelectors) {
      const input = document.querySelector(selector);
      if (input) {
        const isEmpty = !input.textContent || 
                       input.textContent.trim() === '' || 
                       input.innerHTML === '<br>' || 
                       input.innerHTML === '<div><br></div>' ||
                       input.innerHTML === '';
        
        // Also check for placeholder text restoration
        const hasPlaceholder = input.getAttribute('data-tab') || 
                              input.querySelector('[data-testid]');
        
        return isEmpty && !input.classList.contains('typing');
      }
    }
    return false;
  }

  async sendToContact(contact) {
    const phone = this.formatPhone(contact.phone);
    const message = this.personalizeMessage(messageTemplate, contact);
    
    console.log(\`\\n🎯 ENHANCED SEND: \${contact.name} (\${phone})\`);
    console.log(\`📝 Message: \${message.substring(0, 100)}...\`);
    
    // Navigate to contact with message
    const url = \`https://web.whatsapp.com/send?phone=91\${phone}&text=\${encodeURIComponent(message)}\`;
    window.location.href = url;
    
    // Extended wait for page load and WhatsApp processing
    await this.sleep(10000);
    
    // Try enhanced send
    const success = await this.enhancedSendAttempt();
    
    if (success) {
      console.log(\`✅ SUCCESS: \${contact.name}\`);
      this.successCount++;
    } else {
      console.log(\`❌ FAILED: \${contact.name} - All strategies failed\`);
      this.failCount++;
    }
    
    // Update control panel
    this.updateControlPanel();
    
    return success;
  }

  async startSending() {
    if (this.isRunning) {
      console.log('Already running!');
      return;
    }
    
    this.isRunning = true;
    this.currentContactIndex = 0;
    
    console.log('🚀 STARTING ENHANCED SEND SEQUENCE');
    console.log(\`📊 Total contacts: \${contacts.length}\`);
    
    for (let i = 0; i < contacts.length; i++) {
      if (!this.isRunning) {
        console.log('⏹️ Stopped by user');
        break;
      }
      
      this.currentContactIndex = i;
      console.log(\`\\n📱 Contact \${i+1}/\${contacts.length}\`);
      
      const startTime = Date.now();
      await this.sendToContact(contacts[i]);
      const endTime = Date.now();
      
      console.log(\`⏱️ Time taken: \${((endTime - startTime) / 1000).toFixed(1)}s\`);
      
      if (i < contacts.length - 1) {
        const waitTime = this.randomDelay(8000, 15000);
        console.log(\`⏳ Waiting \${(waitTime/1000).toFixed(1)} seconds before next contact...\`);
        await this.sleep(waitTime);
      }
    }
    
    console.log('\\n🏁 ENHANCED SEND COMPLETE');
    console.log(\`✅ Success: \${this.successCount}/\${contacts.length}\`);
    console.log(\`❌ Failed: \${this.failCount}/\${contacts.length}\`);
    console.log(\`📊 Success Rate: \${((this.successCount/contacts.length)*100).toFixed(1)}%\`);
    
    this.isRunning = false;
    this.updateControlPanel();
  }

  stop() {
    console.log('🛑 Stopping sender...');
    this.isRunning = false;
    this.updateControlPanel();
  }

  updateControlPanel() {
    const statusEl = document.getElementById('sender-status');
    const progressEl = document.getElementById('sender-progress');
    
    if (statusEl) {
      if (!this.isRunning && this.currentContactIndex === 0) {
        statusEl.textContent = 'Ready to start';
      } else if (this.isRunning) {
        statusEl.textContent = \`Sending \${this.currentContactIndex + 1}/\${contacts.length}\`;
      } else {
        statusEl.textContent = \`Complete: \${this.successCount}✅ \${this.failCount}❌\`;
      }
    }
    
    if (progressEl && contacts.length > 0) {
      const progress = ((this.currentContactIndex + 1) / contacts.length) * 100;
      progressEl.style.width = progress + '%';
    }
  }
}

window.enhancedSender = new EnhancedWhatsAppSender();

// Create enhanced control panel
const control = document.createElement('div');
control.style.cssText = \`
  position: fixed; top: 20px; right: 20px; z-index: 99999;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 25px; border-radius: 20px; color: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.3);
  border: 3px solid rgba(255,255,255,0.2); min-width: 320px;
  backdrop-filter: blur(10px);
\`;

control.innerHTML = \`
  <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">
    🚀 ENHANCED SENDER 2025
  </div>
  <div style="font-size: 12px; margin-bottom: 15px; opacity: 0.9;">
    Latest selectors • Human simulation • Auto-retry
  </div>
  
  <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 10px; margin-bottom: 15px;">
    <div id="sender-status" style="font-size: 14px; font-weight: bold;">Ready to start</div>
    <div style="background: rgba(255,255,255,0.2); height: 4px; border-radius: 2px; margin-top: 8px; overflow: hidden;">
      <div id="sender-progress" style="background: #4CAF50; height: 100%; width: 0%; transition: width 0.3s;"></div>
    </div>
  </div>
  
  <button id="enhanced-start" style="
    background: linear-gradient(45deg, #4CAF50, #45a049);
    color: white; border: none; padding: 12px 24px;
    border-radius: 10px; cursor: pointer; font-weight: bold;
    font-size: 14px; margin-right: 10px; margin-bottom: 8px;
    box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
    transition: transform 0.2s;
  " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
    ▶️ START SENDING
  </button>
  
  <button id="enhanced-stop" style="
    background: linear-gradient(45deg, #f44336, #d32f2f);
    color: white; border: none; padding: 12px 24px;
    border-radius: 10px; cursor: pointer; font-weight: bold;
    font-size: 14px; margin-bottom: 8px;
    box-shadow: 0 4px 15px rgba(244, 67, 54, 0.3);
    transition: transform 0.2s;
  " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
    ⏹️ STOP
  </button>
  
  <div style="font-size: 11px; margin-top: 10px; opacity: 0.8; line-height: 1.4;">
    Using 2025 WhatsApp Web selectors with human-like automation
  </div>
\`;

document.body.appendChild(control);

document.getElementById('enhanced-start').onclick = () => enhancedSender.startSending();
document.getElementById('enhanced-stop').onclick = () => enhancedSender.stop();

console.log('🚀 ENHANCED SENDER 2025 READY!');
console.log('Features:');
console.log('• Latest WhatsApp Web selectors (data-testid)');
console.log('• Human-like typing and mouse simulation');  
console.log('• Multiple send strategies with fallbacks');
console.log('• Anti-detection randomization');
console.log('• Real-time progress tracking');
console.log('');
console.log('Click "▶️ START SENDING" or run: enhancedSender.startSending()');`;`;

                              navigator.clipboard.writeText(script).then(() => {
                                alert('🚀 ENHANCED AUTO-SEND SCRIPT 2025 COPIED!\n\nNew Features:\n• Latest WhatsApp Web selectors (data-testid)\n• Human-like typing & mouse simulation\n• Anti-bot detection bypass\n• Multiple send strategies with fallbacks\n• Real-time progress tracking\n• Smart retry mechanisms\n\nInstructions:\n1. Open WhatsApp Web & login\n2. F12 → Console tab\n3. Paste script → Press Enter\n4. Click "▶️ START SENDING"\n\nThis version has significantly higher success rates!');
                              });
                            } catch (error) {
                              alert('Error generating script: ' + error.message);
                            }
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold"
                          size="sm"
                        >
                          🔥 Copy Ultimate Script
                        </Button>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-white rounded border">
                        <div>
                          <h5 className="font-medium">Option 2: Smart Manual Helper</h5>
                          <p className="text-sm text-gray-600">Auto-navigate + manual send (most reliable)</p>
                        </div>
                        <Button
                          onClick={() => {
                            try {
                              const cleanContacts = contacts.map(contact => ({
                                name: contact.name,
                                phone: contact.phone
                              }));
                              
                              const script = `
console.clear();
console.log('🎯 SMART MANUAL HELPER - Auto Navigation + Manual Send');

const contacts = ${JSON.stringify(cleanContacts, null, 2)};
const messageTemplate = \`${messageTemplate}\`;
let currentIndex = 0;

class SmartManualHelper {
  formatPhone(phone) {
    let clean = phone.replace(/\\D/g, '');
    if (clean.startsWith('91') && clean.length > 10) {
      clean = clean.substring(2);
    }
    return clean;
  }

  personalizeMessage(template, contact) {
    return template.replace(/{name}/g, contact.name);
  }

  async goToNextContact() {
    if (currentIndex >= contacts.length) {
      alert('🎉 All contacts completed!\\n\\nSent messages to ' + contacts.length + ' contacts.');
      return;
    }
    
    const contact = contacts[currentIndex];
    const phone = this.formatPhone(contact.phone);
    const message = this.personalizeMessage(messageTemplate, contact);
    
    console.log(\`📱 Contact \${currentIndex + 1}/\${contacts.length}: \${contact.name}\`);
    
    const url = \`https://web.whatsapp.com/send?phone=91\${phone}&text=\${encodeURIComponent(message)}\`;
    window.location.href = url;
    
    currentIndex++;
    
    // Update control panel
    this.updateControlPanel();
  }

  updateControlPanel() {
    const statusDiv = document.getElementById('manual-status');
    if (statusDiv) {
      if (currentIndex >= contacts.length) {
        statusDiv.textContent = '🎉 All Done!';
      } else {
        statusDiv.textContent = \`Contact \${currentIndex}/\${contacts.length} ready\`;
      }
    }
  }
}

const helper = new SmartManualHelper();

// Create smart control panel
const control = document.createElement('div');
control.style.cssText = \`
  position: fixed; top: 20px; right: 20px; z-index: 9999;
  background: linear-gradient(135deg, #25D366, #128C7E);
  padding: 25px; border-radius: 20px; color: white;
  font-family: Arial, sans-serif; text-align: center;
  box-shadow: 0 10px 30px rgba(37, 211, 102, 0.4);
  border: 3px solid white; min-width: 300px;
\`;

control.innerHTML = \`
  <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">
    🎯 SMART MANUAL HELPER
  </div>
  <div style="font-size: 12px; margin-bottom: 15px; opacity: 0.9;">
    Auto-navigate to each contact • You click Send
  </div>
  <button id="next-contact" style="
    background: white; color: #25D366;
    border: none; padding: 15px 25px;
    border-radius: 10px; cursor: pointer;
    font-weight: bold; font-size: 16px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    width: 100%; margin-bottom: 10px;
  ">📱 GO TO NEXT CONTACT</button>
  <div id="manual-status" style="font-size: 12px; opacity: 0.8;">
    Contact 1/\${contacts.length} ready
  </div>
  <div style="font-size: 11px; margin-top: 10px; opacity: 0.7; line-height: 1.4;">
    Click button → Message loads → You click Send → Repeat
  </div>
\`;

document.body.appendChild(control);

document.getElementById('next-contact').onclick = () => helper.goToNextContact();

console.log('🎯 SMART MANUAL HELPER READY!');
console.log('This will auto-navigate to each contact. You just need to click Send manually.');
console.log(\`Total contacts: \${contacts.length}\`);`;

                              navigator.clipboard.writeText(script).then(() => {
                                alert('🎯 SMART MANUAL HELPER COPIED!\n\nThis approach:\n• Auto-navigates to each contact\n• Pre-fills the personalized message\n• You manually click "Send" (most reliable)\n• Tracks progress automatically\n\nInstructions:\n1. Open WhatsApp Web\n2. F12 → Console\n3. Paste script → Enter\n4. Click "📱 GO TO NEXT CONTACT"\n5. Manually click Send\n6. Repeat for all contacts\n\nThis is the most reliable method!');
                              });
                            } catch (error) {
                              alert('Error: ' + error.message);
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700"
                          size="sm"
                        >
                          🎯 Copy Smart Helper
                        </Button>
                      </div>
                    </div>
                      
                      {/* Step 3: Instructions */}
                      <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                        <h5 className="font-medium text-yellow-900 mb-2">📝 How to Use:</h5>
                        <ol className="text-sm text-yellow-800 space-y-1">
                          <li><strong>1.</strong> Click "📱 Open WhatsApp Web" and log in</li>
                          <li><strong>2.</strong> Click "🔥 Copy ULTRA Auto-Send Script"</li>
                          <li><strong>3.</strong> In WhatsApp Web, press <kbd>F12</kbd> to open Console</li>
                          <li><strong>4.</strong> Paste the script and press Enter</li>
                          <li><strong>5.</strong> Click the "🚀 START ULTRA SEND" button that appears</li>
                          <li><strong>6.</strong> Watch as messages are sent automatically with no manual clicking!</li>
                        </ol>
                      </div>
                      
                      {/* Alternative Method */}
                      <div className="p-3 bg-green-50 rounded border border-green-200">
                        <h5 className="font-medium text-green-900 mb-2">💡 Alternative: Manual Console Commands</h5>
                        <p className="text-sm text-green-800 mb-2">After pasting the script, you can also run individual commands:</p>
                        <div className="bg-white p-2 rounded text-xs font-mono">
                          <div>bulkSender.startBulkSend() // Start bulk sending</div>
                          <div>console.log(contacts) // View your contacts</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
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
                <div className="flex gap-2">
                  {messageLogs.length > 0 && (
                    <Button 
                      variant="outline" 
                      onClick={clearLogs}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      size="sm"
                    >
                      Clear Logs
                    </Button>
                  )}
                </div>
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
                              variant={log.status === 'sent' ? 'default' : log.status === 'ready_for_batch_send' ? 'secondary' : 'destructive'}
                              className={log.status === 'sent' ? 'bg-green-500 hover:bg-green-600' : 
                                        log.status === 'ready_for_batch_send' ? 'bg-blue-500 hover:bg-blue-600' : ''}
                            >
                              {log.status === 'ready_for_batch_send' ? 'Ready to Send' : log.status}
                            </Badge>
                            <span className="font-medium">{log.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                            {log.status === 'ready_for_batch_send' && log.error_message && (
                              <Button
                                onClick={() => window.open(log.error_message, '_blank')}
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                📱 Send Now
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded mb-2">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.message}</p>
                        </div>
                        {log.status === 'ready_for_batch_send' && (
                          <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                            💡 Click "📱 Send Now" to open WhatsApp Web with this message pre-filled for instant sending!
                          </div>
                        )}
                        {log.error_message && log.status !== 'ready_for_batch_send' && (
                          <p className="text-sm text-red-600 mt-2">Error: {log.error_message}</p>
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
