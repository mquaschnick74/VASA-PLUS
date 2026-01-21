# iOS App Store Submission Checklist

## Before Opening Xcode

1. [ ] Add app icons to `ios-icons/` folder
2. [ ] Add splash screen image to `ios-splash/` folder
3. [ ] Run `npm run cap:build` to build and sync

## In Xcode (Manual Steps)

1. [ ] Open with: `npm run cap:open:ios`
2. [ ] Select "App" in the navigator, then "Signing & Capabilities"
3. [ ] Sign in with Apple Developer account
4. [ ] Select team and let Xcode manage signing
5. [ ] Set deployment target to iOS 14.0 or higher
6. [ ] Add app icons in Assets.xcassets
7. [ ] Add splash screen in Assets.xcassets

## App Store Connect (Manual Steps)

1. [ ] Create new app in App Store Connect (appstoreconnect.apple.com)
2. [ ] Bundle ID: ai.ivasa.app
3. [ ] Fill in app information:
   - App name: VASA-Plus
   - Subtitle: AI Therapeutic Voice Assistant
   - Category: Health & Fitness (Primary), Medical (Secondary)
   - Age Rating: 17+ (due to mental health content)

## Required App Store Content

### Description (prepare this):
```
VASA-Plus is an AI-powered therapeutic voice assistant that helps you understand your emotional patterns through conversation.

Features:
• Voice-based therapeutic conversations available 24/7
• Multiple AI therapeutic agents with different approaches
• Tracks emotional patterns over time
• Complements work with human therapists

IMPORTANT DISCLAIMERS:
• VASA-Plus is NOT a replacement for professional mental health care
• Not intended to diagnose, treat, or cure any mental health condition
• If you're in crisis, please contact emergency services or a crisis hotline
• Designed to supplement, not replace, work with licensed therapists
```

### Privacy Policy URL Required
- Must have a privacy policy hosted at a public URL
- Example: https://beta.ivasa.ai/privacy

### Support URL Required
- Example: https://beta.ivasa.ai/support

## App Review Notes (include with submission):

```
VASA-Plus is a therapeutic wellness companion, not a medical device.

Key points for review:
1. We do NOT claim to diagnose or treat mental health conditions
2. Crisis intervention protocols redirect users to emergency services
3. The app supplements work with human therapists
4. All AI interactions include clear disclaimers about limitations
5. This is a wellness/self-improvement tool in the Health & Fitness category

Test account credentials:
Email: [provide test account]
Password: [provide password]
```

## Potential Review Issues

Apple may ask about:
1. **Medical claims** - We make none; this is wellness, not medical
2. **Crisis protocols** - We have them; explain in review notes
3. **Data privacy** - Explain voice data handling
4. **Professional oversight** - Mention LPCC clinical foundation

## After Submission

- Review typically takes 24-48 hours
- May take longer for health-related apps (up to 1 week)
- Be prepared to respond to reviewer questions
