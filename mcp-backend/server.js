require('dotenv').config();
const os = require('os');

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// AI Integration (choose one)
const OpenAI = require('openai'); // npm install openai
// const Anthropic = require('@anthropic-ai/sdk'); // npm install @anthropic-ai/sdk

// Microsoft Graph for Outlook (optional)
// const { Client } = require('@microsoft/microsoft-graph-client'); // npm install @microsoft/microsoft-graph-client

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize AI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
});

// Enhanced MCP Server class
class EnhancedMCPServer {
  constructor() {
    this.capabilities = {
      resources: true,
      tools: true,
      logging: true,
      ai_integration: true,
      outlook_integration: true
    };
    
    this.tools = [
      {
        name: 'read_file',
        description: 'Read contents of a file'
      },
      {
        name: 'list_directory',
        description: 'List contents of a directory'
      },
      {
        name: 'search_files_advanced',
        description: 'Advanced file search across multiple locations'
      },
      {
        name: 'get_system_info',
        description: 'Get system information'
      },
      {
        name: 'analyze_email_patterns_advanced',
        description: 'Advanced email pattern analysis with AI'
      },
      {
        name: 'search_outlook_emails',
        description: 'Search Outlook emails for contact context'
      },
      {
        name: 'generate_ai_email',
        description: 'Generate email using real AI with context'
      }
    ];

    // Enhanced search locations
    this.searchLocations = this.getSearchLocations();
    this.emailFileTypes = ['.eml', '.msg', '.mbox', '.txt', '.md', '.docx', '.pdf', '.csv', '.json', '.xml'];
  }

  getSearchLocations() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const locations = [
      '.', // Current directory
      homeDir + '/Documents',
      homeDir + '/Downloads', 
      homeDir + '/Desktop',
    ];

    // Add OS-specific locations
    if (process.platform === 'win32') {
      locations.push(
        homeDir + '\\Documents',
        homeDir + '\\AppData\\Local\\Microsoft\\Outlook',
        'C:\\Users\\' + process.env.USERNAME + '\\Documents'
      );
    } else if (process.platform === 'darwin') {
      locations.push(
        homeDir + '/Library/Mail',
        homeDir + '/Documents'
      );
    }

    return locations;
  }

  async searchMacOSOutlook(contactName) {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      error: 'macOS Outlook integration only available on macOS'
    };
  }

  try {
    // Method 1: Search Outlook database files
    const outlookDataPath = path.join(os.homedir(), 'Library/Group Containers/UBF8T346G9.Office/Outlook/Outlook 15 Profiles/Main Profile/Data/');
    
    // Method 2: Use AppleScript to interact with Outlook
    const appleScript = `
      tell application "Microsoft Outlook"
        set searchResults to {}
        try
          set myMessages to (every message in inbox whose subject contains "${contactName}" or sender's name contains "${contactName}")
          repeat with aMessage in myMessages
            set messageInfo to {subject of aMessage, sender's name of aMessage, time received of aMessage}
            set end of searchResults to messageInfo
          end repeat
          return searchResults
        on error errMsg
          return "Error: " & errMsg
        end try
      end tell
    `;

    const { stdout, stderr } = await execAsync(`osascript -e '${appleScript}'`);
    
    if (stderr) {
      throw new Error(stderr);
    }

    return {
      success: true,
      emails: this.parseAppleScriptOutput(stdout),
      source: 'Outlook macOS (AppleScript)',
      contactName
    };

  } catch (error) {
    // Fallback: Search Outlook export files or .mbox files
    return await this.searchOutlookExportFiles(contactName);
  }
}

async searchOutlookExportFiles(contactName) {
  try {
    // Common Outlook export locations on macOS
    const exportLocations = [
      path.join(os.homedir(), 'Documents/Microsoft User Data/Outlook'),
      path.join(os.homedir(), 'Documents/Outlook'),
      path.join(os.homedir(), 'Downloads'), // Common export location
      path.join(os.homedir(), 'Desktop')
    ];

    const searchResult = await this.searchFilesAdvanced(contactName, exportLocations, ['.olm', '.pst', '.mbox', '.eml']);
    
    if (searchResult.success && searchResult.results.length > 0) {
      return {
        success: true,
        source: 'Outlook Export Files',
        contactName,
        foundFiles: searchResult.results.length,
        files: searchResult.results.slice(0, 5) // Limit results
      };
    }

    return {
      success: false,
      error: 'No Outlook data found. Try exporting emails or ensure Outlook is installed.'
    };

  } catch (error) {
    return {
      success: false,
      error: `Outlook file search failed: ${error.message}`
    };
  }
}

parseAppleScriptOutput(output) {
  // Parse AppleScript output format
  try {
    // AppleScript returns data in a specific format, parse accordingly
    const lines = output.trim().split('\n');
    return lines.map(line => {
      const parts = line.split(',');
      return {
        subject: parts[0]?.trim(),
        sender: parts[1]?.trim(),
        received: parts[2]?.trim()
      };
    }).filter(email => email.subject); // Filter out invalid entries
  } catch (error) {
    return [];
  }
}

  async executeTool(toolName, args) {
    switch (toolName) {
      case 'read_file':
        return await this.readFile(args.path);
      
      case 'list_directory':
        return await this.listDirectory(args.path);
      
      case 'search_files_advanced':
        return await this.searchFilesAdvanced(args.query, args.locations, args.fileTypes);
      
      case 'get_system_info':
        return await this.getSystemInfo();
      
      case 'analyze_email_patterns_advanced':
        return await this.analyzeEmailPatternsAdvanced(args.contactName);
      
      case 'search_outlook_emails':
        return await this.searchOutlookEmails(args.contactName);
      
      case 'generate_ai_email':
        return await this.generateAIEmail(args.recipient, args.context, args.prompt);

        case 'search_outlook_emails':
      if (process.platform === 'darwin') {
        return await this.searchMacOSOutlook(args.contactName);
      } else {
        return await this.searchOutlookEmails(args.contactName);
      }
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // Enhanced file reading with multiple encodings
  async readFile(filePath) {
    try {
      const resolvedPath = path.resolve(filePath);
      
      // Try different encodings
      let content;
      try {
        content = await fs.readFile(resolvedPath, 'utf-8');
      } catch (encodingError) {
        // Try latin1 for some email files
        content = await fs.readFile(resolvedPath, 'latin1');
      }
      
      const stats = await fs.stat(resolvedPath);
      
      return {
        success: true,
        content,
        metadata: {
          size: stats.size,
          modified: stats.mtime,
          path: resolvedPath,
          encoding: 'auto-detected'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Advanced file search across multiple locations
  async searchFilesAdvanced(query, customLocations = null, customFileTypes = null) {
    try {
      const searchLocations = customLocations || this.searchLocations;
      const fileTypes = customFileTypes || this.emailFileTypes;
      const results = [];
      
      for (const location of searchLocations) {
        try {
          const locationResults = await this.searchInLocation(location, query, fileTypes);
          results.push(...locationResults);
        } catch (locationError) {
          console.log(`Skipping location ${location}: ${locationError.message}`);
          continue;
        }
      }
      
      return {
        success: true,
        query,
        searchLocations,
        totalResults: results.length,
        results: results.slice(0, 50) // Limit results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async searchInLocation(location, query, fileTypes) {
    const results = [];
    
    try {
      const resolvedLocation = path.resolve(location);
      await this.searchRecursive(resolvedLocation, query, fileTypes, results, 0, 3); // Max depth 3
      return results;
    } catch (error) {
      return [];
    }
  }

  async searchRecursive(dir, query, fileTypes, results, currentDepth, maxDepth) {
    if (currentDepth > maxDepth) return;
    
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dir, item.name);
        
        // Skip hidden directories and common excludes
        if (item.name.startsWith('.') || 
            ['node_modules', 'vendor', 'venv', '__pycache__'].includes(item.name)) {
          continue;
        }
        
        if (item.isDirectory()) {
          await this.searchRecursive(itemPath, query, fileTypes, results, currentDepth + 1, maxDepth);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (fileTypes.includes(ext)) {
            try {
              const content = await this.readFile(itemPath);
              if (content.success && content.content.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                  file: itemPath,
                  type: ext,
                  size: content.metadata.size,
                  modified: content.metadata.modified,
                  preview: this.getContentPreview(content.content, query)
                });
              }
            } catch (readError) {
              // Skip files that can't be read
            }
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be accessed
    }
  }

  getContentPreview(content, query) {
    const lines = content.split('\n');
    const matchingLines = lines
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => line.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3);
    
    return matchingLines;
  }

  // Enhanced email pattern analysis with AI
  async analyzeEmailPatternsAdvanced(contactName) {
    try {
      // First, search for email-related files
      const searchResult = await this.searchFilesAdvanced(contactName);
      
      if (!searchResult.success || searchResult.results.length === 0) {
        return this.generateMockEmailAnalysis(contactName);
      }

      // Extract content from found files
      const emailContents = [];
      for (const result of searchResult.results.slice(0, 10)) { // Limit to 10 files
        const fileContent = await this.readFile(result.file);
        if (fileContent.success) {
          emailContents.push({
            file: result.file,
            content: fileContent.content,
            modified: result.modified
          });
        }
      }

      // Use AI to analyze patterns
      const aiAnalysis = await this.analyzeWithAI(contactName, emailContents);
      
      return {
        success: true,
        analysis: {
          contactName,
          foundFiles: searchResult.results.length,
          analyzedFiles: emailContents.length,
          searchLocations: searchResult.searchLocations,
          aiGenerated: true,
          ...aiAnalysis
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async analyzeWithAI(contactName, emailContents) {
    try {
      const contentSummary = emailContents.map(item => ({
        file: path.basename(item.file),
        preview: item.content.substring(0, 500) // First 500 chars
      }));

      const prompt = `Analyze these email/communication files for patterns with ${contactName}:

${JSON.stringify(contentSummary, null, 2)}

Please analyze and return a JSON object with:
- relationship: (Manager/Colleague/Client/Contact)
- communicationStyle: (Formal/Professional/Casual)
- commonTopics: array of common discussion topics
- lastInteractionDate: estimated date
- preferences: array of communication preferences
- recentContext: summary of recent communication themes
- tone: overall tone of communications

Focus on communication patterns, not personal details.`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.3
      });

      try {
        return JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        // Fallback if AI doesn't return valid JSON
        return this.extractPatternsManually(emailContents, contactName);
      }
    } catch (aiError) {
      console.error('AI analysis failed:', aiError);
      return this.extractPatternsManually(emailContents, contactName);
    }
  }

  extractPatternsManually(emailContents, contactName) {
    const analysis = {
      relationship: 'Contact',
      communicationStyle: 'Professional',
      commonTopics: [],
      lastInteractionDate: new Date().toISOString().split('T')[0],
      preferences: [],
      recentContext: 'Communication history found in local files'
    };

    // Simple pattern extraction
    const allContent = emailContents.map(item => item.content.toLowerCase()).join(' ');
    
    // Detect relationship
    if (allContent.includes('manager') || allContent.includes('supervisor')) {
      analysis.relationship = 'Manager';
    } else if (allContent.includes('team') || allContent.includes('colleague')) {
      analysis.relationship = 'Colleague';
    } else if (allContent.includes('client') || allContent.includes('customer')) {
      analysis.relationship = 'Client';
    }

    // Detect communication style
    if (allContent.includes('dear') && allContent.includes('sincerely')) {
      analysis.communicationStyle = 'Formal';
    } else if (allContent.includes('hey') || allContent.includes('thanks!')) {
      analysis.communicationStyle = 'Casual';
    }

    // Extract topics
    const topics = ['project', 'meeting', 'deadline', 'budget', 'review', 'update', 'call'];
    topics.forEach(topic => {
      if (allContent.includes(topic)) {
        analysis.commonTopics.push(topic);
      }
    });

    return analysis;
  }

  // Outlook email search (Windows only)
  async searchOutlookEmails(contactName) {
    if (process.platform !== 'win32') {
      return {
        success: false,
        error: 'Outlook integration only available on Windows'
      };
    }

    try {
      const script = `
        try {
          Add-Type -AssemblyName "Microsoft.Office.Interop.Outlook"
          $outlook = New-Object -ComObject Outlook.Application
          $namespace = $outlook.GetNamespace("MAPI")
          $inbox = $namespace.GetDefaultFolder(6)
          
          $emails = $inbox.Items | Where-Object { 
            $_.Subject -like "*${contactName}*" -or 
            $_.SenderName -like "*${contactName}*" 
          } | Select-Object -First 10 Subject, SenderName, ReceivedTime, Body
          
          $emails | ConvertTo-Json -Depth 2
        } catch {
          Write-Output "Error: $_"
        }
      `;

      const { stdout, stderr } = await execAsync(`powershell -Command "${script}"`);
      
      if (stderr) {
        throw new Error(stderr);
      }

      try {
        const emails = JSON.parse(stdout);
        return {
          success: true,
          emails: Array.isArray(emails) ? emails : [emails],
          source: 'Outlook Desktop'
        };
      } catch (parseError) {
        return {
          success: false,
          error: 'Could not parse Outlook data: ' + stdout
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Outlook access failed: ' + error.message
      };
    }
  }

  // Generate email using real AI
  async generateAIEmail(recipient, context, customPrompt = null) {
    try {
      const prompt = customPrompt || `Draft a professional email to ${recipient}.

Context from analysis:
${JSON.stringify(context, null, 2)}

Requirements:
- Match the communication style (${context.communicationStyle})
- Reference the relationship type (${context.relationship})
- Include relevant topics: ${context.commonTopics?.join(', ')}
- Use appropriate tone and formality
- Keep it concise but personalized
- Include a clear subject line

Generate a complete email draft:`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.7
      });

      return {
        success: true,
        emailDraft: response.choices[0].message.content,
        aiModel: 'gpt-3.5-turbo',
        tokensUsed: response.usage?.total_tokens,
        contextUsed: context
      };
    } catch (error) {
      return {
        success: false,
        error: 'AI generation failed: ' + error.message
      };
    }
  }

  async listDirectory(dirPath = '.') {
    try {
      const resolvedPath = path.resolve(dirPath);
      const items = await fs.readdir(resolvedPath, { withFileTypes: true });
      
      const contents = await Promise.all(
        items.slice(0, 100).map(async (item) => { // Limit to 100 items
          const itemPath = path.join(resolvedPath, item.name);
          try {
            const stats = await fs.stat(itemPath);
            return {
              name: item.name,
              type: item.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime,
              path: itemPath
            };
          } catch (statError) {
            return {
              name: item.name,
              type: item.isDirectory() ? 'directory' : 'file',
              error: 'Permission denied'
            };
          }
        })
      );

      return {
        success: true,
        path: resolvedPath,
        contents
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSystemInfo() {
    try {
      const os = require('os');
      
      const systemInfo = {
        platform: os.platform(),
        architecture: os.arch(),
        hostname: os.hostname(),
        userInfo: os.userInfo(),
        homeDirectory: os.homedir(),
        currentWorkingDirectory: process.cwd(),
        nodeVersion: process.version,
        memory: {
          total: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
          free: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB'
        },
        cpus: os.cpus().length,
        searchLocations: this.searchLocations,
        supportedFileTypes: this.emailFileTypes
      };

      return {
        success: true,
        systemInfo
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateMockEmailAnalysis(contactName) {
    const mockData = {
      'sarah': {
        relationship: 'Project Manager',
        communicationStyle: 'Professional',
        commonTopics: ['budget', 'timeline', 'project', 'meeting'],
        lastInteractionDate: '2024-01-15',
        preferences: ['Detailed updates', 'Structured communication'],
        recentContext: 'Recent discussions about Q1 project milestones'
      },
      'john': {
        relationship: 'Team Lead',
        communicationStyle: 'Casual',
        commonTopics: ['code review', 'development', 'team'],
        lastInteractionDate: '2024-01-16',
        preferences: ['Informal style', 'Technical discussions'],
        recentContext: 'Code optimization and sprint planning'
      },
      'lisa': {
        relationship: 'Client',
        communicationStyle: 'Professional',
        commonTopics: ['deliverables', 'review', 'feedback'],
        lastInteractionDate: '2024-01-14',
        preferences: ['Professional tone', 'Clear next steps'],
        recentContext: 'Positive feedback on deliverables'
      }
    };

    const analysis = mockData[contactName.toLowerCase()] || {
      relationship: 'Contact',
      communicationStyle: 'Professional',
      commonTopics: ['follow-up'],
      lastInteractionDate: new Date().toISOString().split('T')[0],
      preferences: ['Professional communication'],
      recentContext: 'No specific context available'
    };

    return {
      success: true,
      analysis: {
        contactName,
        foundFiles: 0,
        dataSource: 'mock',
        ...analysis
      }
    };
  }
}

// Initialize Enhanced MCP Server
const mcpServer = new EnhancedMCPServer();

// API Routes
app.get('/api/mcp/capabilities', (req, res) => {
  res.json({
    capabilities: mcpServer.capabilities,
    tools: mcpServer.tools
  });
});

app.post('/api/mcp/execute', async (req, res) => {
  try {
    const { tool, args } = req.body;
    
    if (!tool) {
      return res.status(400).json({ error: 'Tool name is required' });
    }

    const result = await mcpServer.executeTool(tool, args || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});



// Outlook integration endpoint
app.post('/api/outlook/search', async (req, res) => {
  try {
    const { contactName } = req.body;
    
    if (!contactName) {
      return res.status(400).json({ error: 'Contact name is required' });
    }

    const outlookResult = await mcpServer.executeTool('search_outlook_emails', { contactName });
    res.json(outlookResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Advanced file search endpoint
app.post('/api/files/search', async (req, res) => {
  try {
    const { query, locations, fileTypes } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchResult = await mcpServer.executeTool('search_files_advanced', { 
      query, 
      locations, 
      fileTypes 
    });
    res.json(searchResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI email generation endpoint
app.post('/api/ai/generate-email', async (req, res) => {
  try {
    const { recipient, context, prompt } = req.body;
    
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient is required' });
    }

    const aiResult = await mcpServer.executeTool('generate_ai_email', { recipient, context, prompt });
    res.json(aiResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function generateFallbackEmail(recipient, analysis) {
  const name = recipient.charAt(0).toUpperCase() + recipient.slice(1);
  
  const templates = {
    'Manager': `Subject: Project Status Update and Next Steps

Dear ${name},

I hope this message finds you well. Following up on our recent discussions about ${analysis.commonTopics?.join(', ') || 'our ongoing projects'}, I wanted to provide you with an update on current progress.

Given your preference for ${analysis.preferences?.join(' and ') || 'detailed updates'}, I've prepared a comprehensive status report that addresses the key areas we discussed.

${analysis.recentContext ? analysis.recentContext + '\n\n' : ''}Could we schedule a brief meeting this week to review the progress and discuss the next steps? I believe we can address any challenges effectively with your guidance.

Thank you for your continued leadership on this project.

Best regards,
[Your name]`,

    'Colleague': `Subject: Quick update on our project 👍

Hey ${name}!

Hope you're having a good week! Wanted to follow up on our recent chat about ${analysis.commonTopics?.join(', ') || 'the project'}.

Here's what's been happening:
• Made solid progress on the items we discussed
• Addressed the feedback from our last conversation
• Ready to move forward with the next phase

${analysis.recentContext ? analysis.recentContext + '\n\n' : ''}Let me know what you think when you get a chance. Always appreciate your input on these things!

Thanks,
[Your name]`,

    'Client': `Subject: Thank You and Next Steps

Dear ${name},

Thank you for your continued partnership and positive feedback on our recent work. It's wonderful to hear that you're satisfied with the deliverables.

${analysis.recentContext ? analysis.recentContext + '\n\n' : ''}Based on our previous discussions about ${analysis.commonTopics?.join(', ') || 'our collaboration'}, I've prepared some recommendations for next steps:

1. Detailed proposal for the upcoming phase
2. Timeline and milestone breakdown
3. Resource requirements and deliverable schedule

I'd love to schedule a call to discuss these opportunities in detail. What does your calendar look like next week?

Looking forward to continuing our successful partnership.

Best regards,
[Your name]`,

    'Contact': `Subject: Following Up on Our Discussion

Hi ${name},

I hope you're doing well. I wanted to follow up on our recent communication regarding ${analysis.commonTopics?.join(', ') || 'our discussion topics'}.

${analysis.recentContext ? analysis.recentContext + '\n\n' : ''}Please let me know if you have any questions or if there's anything I can help with moving forward.

Best regards,
[Your name]`
  };

  return templates[analysis.relationship] || templates['Contact'];
}

function generateGenericEmail(recipient) {
  const name = recipient.charAt(0).toUpperCase() + recipient.slice(1);
  
  return `Subject: Hello ${name}

Hi ${name},

I hope you're doing well. I wanted to reach out regarding [topic/reason for email].

[Your main message here]

Please let me know if you have any questions or if there's anything I can help with.

Best regards,
[Your name]

*Note: This is a generic template. Enable MCP and ensure proper API keys are configured for personalized drafts based on your actual communication history and AI generation.*`;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    features: {
      fileSystemAccess: true,
      aiIntegration: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-api-key-here',
      outlookIntegration: process.platform === 'win32',
      advancedSearch: true
    },
    searchLocations: mcpServer.searchLocations.length,
    supportedFileTypes: mcpServer.emailFileTypes.length
  };
  
  res.json(health);
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    platform: process.platform,
    searchLocations: mcpServer.searchLocations,
    fileTypes: mcpServer.emailFileTypes,
    features: {
      aiEnabled: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-api-key-here',
      outlookEnabled: process.platform === 'win32',
      advancedSearchEnabled: true
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Enhanced MCP Server running on port ${PORT}`);
  console.log(`📁 File system access: ✅ Enabled`);
  console.log(`🤖 AI integration: ${process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-api-key-here' ? '✅ Enabled' : '❌ Disabled (set OPENAI_API_KEY)'}`);
  console.log(`📧 Outlook integration: ${process.platform === 'win32' ? '✅ Available' : '❌ Windows only'}`);
  console.log(`🔧 Available tools: ${mcpServer.tools.map(t => t.name).join(', ')}`);
  console.log(`📂 Search locations: ${mcpServer.searchLocations.length} configured`);
  console.log(`📄 File types: ${mcpServer.emailFileTypes.join(', ')}`);
});

// Simple AI email generation endpoint (no MCP context)
app.post('/api/ai/generate-simple-email', async (req, res) => {
  try {
    const { recipient, originalMessage, useBasicPrompt = true } = req.body;
    
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient is required' });
    }

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-api-key-here') {
      return res.status(400).json({ 
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.' 
      });
    }

    const aiResult = await generateSimpleAIEmail(recipient, originalMessage);
    
    if (aiResult.success) {
      res.json({
        success: true,
        emailDraft: aiResult.emailDraft,
        aiGenerated: true,
        aiModel: aiResult.aiModel,
        tokensUsed: aiResult.tokensUsed,
        context: 'No context - MCP disabled'
      });
    } else {
      res.status(500).json({
        error: aiResult.error
      });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function for simple AI email generation
async function generateSimpleAIEmail(recipient, originalMessage) {
  try {
    const name = recipient.charAt(0).toUpperCase() + recipient.slice(1);
    
    // Extract intent from the original message
    const intent = extractEmailIntent(originalMessage);
    
    const prompt = `You are a professional email assistant. Draft a well-written, professional email to ${name}.

Original request: "${originalMessage}"

Context: This is a ${intent.type} email. ${intent.description}

Requirements:
- Use a professional but friendly tone
- Include an appropriate subject line
- Make it concise but complete
- Use proper email formatting
- Include placeholders for specific details that the sender should fill in
- Sign off appropriately

Generate a complete email draft:`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.7
    });

    return {
      success: true,
      emailDraft: response.choices[0].message.content,
      aiModel: 'gpt-3.5-turbo',
      tokensUsed: response.usage?.total_tokens
    };

  } catch (error) {
    console.error('Simple AI email generation failed:', error);
    return {
      success: false,
      error: error.message.includes('API key') ? 'Invalid or missing OpenAI API key' : error.message
    };
  }
}

// Helper function to extract intent from user message
function extractEmailIntent(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('reply') || lowerMessage.includes('respond')) {
    return {
      type: 'reply',
      description: 'The sender wants to reply to a previous communication.'
    };
  } else if (lowerMessage.includes('follow up') || lowerMessage.includes('followup')) {
    return {
      type: 'follow-up',
      description: 'The sender wants to follow up on a previous discussion or action.'
    };
  } else if (lowerMessage.includes('meeting') || lowerMessage.includes('schedule')) {
    return {
      type: 'meeting',
      description: 'The sender wants to schedule or discuss a meeting.'
    };
  } else if (lowerMessage.includes('thank') || lowerMessage.includes('appreciation')) {
    return {
      type: 'thank you',
      description: 'The sender wants to express gratitude or appreciation.'
    };
  } else if (lowerMessage.includes('introduction') || lowerMessage.includes('introduce')) {
    return {
      type: 'introduction',
      description: 'The sender wants to make an introduction or introduce themselves.'
    };
  } else if (lowerMessage.includes('request') || lowerMessage.includes('ask')) {
    return {
      type: 'request',
      description: 'The sender wants to make a request or ask for something.'
    };
  } else {
    return {
      type: 'general',
      description: 'This appears to be a general communication.'
    };
  }
}

app.post('/api/email/draft', async (req, res) => {
  try {
    const { recipient, mcpEnabled, useAI = true } = req.body;

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient is required' });
    }

    let response = {
      recipient,
      mcpEnabled,
      useAI,
      emailDraft: '',
      context: null,
      aiGenerated: false
    };

    if (mcpEnabled) {
      // MCP ENABLED: Use advanced analysis with context
      const analysisResult = await mcpServer.executeTool('analyze_email_patterns_advanced', { contactName: recipient });
      
      if (analysisResult.success) {
        response.context = analysisResult.analysis;
        
        if (useAI && process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-api-key-here') {
          // Generate email using real AI with context
          const aiResult = await mcpServer.executeTool('generate_ai_email', { 
            recipient, 
            context: analysisResult.analysis 
          });
          
          if (aiResult.success) {
            response.emailDraft = aiResult.emailDraft;
            response.aiGenerated = true;
            response.aiModel = aiResult.aiModel;
            response.tokensUsed = aiResult.tokensUsed;
          } else {
            response.emailDraft = generateFallbackEmail(recipient, analysisResult.analysis);
            response.aiGenerated = false;
            response.aiError = aiResult.error;
          }
        } else {
          // Use template-based generation with context
          response.emailDraft = generateFallbackEmail(recipient, analysisResult.analysis);
          response.aiGenerated = false;
        }
      } else {
        response.emailDraft = generateGenericEmail(recipient);
        response.context = { error: analysisResult.error };
      }
    } else {
      // MCP DISABLED: Use AI without context OR basic template
      if (useAI && process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-api-key-here') {
        // Generate email using AI but without context
        const simpleAIResult = await generateSimpleAIEmail(recipient, `draft me an email for ${recipient}`);
        
        if (simpleAIResult.success) {
          response.emailDraft = simpleAIResult.emailDraft;
          response.aiGenerated = true;
          response.aiModel = simpleAIResult.aiModel;
          response.tokensUsed = simpleAIResult.tokensUsed;
          response.context = { note: 'No context analysis - MCP disabled' };
        } else {
          response.emailDraft = generateGenericEmail(recipient);
          response.aiGenerated = false;
          response.aiError = simpleAIResult.error;
        }
      } else {
        // Fallback to basic template
        response.emailDraft = generateGenericEmail(recipient);
        response.aiGenerated = false;
        response.context = { note: 'AI disabled or API key not configured' };
      }
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { app, mcpServer };