// Test grief pattern detection
import { detectEnhancedCSSPatterns } from './server/services/css-pattern-service.js';

console.log('Testing grief pattern detection...\n');

// Test cases
const testCases = [
  {
    name: 'Pet dying',
    text: 'My dog Pickle is dying and I don\'t know what to do',
    expectedIntensity: ['high', 'critical']
  },
  {
    name: 'Pet passed away',
    text: 'My cat passed away yesterday and I can\'t stop crying',
    expectedIntensity: ['critical']
  },
  {
    name: 'Euthanasia decision',
    text: 'The vet said we need to euthanize my dog, she\'s suffering',
    expectedIntensity: ['critical']
  },
  {
    name: 'General grief',
    text: 'I\'m heartbroken and devastated. I miss them so much',
    expectedIntensity: ['high', 'critical']
  },
  {
    name: 'No grief patterns',
    text: 'I\'m feeling confused about what to do next',
    expectedIntensity: ['low', 'medium']
  }
];

console.log('Running tests...\n');

for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  console.log(`Text: "${testCase.text}"`);
  
  const patterns = detectEnhancedCSSPatterns(testCase.text, false);
  
  console.log(`Results:`);
  console.log(`  - Grief patterns detected: ${patterns.griefPatterns?.length || 0}`);
  if (patterns.griefPatterns && patterns.griefPatterns.length > 0) {
    console.log(`  - Grief pattern texts:`);
    patterns.griefPatterns.forEach(p => {
      console.log(`    * "${p.text}" (intensity: ${p.intensity})`);
    });
  }
  console.log(`  - Emotional intensity: ${patterns.emotionalIntensity}`);
  console.log(`  - Has warning flags: ${patterns.hasWarningFlags}`);
  console.log(`  - Distress level: ${patterns.distressLevel || 0}`);
  
  // Check if intensity meets expectations
  const intensityOk = testCase.expectedIntensity.includes(patterns.emotionalIntensity);
  console.log(`  - Test ${intensityOk ? 'PASSED ✅' : 'FAILED ❌'}: Expected intensity ${testCase.expectedIntensity.join(' or ')}, got ${patterns.emotionalIntensity}`);
  
  console.log('');
}

console.log('Testing complete!');