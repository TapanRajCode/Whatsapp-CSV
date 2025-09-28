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
                  Bulk Message Sending
                </CardTitle>
                <CardDescription>
                  Send your personalized messages to all contacts automatically via WhatsApp Web
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

                  {/* Bulk Send Actions */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg border-l-4 border-l-emerald-500">
                      <div>
                        <h4 className="font-medium text-emerald-900">🚀 Ready for Bulk Sending</h4>
                        <p className="text-sm text-emerald-700 mt-1">
                          Send personalized messages to all {contacts.length} contacts at once
                        </p>
                      </div>
                      <Button
                        onClick={sendBulkMessages}
                        disabled={!(whatsappStatus.authenticated || whatsappManualOverride) || contacts.length === 0 || !messageTemplate.trim() || sendingProgress.active}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        size="lg"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Prepare Bulk Send
                      </Button>
                    </div>

                    {/* Send All Button - Only show if messages are ready */}
                    {messageLogs.some(log => log.status === 'ready_for_batch_send') && (
                      <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-l-blue-500">
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium text-blue-900">📱 Messages Ready to Send</h4>
                            <p className="text-sm text-blue-700 mt-1">
                              {(() => {
                                // Get unique contacts to avoid duplicates
                                const uniqueMessages = messageLogs.filter(log => log.status === 'ready_for_batch_send')
                                  .reduce((acc, log) => {
                                    if (!acc.find(item => item.phone === log.phone)) {
                                      acc.push(log);
                                    }
                                    return acc;
                                  }, []);
                                return uniqueMessages.length;
                              })()} personalized messages are prepared and ready
                            </p>
                          </div>
                          
                          {/* Individual Send Buttons - Popup Free Solution */}
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium text-blue-900">Click to send individual messages:</h5>
                            <div className="grid grid-cols-1 gap-2">
                              {(() => {
                                // Get unique messages to avoid duplicates
                                const uniqueMessages = messageLogs.filter(log => log.status === 'ready_for_batch_send')
                                  .reduce((acc, log) => {
                                    if (!acc.find(item => item.phone === log.phone)) {
                                      acc.push(log);
                                    }
                                    return acc;
                                  }, []);
                                  
                                return uniqueMessages.map((log, index) => {
                                  const contactName = contacts.find(c => c.phone === log.phone)?.name || `Contact ${index + 1}`;
                                  return (
                                    <Button
                                      key={log.phone}
                                      onClick={() => {
                                        // Direct user click - no popup blocker issues
                                        window.open(log.error_message, '_blank');
                                      }}
                                      className="bg-green-600 hover:bg-green-700 text-white justify-between"
                                      size="sm"
                                    >
                                      <span>📱 Send to {contactName}</span>
                                      <span className="text-xs opacity-80">{log.phone}</span>
                                    </Button>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                          
                          {/* Quick Send All Instructions */}
                          <div className="p-3 bg-green-50 rounded border border-green-200">
                            <h5 className="text-sm font-medium text-green-900 mb-1">🚀 Quick Bulk Send Instructions:</h5>
                            <ol className="text-xs text-green-800 space-y-1">
                              <li><strong>1.</strong> Right-click on each "Send to [Name]" button above</li>
                              <li><strong>2.</strong> Select "Open link in new tab" from the menu</li>
                              <li><strong>3.</strong> All WhatsApp tabs will open without popup blocking</li>
                              <li><strong>4.</strong> Go through each tab and click "Send"</li>
                            </ol>
                            <div className="text-xs text-green-600 mt-2">
                              💡 Or use Ctrl+Click (Windows) / Cmd+Click (Mac) on each button to open tabs quickly
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Progress Display */}
                    {sendingProgress.active && (
                      <div className="space-y-2">
                        <Progress value={sendingProgress.progress} className="w-full" />
                        <p className="text-sm text-gray-600 text-center">{sendingProgress.message}</p>
                      </div>
                    )}

                    {sendingProgress.message && !sendingProgress.active && (
                      <Alert className="border-emerald-200 bg-emerald-50">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <AlertDescription className="text-emerald-700">
                          {sendingProgress.message}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* Instructions */}
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <h4 className="font-medium text-yellow-900 mb-2">📝 How Bulk Sending Works:</h4>
                    <ol className="text-sm text-yellow-800 space-y-1 mb-3">
                      <li><strong>1.</strong> Click "Prepare Bulk Send" to process all your contacts</li>
                      <li><strong>2.</strong> Click "Send All" to open WhatsApp Web tabs for each contact</li>
                      <li><strong>3.</strong> Each tab opens with the personalized message pre-filled</li>
                      <li><strong>4.</strong> Simply click "Send" in each WhatsApp Web tab</li>
                    </ol>
                    
                    <div className="p-2 bg-orange-100 rounded text-xs text-orange-800">
                      <strong>⚠️ Browser Popup Blocker:</strong> If tabs don't open automatically, your browser may be blocking popups. 
                      Click the popup blocker icon in your address bar and select "Always allow popups from this site" or use the individual "Send to [Name]" buttons.
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
