#!/usr/bin/env python3
"""
Interactive terminal chat with Aspen 4B via llama-server
"""
import requests
import json
import sys

SERVER_URL = "http://localhost:8080/completion"

def chat_with_aspen():
    print("🌲 Aspen 4B Terminal Chat")
    print("========================")
    print("Type 'quit', 'exit', or Ctrl+C to end")
    print("Server running on http://localhost:8080")
    print()
    
    conversation_history = []
    
    while True:
        try:
            # Get user input
            user_input = input("You: ").strip()
            
            if user_input.lower() in ['quit', 'exit', 'bye']:
                print("Goodbye! 👋")
                break
                
            if not user_input:
                continue
            
            # Build conversation context
            conversation_context = ""
            for msg in conversation_history[-4:]:  # Keep last 4 exchanges
                conversation_context += msg
            
            # Format prompt
            prompt = f"{conversation_context}<|im_start|>user\n{user_input}<|im_end|>\n<|im_start|>assistant\n"
            
            # Prepare request
            payload = {
                "prompt": prompt,
                "n_predict": 200,
                "temperature": 0.7,
                "top_p": 0.9,
                "repeat_penalty": 1.1,
                "stop": ["<|im_end|>", "<|endoftext|>"]
            }
            
            print("Aspen: ", end="", flush=True)
            
            # Make request
            try:
                response = requests.post(SERVER_URL, json=payload, timeout=60)
                response.raise_for_status()
                
                result = response.json()
                content = result.get('content', '').strip()
                
                if content:
                    print(content)
                    
                    # Add to conversation history
                    conversation_history.append(f"<|im_start|>user\n{user_input}<|im_end|>\n")
                    conversation_history.append(f"<|im_start|>assistant\n{content}<|im_end|>\n")
                else:
                    print("(No response generated)")
                    
            except requests.exceptions.Timeout:
                print("(Request timed out - Aspen is thinking too hard!)")
            except requests.exceptions.RequestException as e:
                print(f"(Connection error: {e})")
            except json.JSONDecodeError:
                print("(Invalid response from server)")
                
            print()
            
        except KeyboardInterrupt:
            print("\n\nGoodbye! 👋")
            break
        except Exception as e:
            print(f"\nError: {e}")
            break

if __name__ == "__main__":
    try:
        # Test server connection first
        response = requests.get("http://localhost:8080/health", timeout=5)
        print("✅ Aspen 4B server is running!")
    except:
        print("❌ Error: llama-server not running on port 8080")
        print("Start it with: ./llama.cpp/build/bin/llama-server --model aspen-4b.gguf --host 127.0.0.1 --port 8080 -ngl 0 --ctx-size 2048 --threads 6")
        sys.exit(1)
    
    chat_with_aspen()


