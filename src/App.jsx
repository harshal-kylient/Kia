import React, { useState, useEffect, useRef } from 'react';

// --- IMPORTANT: ADD YOUR OPENROUTER API KEY HERE ---
// You can get a key from https://openrouter.ai/keys
const OPENROUTER_API_KEY = "YOUR_OPENROUTER_API_KEY";

// Main App Component
const App = () => {
  // State variables to manage messages, input, loading status, errors, and suggestions
  const [messages, setMessages] = useState([
    { role: 'ai', content: "Hi! I'm Aiko. I'm now powered by OpenRouter! How can I help you today? 💋" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestedReplies, setSuggestedReplies] = useState([]);
  // --- State for Image Handling ---
  const [imageFile, setImageFile] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);


  // Ref for the end of the messages container to enable auto-scrolling
  const messagesEndRef = useRef(null);
  // --- Ref for the hidden file input ---
  const fileInputRef = useRef(null);


  // Function to scroll to the latest message smoothly
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // useEffect hook to scroll to the bottom whenever the messages state updates
  useEffect(() => {
    scrollToBottom();
  }, [messages, suggestedReplies]);

  // --- Function to handle file selection and conversion to Base64 ---
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            setError("Please select an image file.");
            return;
        }
        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setImageBase64(reader.result);
        };
        reader.readAsDataURL(file);
    }
  };
  
  // --- Function to clear the selected image ---
  const clearImage = () => {
      setImageFile(null);
      setImageBase64(null);
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
  }

  // --- Function to get suggested replies from OpenRouter ---
  const getSuggestions = async (lastMessage) => {
      if (messages[messages.length-1]?.image) return;
      try {
        const prompt = `Based on this message from a chatbot named Aiko: "${lastMessage}", suggest three short, distinct, and relevant replies for the user. IMPORTANT: Respond ONLY with a valid JSON array of strings and nothing else. Example: ["That's interesting!", "Tell me more.", "Can you explain that?"]`;

        const payload = {
            model: "google/gemini-flash-1.5", // Or any other model you prefer on OpenRouter
            messages: [{ role: "user", content: prompt }]
        };

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) return; // Don't block user on suggestion failure
        const result = await response.json();
        const suggestionsText = result?.choices?.[0]?.message?.content;
        
        if (suggestionsText) {
            // Try to parse the model's response as JSON
            const parsedSuggestions = JSON.parse(suggestionsText);
            setSuggestedReplies(parsedSuggestions);
        }
      } catch (err) {
          console.error("Error fetching or parsing suggestions:", err);
      }
  };

  // --- Core Function to Send Message and Get AI Response from OpenRouter ---
  const sendMessage = async (messageText) => {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage && !imageFile) return;

    const newUserMessage = { 
        role: 'user', 
        content: trimmedMessage,
        image: imageBase64 
    };
    const newMessages = [...messages, newUserMessage];
    
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError(null);
    setSuggestedReplies([]);
    
    try {
        // Build the message history for the API call
        const apiMessages = newMessages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: msg.content
            }));
            
        // Note: OpenRouter's standard API doesn't support images in the same way as the direct Gemini API.
        // This example will send the text part of the message.
        // For multimodal support, you'd need to use a model that accepts base64 images, like LLaVA.
        if (imageFile) {
            apiMessages[apiMessages.length - 1].content = `[Image is present] ${apiMessages[apiMessages.length - 1].content}`;
        }

        const payload = {
            model: "google/gemini-flash-1.5", // Or any other model you prefer
            messages: apiMessages
        };

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.json();
            throw new Error(errBody.error?.message || `API request failed with status ${response.status}`);
        }

        const result = await response.json();
        const aiResponse = result?.choices?.[0]?.message?.content;
        
        if (aiResponse) {
            setMessages(prev => [...prev, { role: 'ai', content: aiResponse }]);
            await getSuggestions(aiResponse);
        } else {
            throw new Error("Received an invalid response from the AI.");
        }

    } catch (err) {
        console.error("Error sending message:", err);
        setError(err.message || "Sorry, something went wrong. Please try again.");
    } finally {
        setLoading(false);
        clearImage();
    }
  };
  
  // --- Function to Summarize the Conversation with OpenRouter ---
  const summarizeConversation = async () => {
      setLoading(true);
      setError(null);
      setSuggestedReplies([]);
      
      const conversationText = messages.map(msg => `${msg.role === 'ai' ? 'Aiko' : 'User'}: ${msg.content}`).join('\n');
      const prompt = `Please provide a concise, one-paragraph summary of the following conversation:\n\n${conversationText}`;

      try {
          const payload = {
              model: "google/gemini-flash-1.5",
              messages: [{ role: "user", content: prompt }]
          };
          
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${OPENROUTER_API_KEY}`
              },
              body: JSON.stringify(payload)
          });

          if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
          const result = await response.json();
          const summary = result?.choices?.[0]?.message?.content;

          if (summary) {
              setMessages(prev => [...prev, { role: 'system', content: summary }]);
          } else {
              throw new Error("Failed to generate summary.");
          }
      } catch (err) {
          console.error("Error summarizing conversation:", err);
          setError("Sorry, I couldn't create a summary.");
      } finally {
          setLoading(false);
      }
  };

  // --- UI Rendering ---
  return (
    <div className="font-sans bg-gray-50 flex flex-col h-screen">
       <div className="flex-grow flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col h-[90vh]">
                {/* Chat Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-4">
                    <h1 className="text-xl md:text-2xl font-bold text-gray-800">Aiko AI Chatbot 💋</h1>
                    <button 
                        onClick={summarizeConversation}
                        disabled={loading || messages.length <= 2}
                        className="text-sm bg-purple-100 text-purple-700 font-semibold px-3 py-2 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Summarize ✨
                    </button>
                </div>

                {/* Messages Area */}
                <div className="flex-grow p-6 overflow-y-auto">
                    {messages.map((msg, i) => {
                        if (msg.role === 'system') {
                            return (
                                <div key={i} className="my-4 p-3 bg-yellow-100 border-l-4 border-yellow-400 text-yellow-800 rounded-r-lg">
                                    <h3 className="font-bold text-sm mb-1">Conversation Summary</h3>
                                    <p className="text-sm italic">{msg.content}</p>
                                </div>
                            );
                        }
                        return (
                            <div key={i} className={`flex items-start gap-3 my-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                               {msg.role === 'ai' && <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">A</div>}
                               <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-pink-500 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                                   {/* --- ✨ Display Image if it exists --- */}
                                   {msg.image && <img src={msg.image} alt="User upload" className="rounded-lg mb-2 max-h-60"/>}
                                   {msg.content && <p>{msg.content}</p>}
                               </div>
                               {msg.role === 'user' && <div className="w-10 h-10 rounded-full bg-pink-300 flex items-center justify-center text-white font-bold flex-shrink-0">You</div>}
                            </div>
                        );
                    })}
                    {/* Typing Indicator */}
                    {loading && (
                        <div className="flex items-start gap-3 my-4 justify-start">
                             <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">A</div>
                             <div className="max-w-xs px-4 py-3 rounded-2xl bg-gray-100 text-gray-800 rounded-bl-none">
                                <div className="flex items-center justify-center space-x-1">
                                    <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce delay-0"></span>
                                    <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce delay-150"></span>
                                    <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce delay-300"></span>
                                </div>
                             </div>
                        </div>
                    )}
                    {/* Suggested Replies */}
                    {suggestedReplies.length > 0 && !loading && (
                        <div className="flex justify-start gap-2 mt-2 ml-12 flex-wrap">
                            {suggestedReplies.map((reply, i) => (
                                <button key={i} onClick={() => sendMessage(reply)} className="text-sm border border-purple-300 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-100 transition-all">
                                    {reply}
                                </button>
                            ))}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-gray-200">
                    {error && <p className="text-red-500 text-sm mb-2 text-center">{error}</p>}
                    {/* --- Image Preview --- */}
                    {imageBase64 && (
                        <div className="mb-2 p-2 border rounded-lg relative bg-gray-100">
                            <img src={imageBase64} alt="Preview" className="max-h-24 rounded-md"/>
                            <button onClick={clearImage} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">&times;</button>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                         {/* --- Hidden File Input --- */}
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                        {/* --- Paperclip Button --- */}
                        <button 
                            onClick={() => fileInputRef.current.click()}
                            disabled={loading}
                            className="p-3 border border-gray-300 rounded-xl hover:bg-gray-100 transition"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        </button>
                        <input
                            className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 transition"
                            placeholder={imageFile ? "Add a caption..." : "Talk to Aiko..."}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !loading && sendMessage(input)}
                            disabled={loading}
                        />
                        <button 
                            className="bg-pink-500 text-white px-6 py-3 rounded-xl hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2 disabled:bg-pink-300 disabled:cursor-not-allowed transition-transform transform active:scale-95" 
                            onClick={() => sendMessage(input)}
                            disabled={loading}
                        >
                            Send
                        </button>
                    </div>
                </div>
            </div>
       </div>
    </div>
  );
}

export default App;