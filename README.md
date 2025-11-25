<div align="center">

# Auto-McGraw (Smartbook)

<img src="assets/icon.png" alt="Auto-McGraw Logo" width="200">

[![Release](https://img.shields.io/github/v/release/GooglyBlox/auto-mcgraw?include_prereleases&style=flat-square&cache=1)](https://github.com/GooglyBlox/auto-mcgraw/releases)
[![License](https://img.shields.io/github/license/GooglyBlox/auto-mcgraw?style=flat-square&cache=1)](LICENSE)
[![Issues](https://img.shields.io/github/issues/GooglyBlox/auto-mcgraw?style=flat-square&cache=1)](https://github.com/GooglyBlox/auto-mcgraw/issues)

*Automate your McGraw Hill Smartbook homework with Gemini AI integration*

[Installation](#installation) • [Setup](#setup) • [Usage](#usage) • [Troubleshooting](#troubleshooting) • [Issues](#issues)

</div>

---

## Compatibility Notice

**⚠️ MacOS Users:** This extension may not work properly on MacOS due to platform-specific differences in Chrome extension behavior and system interactions. For the best experience, we recommend using this extension on Windows or Linux systems.

---

## Installation

1. Download the latest zip from the [releases page](https://github.com/GooglyBlox/auto-mcgraw/releases)
2. Extract the zip file to a folder
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the extracted folder

## Setup

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

### Configuring the Extension

1. Click the Auto-McGraw extension icon in your browser toolbar
2. Paste your Gemini API key in the input field
3. Click "Save API Key"
4. Click "Test Connection" to verify your API key works
5. You're ready to go! 🎉

## Usage

1. Log into your McGraw Hill account and open a Smartbook assignment
2. Click the "Ask Gemini" button that appears in your Smartbook header
3. Click "OK" when prompted to begin automation
4. Watch as the extension:
   - Sends questions directly to Gemini AI via API
   - Processes the responses
   - Automatically fills in answers
   - Handles multiple choice, true/false, and fill-in-the-blank questions
      - **Note about matching questions:** Due to technical limitations, matching questions cannot be automated. When encountering a matching question, the extension will show you AI-suggested matches in an alert. You'll need to manually drag and drop the matches, then the extension will continue with automation.
   - Navigates through forced learning sections when needed

Click "Stop Automation" at any time to pause the process.

## Settings

Click the settings icon ( ⚙️ ) next to the main button to access the settings menu, where you can:

- Enter and save your Gemini API key
- Test your API connection
- Get help with obtaining an API key
- Check for extension updates

## Troubleshooting

### "No Gemini API key configured"
Make sure you've entered your API key in the settings and clicked "Save API Key".

### "Invalid API key"
- Verify your API key is correct
- Make sure you copied the entire key without extra spaces
- Try generating a new API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### "API rate limit exceeded"
- Gemini's free tier has rate limits
- Wait a few moments before trying again
- Consider upgrading to a paid plan for higher limits

### "Network error"
- Check your internet connection
- Make sure you're not behind a firewall blocking API requests
- Try disabling any VPN or proxy

## What's New in v2.0

- ✨ **Direct API Integration:** No need to open Gemini in a separate tab!
- 🚀 **Faster Responses:** Direct API calls are much faster and more reliable
- 🔧 **Simplified Setup:** Just enter your API key and you're ready to go
- 🎯 **Gemini-Only:** Focused on providing the best experience with Google's Gemini AI

## Disclaimer

This tool is for educational purposes only. Use it responsibly and be aware of your institution's academic integrity policies.

## Issues

Found a bug? [Create an issue](https://github.com/GooglyBlox/auto-mcgraw/issues).
