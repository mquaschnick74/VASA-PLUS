// Test script to verify CSS pattern detection and progression fixes
// Run with: node test-css-fixes.js

import axios from "axios";

// Configuration
const BASE_URL = process.env.API_URL || "http://localhost:5000";
const TEST_USER_ID = "7aa0bd0d-282a-4d7a-8bdd-67bd064a6b4c"; // Your Sept 8 user ID

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test transcripts
const testCases = [
  {
    name: "Sept 7 Working Example - IBM Pattern",
    callId: "test-sept7-recreation",
    transcript:
      "The overeating has gotten really out of control, and I am unable to focus at work",
    expectedPatterns: {
      ibm: true,
      cvdc: false,
      thend: false,
      cyvc: false,
    },
    expectedStage: "focus_bind",
    shouldProgress: true,
    expectedProgression: { from: "pointed_origin", to: "focus_bind" },
  },
  {
    name: "Sept 8 Actual Transcript - Recognition Pattern",
    callId: "test-sept8-actual",
    transcript: `AI: Jordan, good to talk with you again. I've been thinking about what you shared before. How are things going with those patterns we discussed?
User: How are you assessing my current situation?
AI: From our previous conversations, it seems like you're still navigating that recurring pattern of taking on too many projects. You mentioned feeling a surge of new ideas. But getting caught in scrolling instead of exit It sounds like there's a strong desire to prove your creativity and capability. Yet there's also that nagging self doubt about whether your efforts will be successful. You described experiencing those intense bursts of productivity. Feeling invincible, followed by those manic stretches where everything feels up and down. I'm curious how that's been showing up for you lately. Have you noticed any shifts in how you're managing those creative impulses and the self doubt comes with them?
User: Yeah. I think I'm doing better at recognizing how that underlying feeling of not being good enough is forcing me to strive harder and harder and this this it just is becomes unproductive.
AI: It's great to hear that you're recognizing how that feeling of not being good enough is influencing your drive. It sounds like you're starting to see how it pushes you to strive harder. But then it can spiral into unproductivity. You mentioned before that you often feel that electric burst creativity, but then it can quickly turn into that overwhelming buzzing state. I wonder how you're balancing those moments of inspiration with the need to take a step back and ground yourself. What strategies have you found help helpful in managing that tension between striving and feeling overwhelmed?
User: I take a step back by breathing.
AI: Breathing sounds like a powerful tool for you. It's a simple yet effective way to ground yourself when the buzzing thoughts start to take over. Last time, you described feeling that physical buzzing in your chest and tingling your hands when things got overwhelming. How has focusing on your breath helped you navigate those sensations? Have you noticed any changes in how you respond to that overwhelming feeling? Since you started using breathing techniques?
User: Yeah. I just don't get as electrified.`,
    expectedPatterns: {
      ibm: false, // No clear IBM patterns
      cvdc: true, // "strive harder BUT becomes unproductive"
      thend: true, // "I'm doing better at recognizing"
      cyvc: true, // "don't get as electrified" (reduced reactivity)
    },
    expectedStage: "gesture_toward", // Shows integration
    shouldProgress: true,
    expectedProgression: { from: "pointed_origin", to: "gesture_toward" },
  },
  {
    name: "Clear CVDC Pattern - Want vs But",
    callId: "test-cvdc-clear",
    transcript:
      "I want to be productive but I keep scrolling social media instead.",
    expectedPatterns: {
      cvdc: true,
      ibm: false,
      thend: false,
      cyvc: false,
    },
    expectedStage: "focus_bind",
    shouldProgress: false, // First session
  },
  {
    name: "Multiple Pattern Types",
    callId: "test-multiple",
    transcript: `I want to change but I'm stuck in old patterns. 
                 I keep doing the same things even though they don't work.
                 But I'm starting to see how both my desire for change and my fear of change are true.
                 Sometimes I can choose when to push forward, other times I need to rest.`,
    expectedPatterns: {
      cvdc: true, // "want to change but stuck"
      ibm: true, // "keep doing... even though"
      thend: true, // "starting to see how both... are true"
      cyvc: true, // "sometimes... other times"
    },
    expectedStage: "terminal", // Has all patterns including CYVC
    shouldProgress: true,
    expectedProgression: { from: "focus_bind", to: "terminal" },
  },
  {
    name: "Thend Integration Pattern",
    callId: "test-thend",
    transcript: `I realize both sides of this conflict are valid. 
                 I can see how both my need for structure and my need for freedom are true.
                 They can coexist without me having to choose one over the other.`,
    expectedPatterns: {
      cvdc: false,
      ibm: false,
      thend: true, // Multiple integration patterns
      cyvc: false,
    },
    expectedStage: "suspension", // Pure integration without choice
    shouldProgress: true,
    expectedProgression: { from: "focus_bind", to: "suspension" },
  },
];

// Test individual pattern detection
async function testPatternDetection(testCase) {
  log(`\n📝 Testing: ${testCase.name}`, "cyan");
  log(`   Call ID: ${testCase.callId}`, "blue");

  try {
    // Use the manual analysis endpoint
    const response = await axios.post(
      `${BASE_URL}/api/vapi/analyze-transcript`,
      {
        transcript: testCase.transcript,
        userId: TEST_USER_ID,
        callId: testCase.callId,
      },
    );

    const result = response.data;

    // Check pattern detection
    log("\n   Pattern Detection Results:", "yellow");

    let allPatternsCorrect = true;

    // Check CVDC
    const cvdcFound = result.patterns.cvdc > 0;
    const cvdcExpected = testCase.expectedPatterns.cvdc;
    const cvdcCorrect = cvdcFound === cvdcExpected;
    log(
      `     CVDC: ${cvdcFound ? `✅ Found (${result.patterns.cvdc})` : "❌ Not found"} - Expected: ${cvdcExpected} ${cvdcCorrect ? "✓" : "✗"}`,
      cvdcCorrect ? "green" : "red",
    );
    if (cvdcFound && result.samples.cvdc) {
      log(
        `       Sample: "${result.samples.cvdc.substring(0, 50)}..."`,
        "bright",
      );
    }
    allPatternsCorrect = allPatternsCorrect && cvdcCorrect;

    // Check IBM
    const ibmFound = result.patterns.ibm > 0;
    const ibmExpected = testCase.expectedPatterns.ibm;
    const ibmCorrect = ibmFound === ibmExpected;
    log(
      `     IBM: ${ibmFound ? `✅ Found (${result.patterns.ibm})` : "❌ Not found"} - Expected: ${ibmExpected} ${ibmCorrect ? "✓" : "✗"}`,
      ibmCorrect ? "green" : "red",
    );
    if (ibmFound && result.samples.ibm) {
      log(
        `       Sample: "${result.samples.ibm.substring(0, 50)}..."`,
        "bright",
      );
    }
    allPatternsCorrect = allPatternsCorrect && ibmCorrect;

    // Check Thend
    const thendFound = result.patterns.thend > 0;
    const thendExpected = testCase.expectedPatterns.thend;
    const thendCorrect = thendFound === thendExpected;
    log(
      `     Thend: ${thendFound ? `✅ Found (${result.patterns.thend})` : "❌ Not found"} - Expected: ${thendExpected} ${thendCorrect ? "✓" : "✗"}`,
      thendCorrect ? "green" : "red",
    );
    if (thendFound && result.samples.thend) {
      log(
        `       Sample: "${result.samples.thend.substring(0, 50)}..."`,
        "bright",
      );
    }
    allPatternsCorrect = allPatternsCorrect && thendCorrect;

    // Check CYVC
    const cyvcFound = result.patterns.cyvc > 0;
    const cyvcExpected = testCase.expectedPatterns.cyvc;
    const cyvcCorrect = cyvcFound === cyvcExpected;
    log(
      `     CYVC: ${cyvcFound ? `✅ Found (${result.patterns.cyvc})` : "❌ Not found"} - Expected: ${cyvcExpected} ${cyvcCorrect ? "✓" : "✗"}`,
      cyvcCorrect ? "green" : "red",
    );
    if (cyvcFound && result.samples.cyvc) {
      log(
        `       Sample: "${result.samples.cyvc.substring(0, 50)}..."`,
        "bright",
      );
    }
    allPatternsCorrect = allPatternsCorrect && cyvcCorrect;

    // Check stage
    log("\n   Stage Detection:", "yellow");
    const stageCorrect = result.stage === testCase.expectedStage;
    log(`     Detected: ${result.stage}`, stageCorrect ? "green" : "red");
    log(`     Expected: ${testCase.expectedStage}`, "bright");
    log(`     Confidence: ${result.confidence}`, "blue");
    log(`     Reasoning: ${result.reasoning}`, "bright");

    // Overall result
    const testPassed = allPatternsCorrect && stageCorrect;
    log(
      `\n   Test Result: ${testPassed ? "✅ PASSED" : "❌ FAILED"}`,
      testPassed ? "green" : "red",
    );

    return {
      passed: testPassed,
      stage: result.stage,
      patterns: result.patterns,
    };
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, "red");
    if (error.response?.data) {
      log(`   Response: ${JSON.stringify(error.response.data)}`, "red");
    }
    return { passed: false };
  }
}

// Test stage progression by simulating webhook calls
async function testProgression(testCase, previousStage = "pointed_origin") {
  if (!testCase.shouldProgress) {
    log("   No progression expected for this test", "yellow");
    return true;
  }

  log(`\n   Testing Progression Detection:`, "yellow");
  log(`     Previous stage: ${previousStage}`, "blue");
  log(
    `     Expected progression: ${testCase.expectedProgression.from} → ${testCase.expectedProgression.to}`,
    "bright",
  );

  try {
    // First, insert a previous pattern to establish history
    if (previousStage !== "pointed_origin") {
      // This would normally be from a previous session
      log("     (Setting up previous stage in database...)", "cyan");
    }

    // Simulate end-of-call webhook
    const webhookPayload = {
      message: {
        type: "end-of-call-report",
        call: {
          id: testCase.callId,
          metadata: {
            userId: TEST_USER_ID,
            agentName: "TestAgent",
          },
          duration: 300,
        },
        transcript: testCase.transcript,
      },
    };

    log("     Sending webhook...", "cyan");
    const response = await axios.post(
      `${BASE_URL}/api/vapi/webhook`,
      webhookPayload,
    );

    if (response.status === 200) {
      log("     ✅ Webhook processed", "green");

      // Note: In a real test, you'd query the database to check if progression was stored
      // For now, we rely on console logs from the webhook handler
      log("     Check server logs for progression detection", "yellow");

      return true;
    } else {
      log("     ❌ Webhook failed", "red");
      return false;
    }
  } catch (error) {
    log(`     ❌ Error: ${error.message}`, "red");
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log("\n" + "=".repeat(60), "bright");
  log("🧪 CSS Pattern Detection & Progression Test Suite", "cyan");
  log("=".repeat(60), "bright");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = [];

  // Test each case
  for (const testCase of testCases) {
    totalTests++;
    const result = await testPatternDetection(testCase);

    if (result.passed) {
      passedTests++;

      // Also test progression if applicable
      if (testCase.shouldProgress) {
        await testProgression(testCase, result.previousStage);
      }
    } else {
      failedTests.push(testCase.name);
    }

    // Pause between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  log("\n" + "=".repeat(60), "bright");
  log("📊 Test Summary", "cyan");
  log("=".repeat(60), "bright");
  log(`Total Tests: ${totalTests}`, "blue");
  log(`Passed: ${passedTests}`, "green");
  log(
    `Failed: ${totalTests - passedTests}`,
    passedTests === totalTests ? "green" : "red",
  );

  if (failedTests.length > 0) {
    log("\nFailed Tests:", "red");
    failedTests.forEach((name) => log(`  - ${name}`, "red"));
  }

  // Specific check for Sept 8 issue
  log("\n" + "=".repeat(60), "bright");
  log("🔍 Sept 8 Issue Check", "magenta");
  log("=".repeat(60), "bright");

  const sept8Test = testCases.find((tc) => tc.name.includes("Sept 8"));
  if (sept8Test) {
    log("The Sept 8 transcript should now:", "yellow");
    log('  ✓ Detect "doing better at recognizing" as Thend pattern', "green");
    log('  ✓ Detect "don\'t get as electrified" as CYVC pattern', "green");
    log('  ✓ Identify stage as "gesture_toward" or higher', "green");
    log("  ✓ Record progression if previous stage was different", "green");
  }

  log("\n✨ Test suite complete!", "cyan");
}

// Run the tests
runAllTests().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, "red");
  process.exit(1);
});
