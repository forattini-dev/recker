# Playground

Test Recker right here in your browser! See how CLI arguments are parsed, what gets sent to the server, and analyze the response.

<div id="playground-container" style="border: 1px solid var(--border-color); border-radius: 12px; background: rgba(0,0,0,0.05); overflow: hidden;">

  <!-- Tabs -->
  <div style="background: rgba(0,0,0,0.15); padding: 0; display: flex; gap: 0; border-bottom: 1px solid var(--border-color);">
    <button onclick="window.switchMode('terminal')" id="btn-terminal" class="tab-btn active" style="font-weight: 600; border: none; background: rgba(255, 138, 0, 0.15); color: #ff8a00; cursor: pointer; padding: 12px 24px; border-bottom: 2px solid #ff8a00; transition: all 0.2s;">HTTP Client</button>
    <button onclick="window.switchMode('seo')" id="btn-seo" class="tab-btn" style="font-weight: 600; border: none; background: none; color: var(--text-color); cursor: pointer; padding: 12px 24px; opacity: 0.7; transition: all 0.2s;">SEO Analyzer</button>
    <button onclick="window.switchMode('chat')" id="btn-chat" class="tab-btn" style="font-weight: 600; border: none; background: none; color: var(--text-color); cursor: pointer; padding: 12px 24px; opacity: 0.7; transition: all 0.2s;">AI Chat</button>
  </div>

  <!-- HTTP Client Mode -->
  <div id="mode-terminal" style="padding: 20px;">

    <!-- CLI Input -->
    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
      <span style="padding: 10px 12px; font-family: 'JetBrains Mono', monospace; color: #ff8a00; font-weight: bold; background: rgba(255, 138, 0, 0.1); border-radius: 6px; user-select: none;">$ rek</span>
      <input type="text" id="cli-input" value="+chrome post https://httpbin.org/post name=John age:=30 X-Custom:header" style="flex: 1; padding: 10px 12px; border-radius: 6px; background: var(--code-background-color); color: var(--text-color); border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 14px;" placeholder="+preset method url Header:Value key=string num:=123" onkeydown="if(event.key === 'Enter') window.runTerminal()">
      <button onclick="window.runTerminal()" style="padding: 10px 20px; background: linear-gradient(135deg, #ff8a00, #ff6b00); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: transform 0.1s; display: flex; align-items: center; gap: 6px;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
        <span>Run</span>
        <span style="font-size: 16px;">⚡</span>
      </button>
    </div>

    <!-- Syntax Help -->
    <details style="margin-bottom: 15px; font-size: 13px;">
      <summary style="cursor: pointer; color: var(--text-color); opacity: 0.7; padding: 5px 0;">
        📖 CLI Syntax Reference
      </summary>
      <div style="background: var(--code-background-color); padding: 15px; border-radius: 6px; margin-top: 10px; border: 1px solid var(--border-color);">
        <table style="width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 12px;">
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px; color: #ff8a00; width: 40%;">+chrome, +mobile, +retry</td>
            <td style="padding: 8px; opacity: 0.8;">Presets (User-Agent, retry config, etc.)</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px; color: #4ade80;">GET POST PUT DELETE</td>
            <td style="padding: 8px; opacity: 0.8;">HTTP Method (defaults to GET)</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px; color: #60a5fa;">Header:Value</td>
            <td style="padding: 8px; opacity: 0.8;">Set HTTP header</td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px; color: #c084fc;">key=string</td>
            <td style="padding: 8px; opacity: 0.8;">String body parameter</td>
          </tr>
          <tr>
            <td style="padding: 8px; color: #f472b6;">key:=123 or key:=true</td>
            <td style="padding: 8px; opacity: 0.8;">Typed parameter (number, boolean)</td>
          </tr>
        </table>
      </div>
    </details>

    <!-- Options Row -->
    <div style="margin-bottom: 15px; display: flex; gap: 20px; flex-wrap: wrap; padding: 10px 15px; background: rgba(0,0,0,0.1); border-radius: 6px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-color); font-size: 13px;">
        <input type="checkbox" id="useProxy" checked style="accent-color: #ff8a00;">
        <span>CORS Proxy</span>
      </label>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-color); font-size: 13px;">
        <input type="checkbox" id="recordHar" style="accent-color: #ff8a00;">
        <span>Record HAR</span>
      </label>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-color); font-size: 13px;">
        <input type="checkbox" id="simulateSlow" style="accent-color: #ff8a00;">
        <span>Simulate Slow (1s)</span>
      </label>

      <!-- File Upload -->
      <div id="drop-zone" onclick="document.getElementById('file-input').click()" style="margin-left: auto; padding: 6px 12px; border: 1px dashed var(--border-color); border-radius: 4px; cursor: pointer; color: var(--text-color); opacity: 0.7; font-size: 13px; transition: all 0.2s;">
        📂 Upload file
        <input type="file" id="file-input" style="display: none" onchange="window.handleFileSelect(this.files)">
      </div>
    </div>

    <!-- Results Container -->
    <div id="results-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">

      <!-- Left: CLI Parsed + Request -->
      <div style="display: flex; flex-direction: column; gap: 15px;">

        <!-- CLI Parsed Section -->
        <div style="background: var(--code-background-color); border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden;">
          <div style="background: rgba(255, 138, 0, 0.1); padding: 8px 12px; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #ff8a00; border-bottom: 1px solid var(--border-color);">
            1. CLI Parsed Arguments
          </div>
          <div id="cli-parsed" style="padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; min-height: 100px;">
            <div style="color: var(--text-color); opacity: 0.5;">Run a command to see parsed arguments...</div>
          </div>
        </div>

        <!-- Request Section -->
        <div style="background: var(--code-background-color); border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden;">
          <div style="background: rgba(96, 165, 250, 0.1); padding: 8px 12px; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #60a5fa; border-bottom: 1px solid var(--border-color);">
            2. HTTP Request Sent
          </div>
          <div id="request-details" style="padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; min-height: 100px;">
            <div style="color: var(--text-color); opacity: 0.5;">Waiting for request...</div>
          </div>
        </div>

      </div>

      <!-- Right: Response -->
      <div style="background: var(--code-background-color); border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden; display: flex; flex-direction: column;">
        <div style="background: rgba(74, 222, 128, 0.1); padding: 8px 12px; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #4ade80; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <span>3. Response</span>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div id="response-view-toggle" style="display: none; gap: 4px;">
              <button onclick="window.showResponseView('raw')" id="btn-raw" style="padding: 2px 8px; font-size: 10px; border: 1px solid var(--border-color); background: rgba(74, 222, 128, 0.2); color: #4ade80; border-radius: 3px; cursor: pointer;">Raw</button>
              <button onclick="window.showResponseView('preview')" id="btn-preview" style="padding: 2px 8px; font-size: 10px; border: 1px solid var(--border-color); background: transparent; color: var(--text-color); border-radius: 3px; cursor: pointer; opacity: 0.7;">Preview</button>
            </div>
            <span id="response-status" style="font-size: 11px; opacity: 0.7;"></span>
          </div>
        </div>

        <!-- Timings Bar -->
        <div id="timings-bar" style="padding: 8px 12px; background: rgba(0,0,0,0.1); border-bottom: 1px solid var(--border-color); display: none;">
          <div style="display: flex; gap: 2px; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 6px;" id="timing-visual"></div>
          <div id="timing-labels" style="display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; opacity: 0.8;"></div>
        </div>

        <pre id="response-body" style="padding: 12px; margin: 0; overflow: auto; flex: 1; max-height: 350px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--code-text-color);">Waiting for response...</pre>
        <iframe id="response-preview" style="display: none; border: none; flex: 1; max-height: 350px; background: white;" sandbox="allow-same-origin"></iframe>
      </div>

    </div>
  </div>

  <!-- SEO Analyzer Mode -->
  <div id="mode-seo" style="display: none; padding: 20px;">

    <!-- SEO Input -->
    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
      <input type="text" id="seo-url" value="https://httpbin.org" style="flex: 1; padding: 10px 12px; border-radius: 6px; background: var(--code-background-color); color: var(--text-color); border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 14px;" placeholder="Enter URL to analyze..." onkeydown="if(event.key === 'Enter') window.runSeoAnalysis()">
      <button onclick="window.runSeoAnalysis()" style="padding: 10px 20px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: transform 0.1s; display: flex; align-items: center; gap: 6px;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
        <span>Analyze</span>
        <span style="font-size: 16px;">🔍</span>
      </button>
    </div>

    <div style="margin-bottom: 15px; display: flex; gap: 15px; flex-wrap: wrap; padding: 10px 15px; background: rgba(0,0,0,0.1); border-radius: 6px;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-color); font-size: 13px;">
        <input type="checkbox" id="seo-proxy" checked style="accent-color: #10b981;">
        <span>CORS Proxy</span>
      </label>
    </div>

    <!-- SEO Results -->
    <div id="seo-results" style="display: none;">

      <!-- Grade Card -->
      <div id="seo-grade-card" style="background: var(--code-background-color); border-radius: 12px; padding: 20px; margin-bottom: 15px; border: 1px solid var(--border-color); display: flex; align-items: center; gap: 20px;">
        <div id="seo-grade-badge" style="width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: bold; color: white;">-</div>
        <div style="flex: 1;">
          <div style="font-size: 24px; font-weight: 600; margin-bottom: 5px;">Score: <span id="seo-score">--</span>/100</div>
          <div id="seo-summary" style="opacity: 0.7; font-size: 14px;"></div>
        </div>
        <div id="seo-timing" style="text-align: right; opacity: 0.6; font-size: 12px;"></div>
      </div>

      <!-- Stats Grid -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
        <div class="seo-stat" style="background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 8px; padding: 12px; text-align: center;">
          <div id="seo-passed" style="font-size: 24px; font-weight: bold; color: #4ade80;">0</div>
          <div style="font-size: 11px; opacity: 0.7; text-transform: uppercase;">Passed</div>
        </div>
        <div class="seo-stat" style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; padding: 12px; text-align: center;">
          <div id="seo-warnings" style="font-size: 24px; font-weight: bold; color: #fbbf24;">0</div>
          <div style="font-size: 11px; opacity: 0.7; text-transform: uppercase;">Warnings</div>
        </div>
        <div class="seo-stat" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px; text-align: center;">
          <div id="seo-errors" style="font-size: 24px; font-weight: bold; color: #ef4444;">0</div>
          <div style="font-size: 11px; opacity: 0.7; text-transform: uppercase;">Errors</div>
        </div>
        <div class="seo-stat" style="background: rgba(96, 165, 250, 0.1); border: 1px solid rgba(96, 165, 250, 0.3); border-radius: 8px; padding: 12px; text-align: center;">
          <div id="seo-info" style="font-size: 24px; font-weight: bold; color: #60a5fa;">0</div>
          <div style="font-size: 11px; opacity: 0.7; text-transform: uppercase;">Info</div>
        </div>
      </div>

      <!-- Completeness Bars -->
      <div id="seo-completeness" style="background: var(--code-background-color); border-radius: 8px; padding: 15px; margin-bottom: 15px; border: 1px solid var(--border-color);">
        <div style="font-weight: 600; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Completeness</div>
        <div id="completeness-bars" style="display: grid; gap: 10px;"></div>
      </div>

      <!-- Keywords Cloud -->
      <div id="seo-keywords-section" style="background: var(--code-background-color); border-radius: 8px; padding: 15px; margin-bottom: 15px; border: 1px solid var(--border-color);">
        <div style="font-weight: 600; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Top Keywords</div>
        <div id="keywords-cloud" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
      </div>

      <!-- Issues List -->
      <div id="seo-issues-section" style="background: var(--code-background-color); border-radius: 8px; padding: 15px; border: 1px solid var(--border-color);">
        <div style="font-weight: 600; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Top Issues</div>
        <div id="seo-issues" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>

    </div>

    <!-- Loading / Initial State -->
    <div id="seo-placeholder" style="text-align: center; padding: 60px 20px; color: var(--text-color); opacity: 0.5;">
      <div style="font-size: 48px; margin-bottom: 15px;">🔍</div>
      <div>Enter a URL above to analyze its SEO</div>
    </div>

  </div>

  <!-- Chat Mode -->
  <div id="mode-chat" style="display: none; padding: 20px;">
    <div style="margin-bottom: 10px;">
      <input type="password" id="ai-key" style="width: 100%; padding: 10px 12px; border-radius: 6px; background: var(--code-background-color); color: var(--text-color); border: 1px solid var(--border-color); font-size: 14px;" placeholder="Enter OpenAI API Key (sk-...) to activate" onchange="window.saveKey()">
    </div>

    <div id="chat-history" style="height: 350px; overflow-y: auto; background: var(--code-background-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px;">
      <div style="color: #888; text-align: center; margin-top: 130px;">Enter your API key above and say hello!</div>
    </div>

    <div style="display: flex; gap: 10px;">
      <input type="text" id="chat-input" style="flex: 1; padding: 10px 12px; border-radius: 6px; background: var(--code-background-color); color: var(--text-color); border: 1px solid var(--border-color); font-size: 14px;" placeholder="Type a message..." onkeydown="if(event.key === 'Enter') window.sendChat()">
      <button onclick="window.sendChat()" style="padding: 10px 20px; background: linear-gradient(135deg, #ff8a00, #ff6b00); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Send</button>
    </div>
  </div>

</div>

## Quick Examples

Try these commands in the playground:

```bash
# Simple GET request
get https://httpbin.org/json

# POST with JSON data
post https://httpbin.org/post name="John Doe" age:=30 active:=true

# With custom headers
get https://httpbin.org/headers Authorization:"Bearer token123" X-Custom:"my-value"

# With browser preset
+chrome get https://httpbin.org/user-agent

# Multiple presets
+mobile +json get https://api.example.com/data
```

## Available Presets

| Preset | Description |
|--------|-------------|
| `+chrome` | Chrome browser User-Agent |
| `+mobile` | Mobile (iPhone) User-Agent |
| `+bot` | Googlebot User-Agent |
| `+curl` | cURL User-Agent |
| `+retry` | Enable retry with exponential backoff |
| `+json` | Accept: application/json |
| `+xml` | Accept: application/xml |

