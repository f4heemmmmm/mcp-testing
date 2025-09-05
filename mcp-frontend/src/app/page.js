"use client";

import Head from "next/head";
import { useState, useRef, useEffect } from "react";

export default function Home() {
    const [messages, setMessages] = useState([
        {
            type: "AI",
            content: "Hi FundrAIser! Try me!",
            mcpMode: false
        }
    ]);
    const messagesEndRef = useRef(null);
    const [isTyping, setIsTyping] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [MCPEnabled, setMCPEnabled] = useState(false);
    const [MCPStatus, setMCPStatus] = useState("disconnected");

    // Get status color based on MCP connection state
    const getStatusColor = () => {
        switch (MCPStatus) {
            case "connected":
                return "text-green-600";
            case "disconnected":
                return "text-red-600";
            case "error":
                return "text-yellow-600";
            default:
                return "text-gray-600";
        }
    }

    // Check MCP server health endpoint
    const checkMCPConnection = async () => {
        try {
            const response = await fetch("http://localhost:3001/api/health");
            if (response.ok) {
                setMCPStatus("connected");
            } else {
                setMCPStatus("error");
            }
        } catch (error) {
            setMCPStatus("disconnected");
        }
    };

    // Get human-readable status text
    const getStatusText = () => {
        switch (MCPStatus) {
            case "connected":
                return "MCP Server Connected";
            case "error":
                return "MCP Server Error";
            case "disconnected":
                return "MCP Server Disconnected";
            default:
                return "Checking MCP Server...";
        }
    };

    // Handle Enter key press to send message
    const handleKeyPress = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // Main message sending handler
    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) {
            return;
        }

        const userMessage = inputValue.trim();
        setInputValue("");
        setIsLoading(true);

        // Add user message to chat
        setMessages(prev => [...prev, {
            type: "user",
            content: userMessage
        }]);

        // Show typing indicator
        setIsTyping(true);
        
        // Simulate API delay for better UX
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const response = await generateResponse(userMessage);
        
        setIsTyping(false);
        
        // Add AI response to chat
        setMessages(prev => [...prev, {
            type: "ai",
            content: response,
            mcpMode: MCPEnabled
        }]);

        setIsLoading(false);
    };

    // Generate response based on user input and MCP status
    const generateResponse = async (userMessage) => {
        const emailRequest = parseEmailRequest(userMessage);
        
        if (!emailRequest) {
            if (MCPEnabled && MCPStatus === "connected") {
                return "I can help you draft emails with personalized context from your Outlook and local files! Try asking \"draft me an email for [person's name]\". With MCP enabled, I'll analyze your communication history for tone, style, and context.";
            } else {
                return "I can help you draft emails! Try asking \"draft me an email for [person's name]\". I'll use AI to generate a professional email draft.";
            }
        }

        if (MCPEnabled && MCPStatus === "connected") {
            // Use enhanced MCP backend with full context analysis
            const emailResult = await generateEmailWithEnhancedMCP(emailRequest.recipient, emailRequest.originalMessage);

            if (emailResult.error) {
                return `Error connecting to MCP server: ${emailResult.error}. Please ensure the MCP server is running on port 3001.`;
            }

            let response = `**📧 Enhanced MCP Analysis for ${emailRequest.recipient}:**\n\n`;
            
            // Display detailed analysis results
            if (emailResult.analysisDetails) {
                const details = emailResult.analysisDetails;
                response += `**📊 Analysis Summary:**\n`;
                response += `• Data Source: ${details.searchSource || "Unknown"}\n`;
                response += `• Emails Analyzed: ${details.totalEmails || 0}\n`;
                response += `• AI Enhanced: ${details.aiEnhanced ? "✅ Yes" : "❌ No"}\n\n`;
            }
            
            if (emailResult.context) {
                if (emailResult.context.dataSource === "none" || emailResult.context.dataSource === "mock") {
                    response += `⚠️ **Using Mock Data** (No communication history found for ${emailRequest.recipient})\n\n`;
                } else {
                    response += `✅ **Real Communication Analysis** (${emailResult.context.dataSource === "outlook" ? "Outlook emails" : "File system data"})\n\n`;
                }
                
                response += `**🎯 Communication Profile:**\n`;
                response += `• Relationship: ${emailResult.context.relationship || "Unknown"}\n`;
                response += `• Communication Style: ${emailResult.context.communicationStyle || "Unknown"}\n`;
                
                if (emailResult.context.tone) {
                    response += `• Tone: ${emailResult.context.tone}\n`;
                }
                
                if (emailResult.context.formality) {
                    response += `• Formality Level: ${emailResult.context.formality}\n`;
                }
                
                if (emailResult.context.communicationFrequency) {
                    response += `• Communication Frequency: ${emailResult.context.communicationFrequency}\n`;
                }
                
                response += `• Common Topics: ${emailResult.context.commonTopics?.join(", ") || "None identified"}\n`;
                response += `• Last Interaction: ${emailResult.context.lastInteractionDate || "Unknown"}\n`;

                if (emailResult.context.recentContext) {
                    response += `• Recent Context: ${emailResult.context.recentContext}\n`;
                }
                
                // Display AI-enhanced insights if available
                if (emailResult.context.aiEnhanced) {
                    response += `\n**🤖 AI-Enhanced Insights:**\n`;
                    if (emailResult.context.toneRecommendation) {
                        response += `• Tone Match: ${emailResult.context.toneRecommendation}\n`;
                    }
                    if (emailResult.context.relationshipInsights) {
                        response += `• Relationship: ${emailResult.context.relationshipInsights}\n`;
                    }
                    if (emailResult.context.keyThemes) {
                        response += `• Key Themes: ${emailResult.context.keyThemes.join(", ")}\n`;
                    }
                }
                
                response += `\n`;
            }

            response += `**📝 Personalized Email Draft:**\n\n${emailResult.emailDraft}`;
            
            if (emailResult.aiGenerated) {
                response += `\n\n*Generated using ${emailResult.aiModel} with personalized context*`;
            } else {
                response += `\n\n*Generated using enhanced templates with context*`;
            }
            
            return response;
        } else {
            // MCP disabled - use direct AI generation without context
            const aiEmailResult = await generateEmailWithoutMCP(emailRequest.recipient, emailRequest.originalMessage);
            
            if (aiEmailResult.error) {
                // Fallback to basic template if AI fails
                const recipient = emailRequest.recipient;
                const name = recipient.charAt(0).toUpperCase() + recipient.slice(1);
                
                return `**❌ AI Generation Failed** - Using Basic Template\n\n**📝 Email Draft:**\n\nSubject: Hello ${name}\n\nHi ${name},\n\nI hope you're doing well. I wanted to reach out regarding [topic/reason for email].\n\n[Your main message here]\n\nPlease let me know if you have any questions.\n\nBest regards,\n[Your name]\n\n*Note: AI generation failed (${aiEmailResult.error}). Enable MCP server for personalized context.*`;
            }

            return `**🤖 AI-Generated Email (No Context):**\n\n${aiEmailResult.emailDraft}\n\n*Note: Enable MCP for personalized context based on your communication history*`;
        }
    };

    // Generate email using enhanced MCP backend with full context
    const generateEmailWithEnhancedMCP = async (recipient, originalMessage) => {
        try {
            const response = await fetch("http://localhost:3001/api/email/draft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                    recipient, 
                    mcpEnabled: true,
                    useAI: true,
                    customMessage: originalMessage
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Enhanced email generation failed:", error);
            return { error: error.message };
        }
    };

    // Generate email without MCP context using AI only
    const generateEmailWithoutMCP = async (recipient, originalMessage) => {
        try {
            const response = await fetch("/api/email/draft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                    recipient, 
                    mcpEnabled: false,
                    useAI: true
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            // Transform result to match expected format
            return {
                emailDraft: result.emailDraft,
                aiGenerated: result.aiGenerated,
                error: result.error
            };

        } catch (error) {
            console.error("AI email generation failed:", error);
            return { error: error.message };
        }
    };
   
    // Execute MCP tool with error handling
    const callMCPTool = async (tool, args) => {
        try {
            const response = await fetch("http://localhost:3001/api/mcp/execute", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ tool, args }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("MCP tool call failed:", error);
            return { success: false, error: error.message };
        }
    };

    // Legacy MCP email generation function
    const generateEmailWithMCP = async (recipient) => {
        try {
            const response = await fetch("http://localhost:3001/api/email/draft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ recipient, MCPEnabled }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Email generation failed:", error);
            return { error: error.message };
        }
    };

    // Test all MCP tools and display comprehensive results
    const testMCPTools = async () => {
        setIsLoading(true);
        setIsTyping(true);
        
        const tests = [
            { tool: "get_system_info", args: {} },
            { tool: "list_directory", args: { path: "." } },
            { tool: "search_outlook_emails", args: { contactName: "test" } },
            { tool: "search_files_advanced", args: { query: "email", fileTypes: [".eml", ".msg", ".txt"] } }
        ];

        let testResults = "**🧪 Enhanced MCP Tools Test Results:**\n\n";

        for (const test of tests) {
            const result = await callMCPTool(test.tool, test.args);
            testResults += `**${test.tool}:** ${result.success ? "✅ Success" : "❌ Failed"}\n`;
            
            if (result.success) {
                if (test.tool === "get_system_info") {
                    testResults += `  • Platform: ${result.systemInfo.platform}\n`;
                    testResults += `  • Home Directory: ${result.systemInfo.homeDirectory}\n`;
                    testResults += `  • Search Locations: ${result.systemInfo.searchLocations?.length || 0}\n`;
                } else if (test.tool === "list_directory") {
                    testResults += `  • Found ${result.contents?.length || 0} items\n`;
                } else if (test.tool === "search_outlook_emails") {
                    if (result.emails && result.emails.length > 0) {
                        testResults += `  • Found ${result.emails.length} emails\n`;
                        testResults += `  • Source: ${result.source}\n`;
                    } else {
                        testResults += `  • No emails found (this is normal for test contact)\n`;
                        testResults += `  • Outlook integration: ${result.source ? "Available" : "Not available"}\n`;
                    }
                } else if (test.tool === "search_files_advanced") {
                    testResults += `  • Found ${result.totalResults || 0} matching files\n`;
                    testResults += `  • Searched ${result.searchLocations?.length || 0} locations\n`;
                }
            } else {
                testResults += `  • Error: ${result.error}\n`;
            }
            testResults += "\n";
        }

        // Test actual email generation functionality
        testResults += "**📧 Testing Email Generation:**\n";
        const emailTest = await generateEmailWithEnhancedMCP("sarah", "test email generation");
        
        if (emailTest.error) {
            testResults += `❌ Email generation failed: ${emailTest.error}\n`;
        } else {
            testResults += `✅ Email generation successful\n`;
            testResults += `  • Context analysis: ${emailTest.context ? "Complete" : "Failed"}\n`;
            testResults += `  • AI enhanced: ${emailTest.context?.aiEnhanced ? "Yes" : "No"}\n`;
            testResults += `  • Data source: ${emailTest.context?.dataSource || "Unknown"}\n`;
        }

        setIsTyping(false);

        setMessages(prev => [...prev, {
            type: "ai",
            content: testResults,
            mcpMode: true
        }]);
        
        setIsLoading(false);
    };

    // Parse user message to extract email request details
    const parseEmailRequest = (message) => {
        const emailPatterns = [
            /draft.*email.*for\s+(\w+)/i,
            /write.*email.*to\s+(\w+)/i,
            /email.*(\w+).*about/i,
            /respond.*to\s+(\w+)/i,
            /send.*email.*to\s+(\w+)/i,
            /compose.*email.*for\s+(\w+)/i,
            /create.*email.*to\s+(\w+)/i,
            /help.*me.*email\s+(\w+)/i
        ];

        for (const pattern of emailPatterns) {
            const match = message.match(pattern);
            if (match) {
                return {
                    recipient: match[1].toLowerCase(),
                    originalMessage: message
                };
            }
        }
        return null;
    };

    return (
        <>
            <Head>
                <title> MCP Chatbot </title>
                <meta name = "description" content = "MCP Chatbot Testing" />
                <meta name = "viewport" content = "width=device-width, initial-scale=1" />
            </Head>
            
            <div className = "min-h-screen bg-blue-200 flex items-center justify-center p-5">
                <div className = "bg-white rounded-3xl shadow-2xl w-full max-w-4xl h-[600px] flex flex-col overflow-hidden">
                    <div className = "bg-blue-300 text-gray-600 p-6 text-center items-center">
                        <h1 className = "text-3xl font-semibold mb-2"> MCP AI Chatbot Tester </h1>

                        <div className = "mb-4">
                            <span className = {`text-xs ${getStatusColor()}`}>
                                ● {getStatusText()}
                            </span>
                            <button
                                oncClick = {checkMCPConnection}
                                className = "ml-2 text-xs bg-white bg-opacity-20 px-2 py-1 rounded hover:bg-opacity-30 transition-colors"
                            >
                                Refresh
                            </button>
                        </div>

                        <div className = "bg-white bg-opacity-20 rounded-2xl p-4 flex items-center justify-between mb-2">
                            <span className = "font-medium text-sm">
                                MCP: {MCPEnabled ? "Enabled" : "Disabled"}
                            </span>
                            <button
                                oncClick = {() => setMCPEnabled(!MCPEnabled)}
                                disabled = {MCPStatus !== "connected"}
                                className = {`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 ${
                                    MCPEnabled ? "bg-green-500" : "bg-white bg-opacity-30"
                                } ${MCPStatus !== "connected" ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                                <div
                                    className = {`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${
                                        MCPEnabled ? "transform translate-x-6" : "transform translate-x-0.5"
                                    }`}
                                />
                            </button>
                        </div>

                        {MCPStatus === "connected" && (
                            <button
                                oncClick = {testMCPTools}
                                disabled = {isLoading}
                                className = "bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                Test MCP Tools
                            </button>
                        )} 
                    </div>

                    <div className = "flex-1 p-6 overflow-y-auto space-y-4">
                        {messages.map((message, index) => (
                            <div
                                key = {index}
                                className = {`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className = {`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                                        message.type === "user"
                                        ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white"
                                        : "bg-gray-100 text-gray-800"
                                    }`}
                                >
                                    {message.type === "ai" && (
                                        <div className = "mb-2">
                                            <span
                                                className = {`inline-block px-2 py-1 text-xs font-medium rounded-lg ${
                                                message.mcpMode && MCPStatus === "connected"
                                                    ? "bg-green-500 text-white"
                                                    : message.mcpMode && MCPStatus !== "connected"
                                                    ? "bg-orange-500 text-white"
                                                    : "bg-gray-500 text-white"
                                                }`}
                                            >
                                                {message.mcpMode 
                                                    ? MCPStatus === "connected" 
                                                        ? "MCP Enabled" 
                                                        : "MCP Offline"
                                                    : "Standard Mode"
                                                }
                                            </span>
                                        </div>
                                    )}
                                    <div className = "text-sm leading-relaxed whitespace-pre-wrap">
                                        {message.content}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {isTyping && (
                            <div className = "flex justify-start">
                                <div className = "bg-gray-100 px-4 py-3 rounded-2xl max-w-xs">
                                    <div className = "flex space-x-1">
                                        <div className = "w-2 h-2 bg-gray-400 rounded-full animate-bounce" style = {{ animationDelay: "0ms" }} />
                                        <div className = "w-2 h-2 bg-gray-400 rounded-full animate-bounce" style = {{ animationDelay: "150ms" }} />
                                        <div className = "w-2 h-2 bg-gray-400 rounded-full animate-bounce" style = {{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref = {messagesEndRef} />
                    </div>

                    <div className = "p-6 border-t border-gray-200">
                        <div className = "flex space-x-3">
                            <input
                                type = "text"
                                value = {inputValue}
                                onChange = {(e) => setInputValue(e.target.value)}
                                onKeyPress = {handleKeyPress}
                                placeholder = "Ask me to draft an email..."
                                disabled = {isLoading}
                                className = "flex-1 px-4 py-3 border-2 border-gray-200 rounded-2xl focus:border-indigo-500 focus:outline-none transition-colors duration-200 disabled:opacity-50"
                            />
                            <button
                                oncClick = {handleSendMessage}
                                disabled = {isLoading || !inputValue.trim()}
                                className = "bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-3 rounded-2xl font-medium hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none disabled:hover:shadow-none"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};